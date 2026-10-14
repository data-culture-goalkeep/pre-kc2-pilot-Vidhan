(() => {
  'use strict';

  const cfg = window.TAMAHAR_CONFIG || {};
  const storageKey = 'tamahar.supabase.session.v1';
  const recoveryVerifierKey = 'tamahar.supabase.recovery.verifier.v1';
  const recoveryPendingKey = 'tamahar.supabase.recovery.pending.v1';
  let session = null;
  let refreshPromise = null;

  function authBase() {
    return String(cfg.supabaseUrl || '').replace(/\/$/, '') + '/auth/v1';
  }

  function safeParse(value) {
    try { return JSON.parse(value); } catch { return null; }
  }

  function readStoredSession() {
    try { return safeParse(window.localStorage?.getItem(storageKey)); } catch { return null; }
  }

  function writeStoredSession(value) {
    session = value || null;
    try {
      if (session) window.localStorage?.setItem(storageKey, JSON.stringify(session));
      else window.localStorage?.removeItem(storageKey);
    } catch {}
  }

  function setLocal(key, value) {
    try {
      if (value == null) window.localStorage?.removeItem(key);
      else window.localStorage?.setItem(key, String(value));
    } catch {}
  }

  function getLocal(key) {
    try { return window.localStorage?.getItem(key) || null; } catch { return null; }
  }

  function expiresSoon(value) {
    if (!value?.access_token) return true;
    const expiry = Number(value.expires_at || 0);
    return !expiry || expiry * 1000 <= Date.now() + 60000;
  }

  function normalizeSession(payload) {
    if (!payload?.access_token || !payload?.refresh_token) return null;
    const expiresIn = Number(payload.expires_in || 3600);
    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      token_type: payload.token_type || 'bearer',
      expires_in: expiresIn,
      expires_at: Number(payload.expires_at || Math.floor(Date.now() / 1000) + expiresIn),
      user: payload.user || null
    };
  }

  function authHeaders(accessToken) {
    const headers = {
      apikey: cfg.supabasePublishableKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }

  async function authRequest(path, options = {}) {
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
      throw new Error('Supabase runtime configuration is unavailable.');
    }
    const res = await fetch(`${authBase()}${path}`, {
      method: options.method || 'POST',
      headers: authHeaders(options.accessToken),
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let payload = {};
    try { payload = await res.json(); } catch {}
    if (!res.ok) {
      const message = payload.msg || payload.message || payload.error_description || payload.error || res.statusText;
      const error = new Error(message || 'Authentication request failed');
      error.status = res.status;
      error.code = payload.code || payload.error_code || null;
      throw error;
    }
    return payload;
  }

  function tamaharClaims(user) {
    return user?.app_metadata?.tamahar || null;
  }

  function assertAuthorizedUser(user) {
    const claims = tamaharClaims(user);
    if (!claims || String(claims.enabled) !== 'true') {
      const error = new Error('Your account is authenticated but is not enabled for the Tamahar workspace.');
      error.code = 'tamahar_access_not_enabled';
      throw error;
    }
    const role = String(claims.role || '');
    const allowedRoles = new Set(['administrator','management','programme_manager','teacher','therapist']);
    if (!allowedRoles.has(role)) {
      const error = new Error('Your account is enabled but has no approved Tamahar staff role.');
      error.code = 'tamahar_role_missing';
      throw error;
    }
    if (!['administrator','management'].includes(role)) {
      const programmes = Array.isArray(claims.programmes) ? claims.programmes.filter(Boolean) : [];
      const childIds = Array.isArray(claims.child_ids) ? claims.child_ids.filter(Boolean) : [];
      if (!programmes.length && !(['teacher','therapist'].includes(role) && childIds.length)) {
        const error = new Error('Your account has no approved Tamahar programme or child scope.');
        error.code = 'tamahar_scope_missing';
        throw error;
      }
    }
  }

  async function fetchUser(accessToken) {
    return authRequest('/user', {method:'GET', accessToken});
  }

  async function completeSession(payload) {
    let next = normalizeSession(payload);
    if (!next) throw new Error('Supabase returned an invalid session.');
    if (!next.user) {
      next.user = await fetchUser(next.access_token);
    }
    assertAuthorizedUser(next.user);
    writeStoredSession(next);
    return next;
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    if (!session?.refresh_token) return null;
    refreshPromise = (async () => {
      try {
        const payload = await authRequest('/token?grant_type=refresh_token', {
          body: {refresh_token: session.refresh_token}
        });
        return await completeSession(payload);
      } catch (error) {
        writeStoredSession(null);
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  function callbackParams() {
    const query = new URLSearchParams(window.location?.search || '');
    const hash = new URLSearchParams(String(window.location?.hash || '').replace(/^#/, ''));
    return {query, hash};
  }

  function clearCallbackUrl() {
    try {
      const path = window.location?.pathname || '/';
      window.history?.replaceState?.({}, '', path);
    } catch {}
  }

  function recoveryError(params) {
    const source = params.hash.get('error') ? params.hash : params.query;
    const code = source.get('error_code') || source.get('error') || null;
    if (!code) return null;
    return {
      kind:'error',
      code,
      message: source.get('error_description') || 'The password-recovery link is invalid or has expired.'
    };
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function randomVerifier() {
    const bytes = new Uint8Array(48);
    window.crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  }

  async function codeChallenge(verifier) {
    const bytes = new TextEncoder().encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return bytesToBase64Url(new Uint8Array(digest));
  }

  function recoveryRedirectUrl() {
    if (cfg.recoveryRedirectUrl) return String(cfg.recoveryRedirectUrl);
    const origin = window.location?.origin || '';
    const path = window.location?.pathname || '/';
    return `${origin}${path}`;
  }

  async function requestPasswordReset(email) {
    const address = String(email || '').trim();
    if (!address) throw new Error('Enter your email address.');
    const verifier = randomVerifier();
    const challenge = await codeChallenge(verifier);
    setLocal(recoveryVerifierKey, verifier);
    setLocal(recoveryPendingKey, null);
    try {
      const redirect = encodeURIComponent(recoveryRedirectUrl());
      await authRequest(`/recover?redirect_to=${redirect}`, {
        body: {
          email: address,
          code_challenge: challenge,
          code_challenge_method: 's256'
        }
      });
    } catch (error) {
      setLocal(recoveryVerifierKey, null);
      throw error;
    }
    return {sent:true};
  }

  async function recoveryFromPkce(code) {
    const verifier = getLocal(recoveryVerifierKey);
    if (!verifier) {
      const error = new Error('This recovery link cannot be completed in this browser because its PKCE verifier is missing. Request a new password-reset email from this browser.');
      error.code = 'missing_pkce_verifier';
      throw error;
    }
    const payload = await authRequest('/token?grant_type=pkce', {
      body: {auth_code: code, code_verifier: verifier}
    });
    setLocal(recoveryVerifierKey, null);
    setLocal(recoveryPendingKey, 'true');
    return completeSession(payload);
  }

  async function recoveryFromTokenHash(tokenHash) {
    const payload = await authRequest('/verify', {
      body: {type:'recovery', token_hash:tokenHash}
    });
    setLocal(recoveryPendingKey, 'true');
    return completeSession(payload);
  }

  async function recoveryFromImplicit(hash) {
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (!accessToken || !refreshToken) return null;
    const payload = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: hash.get('token_type') || 'bearer',
      expires_in: Number(hash.get('expires_in') || 3600),
      expires_at: Number(hash.get('expires_at') || 0) || undefined
    };
    setLocal(recoveryPendingKey, 'true');
    return completeSession(payload);
  }

  async function consumeRecoveryCallback() {
    const params = callbackParams();
    const callbackError = recoveryError(params);
    if (callbackError) {
      setLocal(recoveryPendingKey, null);
      setLocal(recoveryVerifierKey, null);
      clearCallbackUrl();
      return callbackError;
    }

    try {
      const type = params.query.get('type') || params.hash.get('type');
      const code = params.query.get('code');
      const tokenHash = params.query.get('token_hash') || params.hash.get('token_hash');

      if (code) {
        const next = await recoveryFromPkce(code);
        clearCallbackUrl();
        return {kind:'recovery', session:next};
      }
      if (tokenHash && type === 'recovery') {
        const next = await recoveryFromTokenHash(tokenHash);
        clearCallbackUrl();
        return {kind:'recovery', session:next};
      }
      if (type === 'recovery' && params.hash.get('access_token')) {
        const next = await recoveryFromImplicit(params.hash);
        clearCallbackUrl();
        return {kind:'recovery', session:next};
      }

      if (getLocal(recoveryPendingKey) === 'true') {
        session = readStoredSession();
        if (session) return {kind:'recovery', session};
        setLocal(recoveryPendingKey, null);
      }
      return {kind:'none'};
    } catch (error) {
      setLocal(recoveryPendingKey, null);
      clearCallbackUrl();
      return {
        kind:'error',
        code:error?.code || 'recovery_failed',
        message:error?.message || 'The password-recovery link could not be verified.'
      };
    }
  }

  async function updatePassword(password) {
    const nextPassword = String(password || '');
    if (nextPassword.length < 8) {
      throw new Error('Use a password with at least 8 characters.');
    }
    if (!session) session = readStoredSession();
    if (!session?.access_token) throw new Error('The password-recovery session is missing or expired.');
    const user = await authRequest('/user', {
      method:'PUT',
      accessToken:session.access_token,
      body:{password:nextPassword}
    });
    session.user = user || session.user;
    writeStoredSession(session);
    setLocal(recoveryPendingKey, null);
    setLocal(recoveryVerifierKey, null);
    return user;
  }

  async function initialize() {
    session = readStoredSession();
    if (!session) return null;
    try {
      if (expiresSoon(session)) await refreshSession();
      else assertAuthorizedUser(session.user);
      return session;
    } catch {
      writeStoredSession(null);
      return null;
    }
  }

  async function signIn(email, password) {
    const payload = await authRequest('/token?grant_type=password', {
      body: {email: String(email || '').trim(), password: String(password || '')}
    });
    try {
      return await completeSession(payload);
    } catch (error) {
      try {
        const token = payload?.access_token;
        if (token) await authRequest('/logout', {accessToken: token});
      } catch {}
      throw error;
    }
  }

  async function signOut() {
    const token = session?.access_token;
    writeStoredSession(null);
    setLocal(recoveryPendingKey, null);
    setLocal(recoveryVerifierKey, null);
    if (!token) return;
    try { await authRequest('/logout', {accessToken: token}); } catch {}
  }

  async function getAccessToken() {
    if (!session) session = readStoredSession();
    if (!session) return null;
    if (expiresSoon(session)) {
      try { await refreshSession(); } catch { return null; }
    }
    return session?.access_token || null;
  }

  function getSession() {
    return session;
  }

  function getUser() {
    return session?.user || null;
  }

  window.TamaharAuth = {
    initialize,
    signIn,
    signOut,
    requestPasswordReset,
    consumeRecoveryCallback,
    updatePassword,
    getAccessToken,
    getSession,
    getUser
  };
})();