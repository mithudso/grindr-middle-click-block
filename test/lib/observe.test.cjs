const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let O;
test.before(async () => { O = await import('../../lib/observe.js'); });

test('install captures auth headers, uninstall restores fetch', async () => {
  const orig = globalThis.fetch;
  let captured = null;
  const obs = O.createObserver({ onAuth: (a) => { captured = a; } });
  obs.install();
  assert.notStrictEqual(globalThis.fetch, orig);
  await globalThis.fetch('https://web.grindr.com/api/v1/hides', { headers: { Authorization: 'Grindr3 JWT', 'country-code': 'US', 'l-locale': 'en-US' } });
  assert.deepStrictEqual(captured, { token: 'JWT', countryCode: 'US', locale: 'en-US' });
  obs.uninstall();
  assert.strictEqual(globalThis.fetch, orig);
});

test('foreign host is ignored', async () => {
  let captured = null;
  const obs = O.createObserver({ onAuth: (a) => { captured = a; } });
  obs.install();
  await globalThis.fetch('https://evil.example/?ref=grindr.com', { headers: { Authorization: 'Grindr3 X' } });
  assert.strictEqual(captured, null);
  obs.uninstall();
});
