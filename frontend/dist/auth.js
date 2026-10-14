(() => {
  'use strict';

  const cfg = window.TAMAHAR_CONFIG || {};
  const storageKey = 'tamahar.supabase.session.v1';
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
  }

  async function refreshSession() {
    if (refreshPromise) return refreshPromise;
    if (!session?.refresh_token) return null;
    refreshPromise = (async () => {
      try {
        const payload = await authRequest('/token?grant_type=refresh_token', {
          body: {refresh_token: session.refresh_token}
        });
        const next = normalizeSession(payload);
        if (!next) throw new Error('Supabase returned an invalid refreshed session.');
        assertAuthorizedUser(next.user);
        writeStoredSession(next);
        return next;
      } catch (error) {
        writeStoredSession(null);
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
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
    const next = normalizeSession(payload);
    if (!next) throw new Error('Supabase returned an invalid session.');
    try {
      assertAuthorizedUser(next.user);
    } catch (error) {
      try {
        await authRequest('/logout', {accessToken: next.access_token});
      } catch {}
      throw error;
    }
    writeStoredSession(next);
    return next;
  }

  async function signOut() {
    const token = session?.access_token;
    writeStoredSession(null);
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

  window.TamaharAuth = {initialize, signIn, signOut, getAccessToken, getSession, getUser};
})();