// A backlog that cannot be finished must still reach zero.
//
// WHY THIS FILE IS SEPARATE: the local block list is read from storage once, at
// load. Seeding it after the script has booted does nothing, so this needs a
// fresh process — the same reason drain-cold-start.test.cjs is separate.
//
// THE BUG: some profiles accept POST /api/v3/me/blocks/{id} with
// 200 {"updateTime":0} and never appear in /api/v4/blocks. Measured live: a local
// list of 1496 against 1656 real blocks left 391 that would not convert — 156
// present in Grindr's HIDES list (hide and block are mutually exclusive, so
// blocking a hidden profile is a no-op) and 235 in neither list at all, almost
// certainly deleted or banned accounts.
//
// upgradeHidesToBlocks takes hidesNeedingUpgrade().slice(0, BATCH), so it took the
// SAME first entries every cycle. The optimistic add counted the backlog down, the
// next authoritative walk restored it, and the drain ran forever converting
// nothing. Confirmed on the live page: 391 -> upgrade -> reconcile -> 391 with
// promoted 0, and the operator watching the number reset over and over.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');

const GOOD = ['440000001', '440000002'];
const NEVER = ['450000001', '450000002', '450000003'];

const serverBlocks = new Set();
const serverHides = new Set([...GOOD, ...NEVER]);
const listBody = (ids) => JSON.stringify({ items: [...ids].map((id) => ({ profileId: Number(id) })) });
const res = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  headers: { get: () => 'application/json' }, clone() { return this; },
  json: async () => JSON.parse(body || '{}'), text: async () => body || '',
});

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), m = (opts.method || 'GET').toUpperCase();
  const p = u.match(/\/api\/v4\/blocks\?page=(\d+)/);
  if (p) return res(200, listBody([...serverBlocks].slice((+p[1] - 1) * 100, +p[1] * 100)));
  if (u.includes('/api/v1/hides')) return res(200, listBody(serverHides));
  const w = u.match(/\/api\/v[13]\/me\/(?:blocks|hides)\/(\d+)$/);
  if (w && m === 'POST') {
    // Accept every write. Silently drop the ones that will never take — which is
    // exactly what 200 {"updateTime":0} with no subsequent listing looks like.
    if (!NEVER.includes(w[1])) serverBlocks.add(w[1]);
    return res(200, '{"updateTime":0}');
  }
  return res(200, '{}');
};

globalThis.localStorage.setItem('grindrMiddleClickBlockList_v1', JSON.stringify([...GOOD, ...NEVER]));
const quiet = console.log; console.log = () => {}; console.warn = () => {};
require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

const G = globalThis;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(label, fn, timeoutMs = 20_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { if (fn()) return; await sleep(100); }
  assert.fail(`${label} — drain=${JSON.stringify(G.__grindrBlock_autoDrain())}`);
}

// MUST: a profile that will not take a block is retired after
// MAX_UPGRADE_ATTEMPTS, so the backlog reaches zero instead of resetting forever.
// The convertible ones must still convert, and the retired ones must stay blocked
// LOCALLY — retiring is about the backlog, not about un-blocking anyone.
test('profiles that never accept a block are retired, and the backlog reaches zero',
  { timeout: 120_000 }, async () => {
  await G.fetch('https://web.grindr.com/api/v1/ping', { headers: { Authorization: 'Bearer test-token' } });
  await G.__grindrBlock_reconcileBlocks();
  assert.strictEqual(G.__grindrBlock_autoDrain().remaining, 5,
    'precondition: all five look like backlog before anything is attempted');

  // Drive exactly the cycle the drain drives: upgrade a batch, then re-walk to
  // judge what actually landed.
  for (let cycle = 0; cycle < 8; cycle += 1) {
    G.__grindrBlock_upgradeHides(10);
    await until(`cycle ${cycle}: the queue never drained`, () => G.__grindrBlock_autoDrain().queued === 0);
    await G.__grindrBlock_reconcileBlocks();
    if (G.__grindrBlock_autoDrain().remaining === 0) break;
  }

  assert.strictEqual(G.__grindrBlock_autoDrain().remaining, 0,
    'the backlog must reach zero. Stuck at the count of un-convertible profiles means ' +
    'they are being retried forever and the number resets on every walk.');
  for (const id of GOOD) assert.ok(serverBlocks.has(id), `${id} should have converted normally`);

  const stuck = G.__grindrBlock_stuckBlocks();
  assert.strictEqual(stuck.count, NEVER.length,
    'the un-convertible ones must be retired AND reportable, never silently dropped');
  for (const id of NEVER) {
    assert.ok(stuck.ids.includes(id), `${id} must be listed by __grindrBlock_stuckBlocks()`);
    assert.ok(G.__grindrBlock_blockList().includes(id),
      `${id} must STAY blocked locally — retiring is about the backlog, not about unblocking`);
  }
});

// MUST: once a profile is known not to accept a block, a gesture on it must not
// spend another doomed write — it must hide the card, which is the part you can
// actually see. This is what "middle-click blocking isn't working" was: a capture
// shows three POST /api/v3/me/blocks/{id} all returning 200 against a profile
// that was already BLOCKED and HIDDEN, so nothing changed and the card stayed.
test('a gesture on an un-convertible profile hides it instead of re-POSTing', async () => {
  const stuck = G.__grindrBlock_stuckBlocks();
  assert.ok(stuck.count > 0, 'precondition: the previous test retired some');
  const victim = stuck.ids[0];

  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (/\/api\/v[13]\/me\/(?:blocks|hides)\/\d+$/.test(u) && (opts.method || 'GET') === 'POST') seen.push(u);
    return realFetch(url, opts);
  };

  G.__grindrBlock_block(victim);
  await sleep(2500);
  globalThis.fetch = realFetch;

  assert.strictEqual(seen.length, 0,
    `pressing block on ${victim} must not send another write — it has already proven ` +
    'it answers 200 and never lists, so the write is doomed and the card stays put');
  assert.ok(G.__grindrBlock_hiddenList().some((h) => String(h.profileId) === victim),
    'it must be hidden locally instead, which is the part that is actually visible');
  assert.ok(G.__grindrBlock_blockList().includes(victim), 'and it stays on the local block list');
});

// MUST: the same restraint for a profile Grindr already has blocked. Re-POSTing
// spends a write to change nothing.
test('a gesture on an already-blocked profile does not re-POST either', async () => {
  const already = GOOD[0];
  assert.ok(serverBlocks.has(already), 'precondition: Grindr already holds this block');
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (/\/api\/v[13]\/me\/(?:blocks|hides)\/\d+$/.test(u) && (opts.method || 'GET') === 'POST') seen.push(u);
    return realFetch(url, opts);
  };
  G.__grindrBlock_block(already);
  await sleep(2500);
  globalThis.fetch = realFetch;
  assert.strictEqual(seen.length, 0, 'the block is already applied; re-POSTing changes nothing');
});
