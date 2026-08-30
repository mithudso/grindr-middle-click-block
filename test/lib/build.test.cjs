const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');

test('global build exposes window.Grindr', () => {
  globalThis.window = globalThis;
  require('../../dist/grindr.global.js');
  assert.strictEqual(typeof window.Grindr.createClient, 'function');
  assert.strictEqual(typeof window.Grindr.dom.resolveCascadeTile, 'function');
  assert.ok(window.Grindr.idsFromListPayload('{"hides":[{"profileId":600000000}]}').has('600000000'));
  assert.match(window.Grindr.VERSION, /^\d+\.\d+\.\d+$/);
});

test('esm build imports and createClient works', async () => {
  const G = await import('../../dist/grindr.esm.js');
  const g = G.createClient({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  assert.strictEqual(typeof g.blocks.hide, 'function');
  assert.ok(g.auth.isReady());
});
