// Boot the userscript under stubs and assert the public surface exists.
// This is the highest-value test in the suite: a syntax check only proves the
// file parses, while this proves the IIFE runs to completion and installs
// everything. Several shipped bugs were "the script died at document-start".
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');
const SCRIPT = path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js');

const listeners = {};
globalThis.document.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
const quiet = console.log; console.log = () => {};
require(SCRIPT);
console.log = quiet;

test('IIFE runs to completion and installs a keydown listener', () => {
  assert.ok(listeners.keydown && listeners.keydown.length >= 1, 'no keydown listener installed');
});

test('console API is published', () => {
  const api = Object.keys(globalThis).filter((k) => k.startsWith('__grindrBlock_'));
  assert.ok(api.length > 30, `expected the full console surface, got ${api.length}`);
  for (const fn of ['__grindrBlock_why', '__grindrBlock_hotkeys', '__grindrBlock_state',
                    '__grindrBlock_settings', '__grindrBlock_greetings', '__grindrBlock_blockTiers',
                    '__grindrBlock_disable', '__grindrBlock_enable']) {
    assert.strictEqual(typeof globalThis[fn], 'function', `${fn} missing`);
  }
});

test('acting functions are disarmed until armed, kill switch is not', () => {
  assert.strictEqual(globalThis.__grindrBlock_greet('123456789'), undefined,
    'greet should refuse while disarmed');
  assert.strictEqual(typeof globalThis.__grindrBlock_disable, 'function',
    'the kill switch must never be gated');
  globalThis.__grindrBlock_arm();
  assert.strictEqual(typeof globalThis.__grindrBlock_greet, 'function');
});

test('why() reports the preconditions the action keys depend on', () => {
  const w = globalThis.__grindrBlock_why();
  for (const k of ['disabled', 'hotkeysEnabled', 'where', 'greetMode', 'resolvedTarget']) {
    assert.ok(k in w, `why() missing ${k}`);
  }
});
