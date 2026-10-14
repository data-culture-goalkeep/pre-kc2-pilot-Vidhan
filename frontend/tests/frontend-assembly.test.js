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
assert.ok(auth > runtime, 'optional session helper must load after runtime config');
assert.ok(backend > auth, 'backend must load after optional session helper');
assert.ok(app > backend, 'app must load after backend');
assert.equal(html.includes('demo.js'), false, 'demo module must not be loaded');
assert.equal(html.includes('Open DEMO workspace'), false, 'demo entry point must not exist');

console.log('frontend assembly tests passed');
