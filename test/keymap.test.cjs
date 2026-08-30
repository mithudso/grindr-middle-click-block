// Hotkey routing and rebinding. Insert turned out to be unsendable on Apple
// keyboards and F8 is a media key, so bindings became alias lists and then
// user-rebindable; these tests pin that behaviour.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');

const listeners = {};
globalThis.document.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
const quiet = console.log; console.log = () => {}; console.warn = () => {};
require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

const fire = (key, opts = {}) => {
  let prevented = false;
  const ev = Object.assign({ key, target: null, repeat: false,
    preventDefault() { prevented = true; }, stopPropagation() {} }, opts);
  for (const fn of listeners.keydown) fn(ev);
  return prevented;
};

test('every default binding is reported', () => {
  const keys = globalThis.__grindrBlock_hotkeys().keys;
  assert.match(keys.greet, /Insert/);
  assert.strictEqual(keys.album, 'Delete');
  assert.strictEqual(keys.block, 'Home');
  assert.strictEqual(keys.hide, 'End');
  assert.strictEqual(keys.prev, 'PageUp');
  assert.strictEqual(keys.next, 'PageDown');
});

test('unbound keys pass straight through', () => {
  assert.strictEqual(fire('q'), false);
  assert.strictEqual(fire('Backspace'), false);
});

test('a key with no resolvable target does not swallow the keystroke', () => {
  // No DOM, so nothing resolves — the key must keep its native behaviour.
  assert.strictEqual(fire('Home'), false, 'block swallowed a key it could not act on');
  assert.strictEqual(fire('PageDown'), false, 'nav swallowed a key with nothing to navigate');
});

test('rebinding takes effect and can be reset', () => {
  globalThis.__grindrBlock_setKey('greet', '`');
  assert.strictEqual(globalThis.__grindrBlock_hotkeys().keys.greet, '`');
  globalThis.__grindrBlock_resetKeys();
  assert.match(globalThis.__grindrBlock_hotkeys().keys.greet, /Insert/);
});
