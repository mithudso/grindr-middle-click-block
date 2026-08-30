// Settings, greetings and the block tiers — the persisted state the HUD edits.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');
const quiet = console.log; console.log = () => {}; console.warn = () => {};
require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

test('settings round-trip and reject unknown keys', () => {
  const s = globalThis.__grindrBlock_settings();
  assert.ok(['advance', 'chat', 'stay', 'grid'].includes(s.afterGreet));
  globalThis.__grindrBlock_settings('afterGreet', 'chat');
  assert.strictEqual(globalThis.__grindrBlock_settings().afterGreet, 'chat');
  assert.match(String(globalThis.__grindrBlock_settings('nope', 1)), /unknown setting/);
  globalThis.__grindrBlock_settings('afterGreet', 'advance');
});

test('greetings can be replaced and cleared back to the built-in list', () => {
  const before = globalThis.__grindrBlock_greetings();
  assert.strictEqual(before.custom, false, 'should start on the built-in list');
  assert.ok(before.active.length > 0);
  globalThis.__grindrBlock_greetings(['Hey there', 'What are you up to?']);
  const custom = globalThis.__grindrBlock_greetings();
  assert.strictEqual(custom.custom, true);
  assert.strictEqual(custom.active.length, 2);
  // Clearing must fall back, never leave nothing to send.
  globalThis.__grindrBlock_greetings([]);
  const after = globalThis.__grindrBlock_greetings();
  assert.strictEqual(after.custom, false);
  assert.deepStrictEqual(after.active, before.active);
});

test('block tiers stay internally consistent', () => {
  const t = globalThis.__grindrBlock_blockTiers();
  const st = globalThis.__grindrBlock_state();
  assert.strictEqual(t.pending.length + t.confirmed.length, st.localBlockListSize,
    'pending + confirmed must equal the whole local block list');
  assert.strictEqual(new Set([...t.pending, ...t.confirmed]).size,
    t.pending.length + t.confirmed.length, 'an id must not be in both tiers');
});

test('auto-drain reports and toggles', () => {
  const d = globalThis.__grindrBlock_autoDrain();
  for (const k of ['running', 'remaining', 'queued']) assert.ok(k in d, `missing ${k}`);
  globalThis.__grindrBlock_autoDrain(true);
  assert.strictEqual(globalThis.__grindrBlock_autoDrain().running, true);
  globalThis.__grindrBlock_autoDrain(false);
  assert.strictEqual(globalThis.__grindrBlock_autoDrain().running, false);
});

test('the diagnostic recorder captures and produces a report', () => {
  globalThis.__grindrBlock_record();
  assert.strictEqual(globalThis.__grindrBlock_hud().recording, true);
  const report = globalThis.__grindrBlock_saveReport();
  assert.match(report, /GrindrBlock diagnostic report/);
  assert.match(report, /keymap:/);
  assert.match(report, /timeline/);
});

// WHY: v0.63.0 added `autoOpenChat` to SETTINGS_OPTIONS but not to
// SETTINGS_DEFAULTS. settings.autoOpenChat was therefore undefined, the feature's
// first line bailed, and it could never run — while still appearing in the HUD,
// because the HUD renders from the options list. Nothing caught it.
// MUST: every option has a default, and every default is a valid option. The two
// lists are only meaningful together.
test('every setting option has a default, and every default is a valid option', () => {
  const s = globalThis.__grindrBlock_settings();
  const opts = s.options;
  for (const key of Object.keys(opts)) {
    assert.ok(key in s, `${key} is offered as an option but has no default — it would read as undefined`);
    assert.ok(opts[key].includes(s[key]),
      `the default for ${key} (${JSON.stringify(s[key])}) is not one of its options`);
  }
  for (const key of Object.keys(s)) {
    if (key === 'options') continue;
    assert.ok(key in opts, `${key} has a default but is offered nowhere, so it cannot be changed`);
  }
});
