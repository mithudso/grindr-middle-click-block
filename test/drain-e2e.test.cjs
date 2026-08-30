// Does the drain actually drain? An end-to-end check against a fake Grindr.
//
// WHY THIS FILE EXISTS: three separate fixes to the hide→block drain were each
// declared done on the strength of a code reading — cap starvation (v0.52/0.53),
// the page-1-only walk (v0.51), the unpersisted baseline (v0.54) — and the
// backlog kept climbing anyway. Every one of those was a real bug. None of them
// was ever shown to leave a queue that reaches zero, because nothing in the suite
// ran the queue.
//
// So this file boots the real script against a stubbed Grindr and asserts the one
// property that actually matters: the backlog reaches 0 and stays there. It uses
// the real processQueue, the real reconcile walk, the real pagination, and the
// real budgets. The only fake is the network.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');

// ── the fake Grindr ─────────────────────────────────────────────────────────
const serverBlocks = new Set();          // what /api/v4/blocks will report
const serverHides = new Set();           // what /api/v1/hides will report
const calls = [];                        // every request the script made
const PAGE_SIZE = 100;                   // matches the real endpoint

const listBody = (ids) => JSON.stringify({ items: [...ids].map((id) => ({ profileId: Number(id) })) });
const res = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  headers: { get: () => 'application/json' }, clone() { return this; },
  json: async () => JSON.parse(body || '{}'), text: async () => body || '',
});

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  calls.push(`${method} ${u.replace('https://web.grindr.com', '')}`);

  const blocksPage = u.match(/\/api\/v4\/blocks\?page=(\d+)/);
  if (blocksPage) {
    const page = Number(blocksPage[1]);
    const all = [...serverBlocks];
    const slice = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return res(200, listBody(slice));       // a page past the end is legitimately empty
  }
  if (u.includes('/api/v1/hides')) return res(200, listBody(serverHides));

  const post = u.match(/\/api\/v3\/me\/blocks\/(\d+)$/);
  if (post && method === 'POST') { serverBlocks.add(post[1]); return res(200, '{"updateTime":0}'); }
  if (post && method === 'DELETE') { serverBlocks.delete(post[1]); return res(200, ''); }
  return res(200, '{}');
};

// ── seed a local block list that is AHEAD of what the server holds ──────────
// 250 already-real blocks (so the walk must read three pages to see them all)
// plus 6 that only exist locally (the actual backlog the drain has to clear).
const ALREADY_BLOCKED = Array.from({ length: 250 }, (_, i) => String(600000000 + i));
const NEEDS_UPGRADE = Array.from({ length: 6 }, (_, i) => String(400000000 + i));
for (const id of ALREADY_BLOCKED) serverBlocks.add(id);
for (const id of [...ALREADY_BLOCKED, ...NEEDS_UPGRADE]) serverHides.add(id);
globalThis.localStorage.setItem('grindrMiddleClickBlockList_v1',
  JSON.stringify([...ALREADY_BLOCKED, ...NEEDS_UPGRADE]));

const quiet = console.log; console.log = () => {}; console.warn = () => {};
require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

const G = globalThis;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Give the script a credential to replay, the only way it will talk to the API.
async function captureAuth() {
  await G.fetch('https://web.grindr.com/api/v1/ping', { headers: { Authorization: 'Bearer test-token' } });
}
// Wait for a condition, or fail with what the state actually was.
async function until(label, fn, timeoutMs = 30_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true;
    await sleep(100);
  }
  assert.fail(`${label} — timed out after ${timeoutMs}ms; autoDrain=${JSON.stringify(G.__grindrBlock_autoDrain())}`);
}

// ── 1. the paginated walk ───────────────────────────────────────────────────
// WHY: the walk reads /blocks page by page and stops on the first empty page. If
// it stopped after page 1 it would see 100 of the 250 real blocks and report 156
// entries as needing upgrade that do not. That exact bug shipped (v0.51 fixed
// it), and NOTHING has confirmed the fix against a multi-page list since.
// MUST: read every page, and stop rather than walking all 20.
test('the reconcile walk reads every page of a multi-page block list', async () => {
  await captureAuth();
  calls.length = 0;
  await G.__grindrBlock_reconcileBlocks();

  const pages = calls.filter((c) => c.includes('/api/v4/blocks?page=')).map((c) => Number(c.match(/page=(\d+)/)[1]));
  assert.deepStrictEqual(pages, [1, 2, 3, 4],
    'must walk pages until one comes back empty — page 4 is the empty one that stops it');
  const tiers = G.__grindrBlock_autoDrain();
  assert.strictEqual(tiers.remaining, NEEDS_UPGRADE.length,
    `after a full walk exactly the ${NEEDS_UPGRADE.length} local-only entries remain; ` +
    'a larger number means the walk under-read and the backlog is inflated');
});

// ── 2. the snapshot survives a reload ───────────────────────────────────────
// WHY: v0.54.0. The backlog is `blockedProfileIds \ serverBlockedIds`, and the
// second set used to be memory-only, so every reload recomputed the backlog as
// the whole local list.
// MUST: after a walk, the snapshot is in storage and reads back intact.
test('the walk persists what Grindr holds, so a reload does not lose it', () => {
  const raw = globalThis.localStorage.getItem('grindrMiddleClickServerBlocks_v1');
  assert.ok(raw, 'the snapshot must be written, or the backlog resets to the full list on reload');
  const H = require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
  const snap = H.parseServerBlocksSnapshot(raw);
  assert.ok(snap, 'the snapshot we wrote must be one we can read back');
  assert.strictEqual(snap.ids.length, ALREADY_BLOCKED.length,
    'every real block must be in the snapshot, not just the first page');
});

// ── 3. the queue actually reaches zero ──────────────────────────────────────
// WHY: the whole point. Every previous fix was declared done without this.
// MUST: the backlog goes to 0, the POSTs really happened, and it stays at 0.
test('the drain clears the backlog to zero', async () => {
  await captureAuth();
  calls.length = 0;
  const before = G.__grindrBlock_autoDrain().remaining;
  assert.strictEqual(before, NEEDS_UPGRADE.length, 'precondition: there is work to do');

  G.__grindrBlock_upgradeHides(NEEDS_UPGRADE.length);
  await until('the backlog did not reach zero', () => G.__grindrBlock_autoDrain().remaining === 0);

  for (const id of NEEDS_UPGRADE) {
    assert.ok(serverBlocks.has(id), `${id} must actually be blocked server-side, not just dropped from the count`);
    assert.ok(calls.includes(`POST /api/v3/me/blocks/${id}`), `a real POST must have been sent for ${id}`);
  }
  assert.strictEqual(G.__grindrBlock_autoDrain().queued, 0, 'the queue must be empty, not merely counted down');
});

// ── 4. zero is stable ───────────────────────────────────────────────────────
// WHY: the reported symptom was a number that climbed back. A walk that
// under-reads, or a baseline that resets, shows up here and nowhere else.
// MUST: re-walking against the same server does not resurrect the backlog.
test('the backlog stays at zero across a second reconcile', async () => {
  await G.__grindrBlock_reconcileBlocks();
  assert.strictEqual(G.__grindrBlock_autoDrain().remaining, 0,
    'a second walk must not resurrect work — that is the "number keeps going up" symptom');
  await G.__grindrBlock_reconcileBlocks();
  assert.strictEqual(G.__grindrBlock_autoDrain().remaining, 0, 'and still zero on a third');
});

// ── 5. a block you press must not wait behind the drain ─────────────────────
// WHY: the reported symptom, still present after v0.53.0. A big drain backlog is
// queued; you press block; it has to happen NOW. v0.53.0 made interactive jobs
// LIFO and gave them a separate hourly budget, and test/queue-order.test.cjs pins
// both as pure rules — but nothing had ever checked that the LIVE queue obeys
// them. This drives the same enqueue path a keypress uses.
// MUST: the pressed block lands within about one job's time, and essentially no
// bulk work runs ahead of it.
test('a block you press jumps a large drain backlog', async () => {
  await captureAuth();

  // Make the server forget everything, so the whole local list becomes backlog.
  const localList = JSON.parse(globalThis.localStorage.getItem('grindrMiddleClickBlockList_v1'));
  serverBlocks.clear();
  await G.__grindrBlock_reconcileBlocks();
  const remaining = G.__grindrBlock_autoDrain().remaining;
  assert.strictEqual(remaining, localList.length,
    'precondition: with the server holding nothing, every local entry is backlog');

  G.__grindrBlock_upgradeHides(remaining);
  const queuedBefore = G.__grindrBlock_autoDrain().queued;
  assert.ok(queuedBefore > 100, `precondition: a big bulk backlog is queued (got ${queuedBefore})`);

  // Press block on someone new — the same path the hotkey and middle-click use.
  const PRESSED = '470000001';
  calls.length = 0;
  const t0 = Date.now();
  const r = G.__grindrBlock_block(PRESSED);
  assert.strictEqual(r.queued, true, 'precondition: the pressed block was accepted');

  await until(`the pressed block never landed while ${queuedBefore} bulk jobs were queued`,
    () => serverBlocks.has(PRESSED), 15_000);
  const waited = Date.now() - t0;

  const idx = calls.findIndex((c) => c === `POST /api/v3/me/blocks/${PRESSED}`);
  const bulkFirst = calls.slice(0, idx).filter((c) => c.startsWith('POST /api/v3/me/blocks/')).length;
  assert.ok(waited < 4_000,
    `the pressed block waited ${waited}ms behind ${queuedBefore} bulk jobs — it must not queue behind the drain`);
  assert.ok(bulkFirst <= 1,
    `${bulkFirst} bulk blocks were sent before the pressed one; only the single already-in-flight job may go first`);
});

// ── 6. a failure caused by the drain must not freeze what you press ─────────
// WHY: the queue has pauses that stop EVERYTHING, checked before any job is
// picked — the 429 backoff (blockBackoffUntil) and the session-dead latch. The
// drain is what provokes them: it is the thing issuing hundreds of writes an
// hour. If a drain-provoked 429 freezes the whole queue, then "blocks don't work
// while the drain is running" is true no matter how the jobs are ordered, and
// v0.53.0's ordering fix cannot help.
// MUST: a block you press still lands in reasonable time after the drain has
// tripped a 429.
test('a 429 provoked by drain traffic does not freeze a pressed block', async () => {
  await captureAuth();
  G.__grindrBlock_clearQueue();
  G.__grindrBlock_reset();               // clear any latched session-dead/backoff

  serverBlocks.clear();
  await G.__grindrBlock_reconcileBlocks();
  const remaining = G.__grindrBlock_autoDrain().remaining;
  G.__grindrBlock_upgradeHides(remaining);
  assert.ok(G.__grindrBlock_autoDrain().queued > 100, 'precondition: bulk backlog queued');

  // The next bulk write gets rate-limited, the way a real drain provokes.
  let throttleOnce = true;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (throttleOnce && /\/api\/v3\/me\/blocks\/5\d+$/.test(u) && (opts.method || 'GET') === 'POST') {
      throttleOnce = false;
      calls.push(`POST ${u.replace('https://web.grindr.com', '')} -> 429`);
      return res(429, '{"error":"rate limited"}');
    }
    return realFetch(url, opts);
  };

  const PRESSED = '470000002';
  calls.length = 0;
  const t0 = Date.now();
  assert.strictEqual(G.__grindrBlock_block(PRESSED).queued, true);

  await until(`the pressed block never landed after a drain-provoked 429`,
    () => serverBlocks.has(PRESSED), 45_000);
  const waited = Date.now() - t0;
  globalThis.fetch = realFetch;

  assert.ok(waited < 10_000,
    `after the drain tripped a 429, a pressed block waited ${waited}ms. The backoff is ` +
    'shared by the whole queue, so drain-provoked throttling freezes work you did by hand.');
});

