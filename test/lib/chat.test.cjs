const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let A, C;
test.before(async () => { A = await import('../../lib/auth.js'); C = await import('../../lib/chat.js'); });

test('conversationId sorts ascending numeric', () => {
  assert.strictEqual(C.conversationId('600000000', '500000000'), '500000000:600000000');
  assert.strictEqual(C.conversationId(400000001, 500000000), '400000001:500000000');
});
test('deriveOwnId intersects two conversations', () => {
  assert.strictEqual(C.deriveOwnId('500000000:600000000', '400000000:500000000'), '500000000');
  assert.strictEqual(C.deriveOwnId('1:2', '3:4'), '');
});
test('getHistory hits the message endpoint with limit', async () => {
  const auth = A.createAuth();
  auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  globalThis.__stubFetch = { ok: true, status: 200, text: '{"messages":[]}', json: { messages: [] } };
  await C.createChat(auth).getHistory('400000000:500000000', 20);
  assert.match(globalThis.__stubFetchCalls.at(-1).url, /\/api\/v4\/chat\/conversation\/400000000%3A500000000\/message\?limit=20$/);
});
test('sendTyping posts the conversation body', async () => {
  const auth = A.createAuth();
  auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  globalThis.__stubFetch = { ok: true, status: 200, text: '{}', json: {} };
  await C.createChat(auth).sendTyping('400000000:500000000');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.match(c.url, /\/api\/v4\/chatstatus\/typing$/);
  assert.deepStrictEqual(JSON.parse(c.init.body), { conversationId: '400000000:500000000', status: 'Typing' });
});
