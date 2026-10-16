'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const {TextEncoder} = require('node:util');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'auth.js'), 'utf8');

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

function buildContext(fetchImpl, storage = makeStorage(), locationOverrides = {}) {
  const location = {
    origin: 'https://pilot.example',
    pathname: '/',
    search: '',
    hash: '',
    ...locationOverrides
  };
  const context = {
    console,
    Date,
    JSON,
    URLSearchParams,
    Uint8Array,
    TextEncoder,
    fetch: fetchImpl,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    window: {
      localStorage: storage,
      crypto: nodeCrypto.webcrypto,
      location,
      history: {
        replaceState(_state, _title, next) {
          location.search = '';
          location.hash = '';
          location.pathname = next || location.pathname;
        }
      },
      TAMAHAR_CONFIG: {
        supabaseUrl: 'https://example.supabase.co',
        supabasePublishableKey: 'sb_publishable_test'
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {auth: context.window.TamaharAuth, storage, location};
}

function authorizedPayload(overrides = {}) {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: 'user-1',
      email: 'staff@example.org',
      app_metadata: {
        tamahar: {
          enabled: true,
          role: 'administrator'
        }
      }
    },
    ...overrides
  };
}

async function testSignInAndToken() {
  let request;
  const {auth} = buildContext(async (url, options) => {
    request = {url: String(url), options};
    return {
      ok: true,
      status: 200,
      async json() { return authorizedPayload(); }
    };
  });

  const session = await auth.signIn('staff@example.org', 'not-a-real-password');
  assert.equal(session.user.email, 'staff@example.org');
  assert.match(request.url, /auth\/v1\/token\?grant_type=password$/);
  assert.equal(JSON.parse(request.options.body).email, 'staff@example.org');
  assert.equal(await auth.getAccessToken(), 'access-token');
}

async function testPasswordRecoveryRequestUsesPkce() {
  let request;
  const storage = makeStorage();
  const {auth} = buildContext(async (url, options) => {
    request = {url:String(url), options};
    return {ok:true,status:200,async json(){ return {}; }};
  }, storage);

  const result = await auth.requestPasswordReset('staff@example.org');
  assert.equal(result.sent, true);
  assert.match(request.url, /auth\/v1\/recover\?redirect_to=https%3A%2F%2Fpilot\.example%2F$/);
  const body = JSON.parse(request.options.body);
  assert.equal(body.email, 'staff@example.org');
  assert.equal(body.code_challenge_method, 's256');
  assert.ok(body.code_challenge.length > 20);
  assert.ok(storage.getItem('tamahar.supabase.recovery.verifier.v1'));
}

async function testExpiredRecoveryLinkIsSurfaced() {
  const {auth,location} = buildContext(
    async () => { throw new Error('fetch should not be called'); },
    makeStorage(),
    {
      hash:'#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    }
  );

  const result = await auth.consumeRecoveryCallback();
  assert.equal(result.kind, 'error');
  assert.equal(result.code, 'otp_expired');
  assert.match(result.message, /invalid or has expired/i);
  assert.equal(location.hash, '');
}

async function testImplicitRecoveryAndPasswordUpdate() {
  const requests = [];
  const {auth} = buildContext(async (url, options = {}) => {
    requests.push({url:String(url),options});
    if (String(url).endsWith('/auth/v1/user') && options.method === 'GET') {
      return {ok:true,status:200,async json(){ return authorizedPayload().user; }};
    }
    if (String(url).endsWith('/auth/v1/user') && options.method === 'PUT') {
      return {ok:true,status:200,async json(){ return authorizedPayload().user; }};
    }
    return {ok:false,status:400,statusText:'Unexpected request',async json(){ return {message:'Unexpected request'}; }};
  }, makeStorage(), {
    hash:'#type=recovery&access_token=recovery-access&refresh_token=recovery-refresh&expires_in=3600'
  });

  const recovery = await auth.consumeRecoveryCallback();
  assert.equal(recovery.kind, 'recovery');
  assert.equal(await auth.getAccessToken(), 'recovery-access');

  const user = await auth.updatePassword('new-password-123');
  assert.equal(user.email, 'staff@example.org');
  const update = requests.find(x => x.options.method === 'PUT');
  assert.ok(update);
  assert.equal(update.options.headers.Authorization, 'Bearer recovery-access');
  assert.deepEqual(JSON.parse(update.options.body), {password:'new-password-123'});
}

async function testUnauthorizedClaimsRejected() {
  const {auth} = buildContext(async () => ({
    ok: true,
    status: 200,
    async json() {
      return authorizedPayload({
        user: {id:'user-2', app_metadata:{tamahar:{enabled:false}}}
      });
    }
  }));
  await assert.rejects(
    auth.signIn('disabled@example.org', 'irrelevant'),
    /not enabled for the Tamahar workspace/
  );
  assert.equal(auth.getSession(), null);
}

async function testMissingRoleRejected() {
  const {auth} = buildContext(async () => ({
    ok: true,
    status: 200,
    async json() {
      return authorizedPayload({
        user: {id:'user-role-missing', app_metadata:{tamahar:{enabled:true}}}
      });
    }
  }));
  await assert.rejects(
    auth.signIn('role-missing@example.org', 'irrelevant'),
    /no approved Tamahar staff role/
  );
}

async function testMissingScopeRejected() {
  const {auth} = buildContext(async () => ({
    ok: true,
    status: 200,
    async json() {
      return authorizedPayload({
        user: {id:'user-scope-missing', app_metadata:{tamahar:{enabled:true,role:'programme_manager',programmes:[]}}}
      });
    }
  }));
  await assert.rejects(
    auth.signIn('scope-missing@example.org', 'irrelevant'),
    /no approved Tamahar programme or child scope/
  );
}

async function testSessionRestorationAndRefresh() {
  const expired = authorizedPayload({
    access_token: 'old-token',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) - 10
  });
  const storage = makeStorage({
    'tamahar.supabase.session.v1': JSON.stringify(expired)
  });
  let refreshSeen = false;
  const {auth} = buildContext(async (url, options) => {
    assert.match(String(url), /grant_type=refresh_token/);
    assert.equal(JSON.parse(options.body).refresh_token, 'refresh-token');
    refreshSeen = true;
    return {
      ok: true,
      status: 200,
      async json() { return authorizedPayload({access_token:'new-token'}); }
    };
  }, storage);

  const session = await auth.initialize();
  assert.equal(refreshSeen, true);
  assert.equal(session.access_token, 'new-token');
  assert.equal(await auth.getAccessToken(), 'new-token');
}

async function main() {
  await testSignInAndToken();
  await testPasswordRecoveryRequestUsesPkce();
  await testExpiredRecoveryLinkIsSurfaced();
  await testImplicitRecoveryAndPasswordUpdate();
  await testUnauthorizedClaimsRejected();
  await testMissingRoleRejected();
  await testMissingScopeRejected();
  await testSessionRestorationAndRefresh();
  console.log('auth-client tests passed');
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
