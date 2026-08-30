const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let G;
test.before(async () => { G = await import('../../lib/index.js'); });

test('createClient wires auth into the api modules', () => {
  const g = G.createClient({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  assert.strictEqual(typeof g.blocks.hide, 'function');
  assert.strictEqual(typeof g.albums.share, 'function');
  assert.strictEqual(typeof g.chat.getHistory, 'function');
  assert.strictEqual(typeof g.profiles.getProfile, 'function');
  assert.strictEqual(typeof g.dom.resolveCascadeTile, 'function');
  assert.strictEqual(typeof g.compose.findComposer, 'function');
  assert.strictEqual(typeof g.reconcile.idsFromListPayload, 'function');
  assert.strictEqual(typeof g.limiter, 'function');
  assert.ok(g.auth.isReady());
});
test('observe:true installs an observer that fills auth', () => {
  const g = G.createClient({ observe: true });
  assert.ok(g.observer && typeof g.observer.uninstall === 'function');
  g.observer.uninstall();
});
test('VERSION is exported', () => {
  assert.match(G.VERSION, /^\d+\.\d+\.\d+$/);
});
