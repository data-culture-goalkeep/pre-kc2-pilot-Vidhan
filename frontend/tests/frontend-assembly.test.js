'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');

const config = html.indexOf('src="config.js"');
const runtime = html.indexOf('src="runtime-config.js"');
const auth = html.indexOf('src="auth.js"');
const backend = html.indexOf('src="backend.js"');
const app = html.indexOf('src="app.js"');

assert.ok(config >= 0 && runtime > config, 'runtime config must load after safe defaults');
assert.ok(auth > runtime, 'auth client must load after runtime config');
assert.ok(backend > auth, 'backend must load after auth client');
assert.ok(app > backend, 'app must load after backend');
assert.equal(html.includes('demo.js'), false, 'demo module must not be loaded');
assert.equal(html.includes('Open DEMO workspace'), false, 'demo entry point must not exist');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
assert.ok(appSource.includes('Forgot password'), 'forgot-password entry point must exist');
assert.ok(appSource.includes('Set a new password'), 'set-new-password screen must exist');
assert.ok(appSource.includes('consumeRecoveryCallback'), 'recovery callback must run before normal bootstrap');
const configSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'config.js'), 'utf8');
assert.ok(configSource.includes('phase3Writes: false'), 'phase3 writes must be disabled by default');
assert.ok(appSource.includes('saveProgrammeAttendance'), 'phase3 write controls must include programme attendance');
assert.ok(appSource.includes('saveTherapyAttendance'), 'phase3 write controls must include therapy attendance');

console.log('frontend assembly tests passed');
