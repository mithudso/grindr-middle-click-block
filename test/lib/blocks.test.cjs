const test = require('node:test');
const assert = require('node:assert');
const { resetFetch } = require('./stubs.cjs');
let A, B;
test.before(async () => { A = await import('../../lib/auth.js'); B = await import('../../lib/blocks.js'); });
function client() { const auth = A.createAuth(); auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' }); return B.createBlocks(auth); }

test('hide POSTs the hides endpoint with an encoded id', async () => {
  resetFetch();
  globalThis.__stubFetch = { ok: true, status: 200, text: '', json: null };
  await client().hide('600000000');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.match(c.url, /\/api\/v1\/me\/hides\/600000000$/);
  assert.strictEqual(c.init.method, 'POST');
});
test('block POSTs the blocks endpoint', async () => {
  resetFetch();
  globalThis.__stubFetch = { ok: true, status: 200, text: '{"updateTime":0}', json: { updateTime: 0 } };
  await client().block('600000001');
  assert.match(globalThis.__stubFetchCalls.at(-1).url, /\/api\/v3\/me\/blocks\/600000001$/);
});
test('unblock block-kind DELETEs blocks; hide-kind throws no-unhide', async () => {
  resetFetch();
  globalThis.__stubFetch = { ok: true, status: 200, text: '', json: null };
  await client().unblock('600000002', 'block');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.strictEqual(c.init.method, 'DELETE');
  assert.match(c.url, /\/api\/v3\/me\/blocks\/600000002$/);
  await assert.rejects(() => client().unblock('1', 'hide'), (e) => e.code === 'no-unhide');
});
test('listBlocks walks pages until one returns no ids', async () => {
  const pages = {
    'page=1': { blocks: [{ profileId: 1 }, { profileId: 2 }] },
    'page=2': { blocks: [{ profileId: 3 }] },
    'page=3': { blocks: [] },
  };
  globalThis.fetch = async (url) => {
    const key = String(url).match(/page=\d+/)[0];
    const body = JSON.stringify(pages[key] || { blocks: [] });
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, async text() { return body; }, clone() { return this; } };
  };
  const list = await client().listBlocks({ maxPages: 20 });
  assert.strictEqual(list.length, 3);
});
test('listHides parses the hides array', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, async text() { return '{"hides":[{"profileId":1},{"profileId":2}]}'; }, clone() { return this; } });
  assert.strictEqual((await client().listHides()).length, 2);
});
