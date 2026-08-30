// The drain must bootstrap itself from a cold start, with nothing pre-seeded.
//
// WHY THIS FILE IS SEPARATE: it needs a fresh module in a fresh process, with no
// snapshot in storage and no reconcile already performed — the state you are
// actually in when you open the page and switch the drain on. node:test gives
// each file its own process, which is the only way to get that.
//
// WHY IT EXISTS: v0.54.0 added a gate refusing to drain until a snapshot of
// Grindr's block list existed. The gate sat ABOVE the only reconcile the drain
// ever runs, so the snapshot could never arrive:
//
//   +  5.34s auto-drain holding: no snapshot of Grindr's block list yet...
//   + 17.61s auto-drain holding: no snapshot of Grindr's block list yet...
//   + 32.61s auto-drain holding: no snapshot of Grindr's block list yet...
//
// A live capture, never escaping. The end-to-end drain test did not catch it
// because it forced a reconcile first and so began from a state the user never
// starts in. That is the lesson this file encodes: DO NOT pre-seed the snapshot.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');

const serverBlocks = new Set();
const serverHides = new Set();
const PAGE_SIZE = 100;
const listBody = (ids) => JSON.stringify({ items: [...ids].map((id) => ({ profileId: Number(id) })) });
const res = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  headers: { get: () => 'application/json' }, clone() { return this; },
  json: async () => JSON.parse(body || '{}'), text: async () => body || '',
});

// The list endpoints fail until this is cleared. A reconcile ATTEMPT stamps the
// 30-minute throttle before it fetches ("stamp the attempt, not just a success",
// so a 401 cannot turn the 3s sweep into an unthrottled request loop). So one
// failed attempt leaves the throttle stamped and serverBlocksKnown false — and
// that is the state the field capture was in.
let listsDown = true;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  const page = u.match(/\/api\/v4\/blocks\?page=(\d+)/);
  if (page) {
    if (listsDown) return res(503, '');
    const all = [...serverBlocks];
    return res(200, listBody(all.slice((Number(page[1]) - 1) * PAGE_SIZE, Number(page[1]) * PAGE_SIZE)));
  }
  if (u.includes('/api/v1/hides')) return listsDown ? res(503, '') : res(200, listBody(serverHides));
  const w = u.match(/\/api\/v[13]\/me\/(?:blocks|hides)\/(\d+)$/);
  if (w && method === 'POST') { serverBlocks.add(w[1]); return res(200, '{"updateTime":0}'); }
  return res(200, '{}');
};

// A local list with real work in it, and NOTHING else primed. In particular:
// no grindrMiddleClickServerBlocks_v1, so serverBlocksKnown starts false —
// exactly the cold state the deadlock needed.
const BACKLOG = Array.from({ length: 8 }, (_, i) => String(430000000 + i));
for (const id of BACKLOG) serverHides.add(id);
globalThis.localStorage.setItem('grindrMiddleClickBlockList_v1', JSON.stringify(BACKLOG));
assert.strictEqual(globalThis.localStorage.getItem('grindrMiddleClickServerBlocks_v1'), null,
  'this test is only meaningful with no snapshot in storage');

const quiet = console.log; console.log = () => {}; console.warn = () => {};
require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

const G = globalThis;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// MUST: switching the drain on is enough. No manual reconcile, no priming, and
// crucially: recovery from an early reconcile that FAILED.
test('the drain bootstraps and clears the backlog from a cold start', { timeout: 120_000 }, async () => {
  // Donate a credential the way a real Grindr request does.
  await G.fetch('https://web.grindr.com/api/v1/ping', { headers: { Authorization: 'Bearer test-token' } });

  assert.strictEqual(G.__grindrBlock_autoDrain().remaining, BACKLOG.length,
    'precondition: with no snapshot, the whole local list reads as backlog');

  // Let the 3s sweep attempt a reconcile while the lists are down. That attempt
  // stamps the 30-minute throttle and leaves serverBlocksKnown false — exactly
  // the state the live capture showed.
  await sleep(7_000);
  assert.strictEqual(globalThis.localStorage.getItem('grindrMiddleClickServerBlocks_v1'), null,
    'precondition: the failed attempt must not have produced a snapshot');

  listsDown = false;                        // the blip passes
  G.__grindrBlock_autoDrain(true);          // the only thing the user does

  const t0 = Date.now();
  while (Date.now() - t0 < 100_000) {
    if (G.__grindrBlock_autoDrain().remaining === 0) break;
    await sleep(250);
  }

  assert.strictEqual(G.__grindrBlock_autoDrain().remaining, 0,
    'the drain never cleared the backlog. If it held on the snapshot gate, that gate ' +
    'sits above the only reconcile that clears it, and a single failed reconcile ' +
    'attempt stamps the 30-minute throttle — so the drain waits half an hour doing nothing.');
  for (const id of BACKLOG) {
    assert.ok(serverBlocks.has(id), `${id} must actually be blocked server-side`);
  }
});
