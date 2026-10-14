'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dist', 'auth.js'), 'utf8');

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

function buildContext(fetchImpl, storage = makeStorage()) {
  const context = {
    console,
    Date,
    JSON,
    fetch: fetchImpl,
    window: {
      localStorage: storage,
      TAMAHAR_CONFIG: {
        supabaseUrl: 'https://example.supabase.co',
        supabasePublishableKey: 'sb_publishable_test'
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {auth: context.window.TamaharAuth, storage};
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
          role: 'teacher',
          programmes: ['EI'],
          child_ids: ['CH001']
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
