// A transient 401 must not freeze the queue forever.
//
// WHY THIS FILE IS SEPARATE: it needs a fresh process. The shared end-to-end file
// forces reconciles, and a reconcile stamps its 30-minute throttle whether or not
// it succeeds — so by the time a later test in the same process induces a 401,
// the recovery path is throttled out and the result means nothing. A first
// attempt at this test lived there and passed against the bug.
//
// THE BUG: blockSessionDead latches on a 401/403. It is cleared only by
// clearSessionDeadIfSet(), which is reached only from the block and unblock
// success paths — inside processQueue, which BREAKS OUT at the top the moment the
// flag is set. The canary can therefore never run, and one transient 401 freezes
// the queue permanently.
//
// Observed live: a forced reconcile returned {known:3874, promoted:7} against a
// three-minute-old token — proving the session was perfectly alive — while
// sessionDead stayed true, 27 jobs sat unprocessed, and the drain backlog "never
// changed" for hours.
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const path = require('node:path');

const serverBlocks = new Set();
const serverHides = new Set();
const calls = [];
const listBody = (ids) => JSON.stringify({ items: [...ids].map((id) => ({ profileId: Number(id) })) });
const res = (status, body) => ({
  ok: status >= 200 && status < 300, status, statusText: String(status),
  headers: { get: () => 'application/json' }, clone() { return this; },
  json: async () => JSON.parse(body || '{}'), text: async () => body || '',
});

let rejectWrites = true;          // the token is briefly stale
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), m = (opts.method || 'GET').toUpperCase();
  calls.push(`${m} ${u.replace('https://web.grindr.com', '')}`);
  const p = u.match(/\/api\/v4\/blocks\?page=(\d+)/);
  if (p) return res(200, listBody([...serverBlocks].slice((+p[1] - 1) * 100, +p[1] * 100)));
  if (u.includes('/api/v1/hides')) return res(200, listBody(serverHides));
  const w = u.match(/\/api\/v3\/me\/blocks\/(\d+)$/);
  if (w && m === 'POST') {
    if (rejectWrites) return res(401, '');
    serverBlocks.add(w[1]);
    return res(200, '{"updateTime":0}');
  }
  return res(200, '{}');
};

globalThis.localStorage.setItem('grindrMiddleClickBlockList_v1', JSON.stringify(['430000001']));
const quiet = console.log; console.log = () => {}; console.warn = () => {};
require(path.join(__dirname, '..', 'Grindr Middle-Click Block.user.js'));
console.log = quiet;

const G = globalThis;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// MUST: the queue recovers on its own once the session works again. No reset, no
// reload, no operator action of any kind.
test('a transient 401 does not freeze the queue permanently', { timeout: 60_000 }, async () => {
  await G.fetch('https://web.grindr.com/api/v1/ping', { headers: { Authorization: 'Bearer test-token' } });

  G.__grindrBlock_block('480000001');          // eats the 401
  await sleep(1200);
  assert.strictEqual(G.__grindrBlock_state().sessionDead, true,
    'precondition: a 401 on a write latches the session-dead pause');

  rejectWrites = false;                        // the blip passes; nothing else changes

  const AFTER = '480000002';
  G.__grindrBlock_block(AFTER);

  const t0 = Date.now();
  while (Date.now() - t0 < 45_000) {
    if (serverBlocks.has(AFTER)) break;
    await sleep(250);
  }

  assert.ok(serverBlocks.has(AFTER),
    'work submitted after a transient 401 never reached the server. The session-dead ' +
    'latch is cleared only from inside processQueue, which refuses to run while it ' +
    'is set — so nothing can ever clear it and the queue is frozen for good.');
  assert.strictEqual(G.__grindrBlock_state().sessionDead, false,
    'and the latch must not still be set once an authenticated call has succeeded');
});

// MUST: the HUD can tell a paused queue from an idle one, and the resume button
// reports what it actually did. Before this, a queue stopped by a 401 and a queue
// with nothing to do looked identical on screen — which is why the stall went
// unexplained for hours.
test('the auth rejection is visible in state, and reset reports what it did', async () => {
  const s = G.__grindrBlock_state();
  for (const k of ['sessionDead', 'authRejectCount', 'lastAuthRejectStatus', 'lastAuthRejectAgoMin']) {
    assert.ok(k in s, `__grindrBlock_state() must expose ${k} for the HUD to render it`);
  }
  assert.ok(s.authRejectCount >= 1,
    'the 401 from the previous test must have been counted, not just logged');
  assert.strictEqual(s.lastAuthRejectStatus, 401, 'and the status recorded verbatim');

  G.__grindrBlock_arm();                     // reset is a gated console function
  const r = G.__grindrBlock_reset();
  assert.ok(r && typeof r.queued === 'number' && typeof r.wasPaused === 'boolean',
    'reset must report { wasPaused, queued } so the button can say what happened');
});
