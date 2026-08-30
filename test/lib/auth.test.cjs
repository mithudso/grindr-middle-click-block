const test = require('node:test');
const assert = require('node:assert');
const { resetFetch } = require('./stubs.cjs');
let A;
test.before(async () => { A = await import('../../lib/auth.js'); });

test('headers include the three required auth headers', () => {
  const auth = A.createAuth();
  auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  const h = auth.headers();
  assert.strictEqual(h.Authorization, 'Grindr3 JWT');
  assert.strictEqual(h['country-code'], 'US');
  assert.strictEqual(h['l-locale'], 'en-US');
});
test('headers throws GrindrAuthError before set', () => {
  const auth = A.createAuth();
  assert.throws(() => auth.headers(), (e) => e.name === 'GrindrAuthError');
  assert.strictEqual(auth.isReady(), false);
});
test('request encodes path, sends method, parses json, maps !ok to GrindrError', async () => {
  resetFetch();
  const auth = A.createAuth();
  auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  globalThis.__stubFetch = { ok: true, status: 200, json: { ok: 1 }, text: '{"ok":1}' };
  const data = await auth.request('/api/v1/hides', { method: 'GET' });
  assert.deepStrictEqual(data, { ok: 1 });
  const call = globalThis.__stubFetchCalls.at(-1);
  assert.match(call.url, /web\.grindr\.com\/api\/v1\/hides$/);
  assert.strictEqual(call.init.method, 'GET');

  globalThis.__stubFetch = { ok: false, status: 403, json: { code: 'urn:gr:err:unauthorized_action' }, text: '{"code":"urn:gr:err:unauthorized_action"}' };
  await assert.rejects(() => auth.request('/api/x'), (e) => e.name === 'GrindrError' && e.status === 403 && e.code === 'urn:gr:err:unauthorized_action');
});
test('enc encodes ids', () => {
  const auth = A.createAuth();
  assert.strictEqual(auth.enc('12/34'), '12%2F34');
});
test('no token in error message', async () => {
  const auth = A.createAuth();
  auth.set({ token: 'SECRET', countryCode: 'US', locale: 'en-US' });
  globalThis.__stubFetch = { ok: false, status: 500, json: {}, text: 'err' };
  await assert.rejects(() => auth.request('/api/x'), (e) => !String(e.message).includes('SECRET'));
});
