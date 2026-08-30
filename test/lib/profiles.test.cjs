const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let A, P;
test.before(async () => { A = await import('../../lib/auth.js'); P = await import('../../lib/profiles.js'); });
function auth() { const a = A.createAuth(); a.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' }); return a; }

test('getProfile hits v7 profiles', async () => {
  globalThis.__stubFetch = { ok: true, status: 200, text: '{}', json: {} };
  await P.createProfiles(auth()).getProfile('600000000');
  assert.match(globalThis.__stubFetchCalls.at(-1).url, /\/api\/v7\/profiles\/600000000$/);
});
test('recordView POSTs views', async () => {
  globalThis.__stubFetch = { ok: true, status: 200, text: '{}', json: {} };
  await P.createProfiles(auth()).recordView('600000000');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.strictEqual(c.init.method, 'POST');
  assert.match(c.url, /\/api\/v4\/views\/600000000$/);
});
test('getCascade serializes params', async () => {
  globalThis.__stubFetch = { ok: true, status: 200, text: '{}', json: {} };
  await P.createProfiles(auth()).getCascade({ pageNumber: 2, nearbyGeoHash: 'abc' });
  assert.match(globalThis.__stubFetchCalls.at(-1).url, /\/api\/v4\/cascade\/\?.*pageNumber=2/);
});
