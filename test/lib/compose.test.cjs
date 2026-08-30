const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let CO;
test.before(async () => { CO = await import('../../lib/compose.js'); });

const btn = (label) => ({ tagName: 'BUTTON', disabled: false, getAttribute: (k) => (k === 'aria-label' ? label : null) });

test('findSendButton rejects "send location" and accepts "Send"', () => {
  const sendLoc = btn('send location');
  const send = btn('Send');
  const composer = { parentElement: { querySelectorAll: () => [sendLoc, send], parentElement: null } };
  assert.strictEqual(CO.findSendButton(composer), send);
});

test('isDrawerComposer detects a drawer control ancestor', () => {
  const drawerScope = { querySelector: (sel) => (/close drawer/.test(sel) ? {} : null), parentElement: null };
  const drawerComposer = { parentElement: drawerScope };
  assert.strictEqual(CO.isDrawerComposer(drawerComposer), true);
  const profileComposer = { parentElement: { querySelector: () => null, parentElement: null } };
  assert.strictEqual(CO.isDrawerComposer(profileComposer), false);
});

test('fill sets value and confirmCleared reflects it', () => {
  const c = { value: '', dispatchEvent: () => {} };
  CO.fill(c, 'hey');
  assert.strictEqual(c.value, 'hey');
  assert.strictEqual(CO.confirmCleared(c), false);
  c.value = '';
  assert.strictEqual(CO.confirmCleared(c), true);
});
