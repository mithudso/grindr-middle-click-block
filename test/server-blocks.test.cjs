// The drain backlog's subtrahend, and why it has to survive a reload.
//
// WHY THIS FILE EXISTS: the reconcile button's number "kept going up". The
// backlog is `blockedProfileIds \ serverBlockedIds`. blockedProfileIds is
// persisted; serverBlockedIds was not. So every page load reset the subtrahend to
// empty and the backlog was recomputed as the ENTIRE local block list — including
// everything already upgraded in earlier sessions. It could never trend down
// across reloads, only track the growth of the local list. The drain then spent
// its whole hourly budget re-blocking profiles Grindr already held.
//
// Evidence: a capture shows 26 of our own successful `POST /api/v3/me/blocks/*`
// alongside `queued 25 hide→block upgrade(s); 1143 remaining` — a backlog that had
// risen from 971 after an earlier fix, while blocks were demonstrably landing.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');
const quiet = console.log; console.log = () => {}; console.warn = () => {};
const H = require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

// ── parseServerBlocksSnapshot ───────────────────────────────────────────────
// WHY: guards what gets restored into serverBlockedIds on load.
// MUST: a good snapshot round-trips; anything doubtful reads as null (no
// snapshot), NEVER as an empty snapshot. The distinction is the whole point —
// null means "we don't know yet, hold the drain", empty means "Grindr holds
// nothing", which would send the drain through the entire list again.
test('a well-formed snapshot round-trips', () => {
  const f = H.parseServerBlocksSnapshot;
  const snap = f(JSON.stringify({ ids: ['600000001', '600000002'], at: 1234 }));
  assert.deepStrictEqual(snap, { ids: ['600000001', '600000002'], at: 1234 });
});

test('an empty-but-valid snapshot is preserved as empty, not rejected', () => {
  // Legitimately possible: a brand-new account Grindr holds no blocks for.
  const snap = H.parseServerBlocksSnapshot(JSON.stringify({ ids: [], at: 5 }));
  assert.deepStrictEqual(snap, { ids: [], at: 5 });
});

test('anything doubtful reads as null, never as an empty snapshot', () => {
  const f = H.parseServerBlocksSnapshot;
  for (const [raw, why] of [
    [null, 'absent key'],
    ['', 'empty string'],
    ['not json', 'unparseable'],
    ['[]', 'a bare array — the pre-v0.54 shape, not ours'],
    ['{}', 'no ids field'],
    [JSON.stringify({ ids: 'nope' }), 'ids is not an array'],
    [JSON.stringify({ ids: [600000001] }), 'numeric ids — ours are strings, and Set membership is by type'],
    [JSON.stringify({ ids: ['600000001', null] }), 'one bad entry'],
    [JSON.stringify({ ids: ['600000001', 'abc'] }), 'a non-numeric id'],
  ]) {
    assert.strictEqual(f(raw), null, `${why} must read as "no snapshot"`);
  }
});

test('a missing timestamp degrades to 0 rather than rejecting the snapshot', () => {
  // The ids are what matter; `at` is only for reporting how stale the picture is.
  const snap = H.parseServerBlocksSnapshot(JSON.stringify({ ids: ['600000001'] }));
  assert.deepStrictEqual(snap, { ids: ['600000001'], at: 0 });
});

// MUST: partial corruption is total corruption. Restoring a subset would silently
// under-report what Grindr holds, which inflates the backlog — the same failure
// the persistence was added to fix, just quieter.
test('a partially corrupt id list is rejected whole, not silently filtered', () => {
  const raw = JSON.stringify({ ids: ['600000001', '600000002', 'junk'], at: 1 });
  assert.strictEqual(H.parseServerBlocksSnapshot(raw), null,
    'dropping only the bad entry would under-report Grindr\'s blocks and inflate the backlog');
});
