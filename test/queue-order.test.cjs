// Block-queue ordering and the split hourly budget.
//
// WHY THIS FILE EXISTS: a capture of "blocks are not working at all" showed they
// were never failing. One shared rolling-hour budget let the auto-drain — a
// background migration of ~1400 entries that runs continuously — reach the cap on
// its own, and the queue then paused wholesale:
//
//     [warn] [GrindrBlock] Hourly cap (500) hit, waiting 48m
//
// So a block pressed by hand sat behind a 48-minute wait with no error anywhere.
// The two rules below are what prevent that. Both are pure, so they can be pinned
// here rather than re-derived from a live session.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');
const quiet = console.log; console.log = () => {}; console.warn = () => {};
const H = require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

// Mirror of what enqueueAction does, so a test can build a realistic queue.
function enqueue(queue, job) {
  queue.splice(H.queueInsertIndex(queue, job.bulk), 0, job);
  return queue;
}
const manual = (id) => ({ profileId: id, action: 'block', bulk: false });
const bulk = (id) => ({ profileId: id, action: 'block', bulk: true });

// ── queueInsertIndex ────────────────────────────────────────────────────────
// WHY: decides where a newly enqueued job lands. The v0.52.0 version spliced an
// interactive job merely ahead of the FIRST bulk job, which put it behind every
// older interactive job — so pressing block twice made the second press wait on
// the first.
// MUST: bulk appends at the end; interactive always lands at index 0.
test('queueInsertIndex sends bulk to the back and interactive to the front', () => {
  const q = [bulk('600000001'), bulk('600000002')];
  assert.strictEqual(H.queueInsertIndex(q, true), 2, 'bulk appends');
  assert.strictEqual(H.queueInsertIndex(q, false), 0, 'interactive goes to the front');
  assert.strictEqual(H.queueInsertIndex([], true), 0, 'empty queue: append is index 0');
  assert.strictEqual(H.queueInsertIndex([], false), 0, 'empty queue: front is index 0');
});

// MUST: the newest interactive press runs next — LIFO among interactive jobs, and
// ahead of all bulk work regardless of when the bulk was queued.
test('a block you just pressed is next, ahead of the drain and of older presses', () => {
  const q = [];
  for (let i = 1; i <= 3; i++) enqueue(q, bulk('60000000' + i));   // drain backlog first
  enqueue(q, manual('400000001'));                                 // then you press block
  enqueue(q, manual('400000002'));                                 // then you press again
  assert.deepStrictEqual(
    q.map((j) => j.profileId),
    ['400000002', '400000001', '600000001', '600000002', '600000003'],
    'newest press first, then the older press, then the drain in FIFO order');
  assert.ok(q.findIndex((j) => j.bulk) > q.map((j) => j.bulk).lastIndexOf(false),
    'every interactive job precedes every bulk job');
});

// ── the two budgets ─────────────────────────────────────────────────────────
// WHY: the split is only safe if the two halves still sum to the ceiling that was
// chosen to keep Grindr from force-logging-out the session. If a later edit raises
// one half without lowering the other, the real burst rate doubles silently.
// MUST: manual + drain == MAX_PER_HOUR, and neither half is zero.
test('the split budgets still sum to the original hourly ceiling', () => {
  assert.strictEqual(H.MANUAL_HOURLY_CAP + H.DRAIN_HOURLY_CAP, H.MAX_PER_HOUR,
    'the two windows together must never exceed the rate the ceiling was set for');
  assert.ok(H.DRAIN_HOURLY_CAP > 0, 'a zero drain budget would stall the migration forever');
  assert.ok(H.MANUAL_HOURLY_CAP > 0, 'a zero manual budget would make blocking impossible');
});

// ── nextRunnableIndex ───────────────────────────────────────────────────────
// WHY: this is the rule that broke. It decides which job runs given both retry
// backoff and budget state.
// MUST: a spent DRAIN budget must never delay an interactive job.
test('a spent drain budget does not delay a block you pressed (the v0.51.0 bug)', () => {
  const now = 1_000_000;
  const q = [bulk('600000001'), bulk('600000002'), manual('400000001')];
  const i = H.nextRunnableIndex(q, now, /* manualCapped */ false, /* bulkCapped */ true);
  assert.strictEqual(i, 2, 'the interactive job runs even though the drain is capped');
  assert.strictEqual(q[i].profileId, '400000001');
});

// MUST: a spent budget blocks only its own bucket, in both directions.
test('each budget gates only its own jobs', () => {
  const now = 1_000_000;
  const q = [manual('400000001'), bulk('600000001')];
  assert.strictEqual(H.nextRunnableIndex(q, now, true, false), 1,
    'manual capped → the drain job is still runnable');
  assert.strictEqual(H.nextRunnableIndex(q, now, false, false), 0,
    'nothing capped → first job wins');
  assert.strictEqual(H.nextRunnableIndex(q, now, true, true), -1,
    'both capped → nothing runs');
});

// MUST: retry backoff is still honoured, and is independent of the budget check.
// A job may be skipped for either reason; being runnable requires both.
test('nextRunnableIndex still honours a per-job retry backoff', () => {
  const now = 1_000_000;
  const backedOff = { ...manual('400000001'), notBefore: now + 30_000 };
  const ready = manual('400000002');
  assert.strictEqual(H.nextRunnableIndex([backedOff, ready], now, false, false), 1,
    'skip the job still backing off, take the one behind it');
  assert.strictEqual(H.nextRunnableIndex([backedOff], now, false, false), -1,
    'a lone backing-off job means nothing is runnable');
  assert.strictEqual(H.nextRunnableIndex([{ ...backedOff, notBefore: now }], now, false, false), 0,
    'notBefore exactly now is ready — the comparison is inclusive');
});

// ── windowResetMinutes ──────────────────────────────────────────────────────
// WHY: the HUD's "frees 1 in Nm". The budgets are rolling windows, not buckets
// that empty on the hour, so the next slot appears when the OLDEST call in that
// window ages out — not at some fixed reset time. Getting this wrong reads to a
// user as the cooldown being broken.
// MUST: round UP, so a window with seconds left never reports 0m and claims to
// have reset; and report 0 when the window is empty.
test('windowResetMinutes reports when the next slot frees, rounding up', () => {
  const f = H.windowResetMinutes;
  const HOUR = 3_600_000;
  const now = 1_000_000_000;
  assert.strictEqual(f(undefined, now), 0, 'an empty window has nothing to wait for');
  assert.strictEqual(f(0, now), 0, 'no timestamp means nothing to wait for');
  assert.strictEqual(f(now, now), 60, 'a call made right now frees in a full hour');
  assert.strictEqual(f(now - HOUR / 2, now), 30, 'half an hour in, half an hour to go');
  assert.strictEqual(f(now - HOUR + 40_000, now), 1,
    '40s remaining must round up to 1m — reporting 0m would claim it had already reset');
  assert.strictEqual(f(now - HOUR, now), 0, 'exactly an hour old has aged out');
  assert.strictEqual(f(now - 2 * HOUR, now), 0, 'never negative for a stale entry');
});
