'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');

const config = html.indexOf('src="config.js"');
const runtime = html.indexOf('src="runtime-config.js"');
const auth = html.indexOf('src="auth.js"');
const backend = html.indexOf('src="backend.js"');
const demo = html.indexOf('src="demo.js"');
const app = html.indexOf('src="app.js"');

assert.ok(config >= 0 && runtime > config, 'runtime config must load after safe defaults');
assert.ok(auth > runtime, 'auth must load after runtime config');
assert.ok(backend > auth, 'backend must load after auth');
assert.ok(demo > backend, 'demo module must load after backend');
assert.ok(app > demo, 'app must load last');

console.log('frontend assembly tests passed');
