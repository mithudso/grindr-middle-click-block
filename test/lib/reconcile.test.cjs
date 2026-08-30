const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let R;
test.before(async () => { R = await import('../../lib/reconcile.js'); });

test('idsFromListPayload: structural, empty-envelope, fallback, parsed-object', () => {
  const f = R.idsFromListPayload;
  assert.ok(f('{"hides":[{"profileId":600000000}]}').has('600000000'));
  assert.strictEqual(f('{"blocks":[],"totalCount":12345678}').size, 0);   // envelope number is not an id
  assert.ok(f('garbage 700000123 tail').has('700000123'));               // parse-fail fallback
  assert.ok(f({ blocks: [{ profileId: 500000001 }] }).has('500000001')); // parsed object accepted
});

test('reconcileTiers computes needsUpgrade (hides not in blocks)', async () => {
  const client = { blocks: {
    listHides: async () => [{ profileId: 1 }, { profileId: 2 }, { profileId: 3 }].map((r) => ({ profileId: 600000000 + r.profileId })),
    listBlocks: async () => [{ profileId: 600000002 }],
  } };
  const r = await R.reconcileTiers(client);
  assert.deepStrictEqual([...r.needsUpgrade].sort(), ['600000001', '600000003']);
});
