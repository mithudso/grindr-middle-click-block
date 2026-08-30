const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let E;
test.before(async () => { E = await import('../../lib/errors.js'); });

test('GrindrError carries status/code/path', () => {
  const e = new E.GrindrError('x', { status: 403, code: 'urn:gr:err:unauthorized_action', path: '/p' });
  assert.strictEqual(e.status, 403);
  assert.strictEqual(e.code, 'urn:gr:err:unauthorized_action');
  assert.strictEqual(e.path, '/p');
  assert.ok(e instanceof Error);
});
test('GrindrAuthError is a GrindrError', () => {
  assert.ok(new E.GrindrAuthError() instanceof E.GrindrError);
});
test('parseErrorCode extracts a urn code or returns empty', () => {
  assert.strictEqual(E.parseErrorCode({ code: 'urn:gr:err:x' }), 'urn:gr:err:x');
  assert.strictEqual(E.parseErrorCode('{"code":"urn:gr:err:y"}'), 'urn:gr:err:y');
  assert.strictEqual(E.parseErrorCode('nope'), '');
});
