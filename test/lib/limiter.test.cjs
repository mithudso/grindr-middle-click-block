const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let L;
test.before(async () => { L = await import('../../lib/limiter.js'); });

test('run serializes and resolves in order', async () => {
  const lim = L.createLimiter({ minIntervalMs: 0, maxPerHour: 1000 });
  const order = [];
  await Promise.all([
    lim.run(async () => order.push(1)),
    lim.run(async () => order.push(2)),
    lim.run(async () => order.push(3)),
  ]);
  assert.deepStrictEqual(order, [1, 2, 3]);
});

test('a throwing job does not break the chain', async () => {
  const lim = L.createLimiter({ minIntervalMs: 0 });
  await assert.rejects(() => lim.run(async () => { throw new Error('boom'); }));
  assert.strictEqual(await lim.run(async () => 'ok'), 'ok');
});
