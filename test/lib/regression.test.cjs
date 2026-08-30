// Regression tests for the /cdo hardening pass (2026-08-30). Each guards a
// specific finding fixed in that pass.
const test = require('node:test');
const assert = require('node:assert');
const { resetFetch } = require('./stubs.cjs');
let E, A, B, C, P, D, CO, O, L, STUB;
test.before(async () => {
  STUB = globalThis.fetch;   // the recording stub from stubs.cjs (some tests swap fetch)
  E = await import('../../lib/errors.js');
  A = await import('../../lib/auth.js');
  B = await import('../../lib/blocks.js');
  C = await import('../../lib/chat.js');
  P = await import('../../lib/profiles.js');
  D = await import('../../lib/dom.js');
  CO = await import('../../lib/compose.js');
  O = await import('../../lib/observe.js');
  L = await import('../../lib/limiter.js');
});
function auth() { const a = A.createAuth(); a.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' }); return a; }

test('parseErrorCode reads a code from a valid-JSON body in an unexpected shape', () => {
  assert.strictEqual(E.parseErrorCode({ error: { code: 'urn:gr:err:x' } }), 'urn:gr:err:x');
  assert.strictEqual(E.parseErrorCode('{"nested":{"code":"urn:gr:err:y"}}'), 'urn:gr:err:y');
});

test('auth.encId throws on an empty id (no collapse onto the collection root)', async () => {
  resetFetch(); globalThis.__stubFetch = { ok: true, status: 200, text: '', json: null };
  await assert.rejects(() => B.createBlocks(auth()).hide(''), (e) => e.code === 'bad-id');
  await assert.rejects(() => B.createBlocks(auth()).hide(null), (e) => e.code === 'bad-id');
  await assert.rejects(() => P.createProfiles(auth()).recordView(undefined), (e) => e.code === 'bad-id');
});

test('auth: a blank base is ignored (never becomes a relative URL)', () => {
  const a = auth(); a.set({ base: '' });
  assert.strictEqual(a.base, 'https://web.grindr.com');
  a.set({ base: 'https://x.test/' }); assert.strictEqual(a.base, 'https://x.test');
});

test('auth: an unreadable 2xx body throws rather than returning null', async () => {
  const a = auth();
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, async text() { throw new Error('stream aborted'); }, clone() { return this; } });
  await assert.rejects(() => a.request('/api/v1/hides'), (e) => e.code === 'bad-response-body');
});

test('blocks.unblock rejects an unknown kind instead of silently deleting', async () => {
  await assert.rejects(() => B.createBlocks(auth()).unblock('600000000', 'Hide'), (e) => e.code === 'bad-kind');
});

test('blocks.listBlocks de-dups when the server ignores ?page', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, async text() { return '{"blocks":[{"profileId":1},{"profileId":2}]}'; }, clone() { return this; } });
  const list = await B.createBlocks(auth()).listBlocks({ maxPages: 20 });
  assert.strictEqual(list.length, 2);            // not 40
  assert.strictEqual(list.complete, true);
});

test('chat.conversationId is commutative for non-numeric ids', () => {
  assert.strictEqual(C.conversationId('abc', 'def'), C.conversationId('def', 'abc'));
});
test('chat.deriveOwnId returns empty on an ambiguous (both-shared) intersection', () => {
  assert.strictEqual(C.deriveOwnId('5:6', '6:5'), '');
});

test('profiles.getCascade omits null/undefined params', async () => {
  globalThis.fetch = STUB;                         // restore the recording stub
  globalThis.__stubFetch = { ok: true, status: 200, text: '{}', json: {} };
  resetFetch();
  await P.createProfiles(auth()).getCascade({ pageNumber: 2, nearbyGeoHash: undefined, x: null });
  const url = globalThis.__stubFetchCalls.at(-1).url;
  assert.ok(!/undefined|null/.test(url), url);
});

test('dom.resolveCascadeTile refuses a sidebar row (fails the tile floor)', () => {
  globalThis.innerHeight = 900;
  const row = { getBoundingClientRect: () => ({ width: 241, height: 74 }), querySelectorAll: () => [{}], parentElement: null };
  assert.strictEqual(D.resolveCascadeTile(row), null);
});
test('dom.resolveProfileIdFromElement ignores digits inside a display name', () => {
  globalThis.location = { pathname: '/', search: '' };
  const el = { getAttribute: (k) => (k === 'data-testid' ? 'chat-button-hotguy12345' : null), parentElement: null };
  assert.strictEqual(D.resolveProfileIdFromElement(el), '');
});

test('compose.findSendButton keeps drawer/profile parity', () => {
  const btn = (label) => ({ tagName: 'BUTTON', getAttribute: (k) => (k === 'aria-label' ? label : null) });
  const send = btn('Send');
  const composer = { parentElement: { querySelectorAll: () => [btn('send location'), send], querySelector: () => null, parentElement: null } };
  assert.strictEqual(CO.findSendButton(composer), send);
});

test('observe: a nested observer, once unwound, no longer fires (no leak)', async () => {
  globalThis.fetch = STUB;
  let aCalls = 0;
  const oa = O.createObserver({ onAuth: () => { aCalls += 1; } });
  const ob = O.createObserver({});
  oa.install(); ob.install();
  oa.uninstall(); ob.uninstall();
  // Reference identity can't be restored under nesting, but the neutralized patch
  // must pass through to the real fetch and NOT re-run the uninstalled handlers.
  await globalThis.fetch('https://web.grindr.com/api/v1/hides', { headers: { Authorization: 'Grindr3 X' } });
  assert.strictEqual(aCalls, 0, 'an uninstalled observer must not still fire');
});

test('limiter: maxPerHour:0 still serializes (limiting not silently disabled)', async () => {
  const lim = L.createLimiter({ minIntervalMs: 0, maxPerHour: 0 });
  const order = [];
  await Promise.all([lim.run(async () => order.push(1)), lim.run(async () => order.push(2))]);
  assert.deepStrictEqual(order, [1, 2]);
});
