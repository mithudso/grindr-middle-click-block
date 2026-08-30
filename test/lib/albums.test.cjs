const test = require('node:test');
const assert = require('node:assert');
const { resetFetch } = require('./stubs.cjs');
let A, AL;
test.before(async () => { A = await import('../../lib/auth.js'); AL = await import('../../lib/albums.js'); });
function client() { const auth = A.createAuth(); auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' }); return AL.createAlbums(auth); }

test('getShares returns profileIds', async () => {
  resetFetch();
  globalThis.__stubFetch = { ok: true, status: 200, text: '{"profileIds":["1","2"]}', json: { profileIds: ['1', '2'] } };
  assert.deepStrictEqual(await client().getShares('800000001'), ['1', '2']);
  assert.match(globalThis.__stubFetchCalls.at(-1).url, /\/api\/v1\/albums\/800000001\/shares$/);
});
test('share posts the profiles body shape', async () => {
  resetFetch();
  globalThis.__stubFetch = { ok: true, status: 200, text: '{}', json: {} };
  await client().share('800000001', '600000000', 'uuid-1');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.strictEqual(c.init.method, 'POST');
  assert.deepStrictEqual(JSON.parse(c.init.body), { profiles: [{ profileId: '600000000', shareId: 'uuid-1' }] });
});
test('unshare PUTs the unshares endpoint', async () => {
  resetFetch();
  globalThis.__stubFetch = { ok: true, status: 200, text: '{}', json: {} };
  await client().unshare('800000001', '600000000', 'uuid-2');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.strictEqual(c.init.method, 'PUT');
  assert.match(c.url, /\/unshares$/);
});
test('queryShare posts {profileId}', async () => {
  resetFetch();
  globalThis.__stubFetch = { ok: true, status: 200, text: '{"hasAlbum":true}', json: { hasAlbum: true } };
  await client().queryShare('600000000');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.match(c.url, /\/api\/v2\/albums\/shares$/);
  assert.deepStrictEqual(JSON.parse(c.init.body), { profileId: '600000000' });
});
