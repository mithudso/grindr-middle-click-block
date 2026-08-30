const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let D;
test.before(async () => { D = await import('../../lib/dom.js'); });

function node({ rect = { width: 559, height: 745 }, photos = 0, parent = null, attrs = {} }) {
  return {
    getBoundingClientRect: () => rect,
    querySelectorAll: () => new Array(photos).fill({}),
    getAttribute: (k) => attrs[k] || null,
    parentElement: parent,
  };
}

test('isPlausibleProfileId accepts 5-10 digits only', () => {
  assert.ok(D.isPlausibleProfileId('600000000'));
  assert.ok(!D.isPlausibleProfileId('1234'));
  assert.ok(!D.isPlausibleProfileId('12345678901'));
  assert.ok(!D.isPlausibleProfileId('abc'));
});

test('resolveCascadeTile stops before a multi-photo ancestor (sidebar-trap safe)', () => {
  globalThis.innerHeight = 900;
  const sidebar = node({ rect: { width: 241, height: 13414 }, photos: 2 });
  const tile = node({ rect: { width: 559, height: 745 }, photos: 1, parent: sidebar });
  const start = node({ rect: { width: 559, height: 745 }, photos: 1, parent: tile });
  const got = D.resolveCascadeTile(start);
  assert.strictEqual(got, tile);          // the tile, never the sidebar
  assert.notStrictEqual(got, sidebar);
});

test('resolveCascadeTile refuses an element taller than the viewport', () => {
  globalThis.innerHeight = 900;
  const tall = node({ rect: { width: 241, height: 13414 }, photos: 1 });
  assert.strictEqual(D.resolveCascadeTile(tall), null);
});

test('resolveProfileIdFromElement reads a plausible id off an attribute', () => {
  globalThis.location = { pathname: '/', search: '', origin: 'https://web.grindr.com' };
  const el = node({ attrs: { 'data-profile-id': '600000123' } });
  assert.strictEqual(D.resolveProfileIdFromElement(el), '600000123');
  assert.strictEqual(D.resolveProfileIdFromElement(node({ attrs: { 'data-testid': 'header' } })), '');
});

test('route reflects location', () => {
  globalThis.location = { pathname: '/login', search: '' };
  assert.strictEqual(D.route(), 'login');
  globalThis.location = { pathname: '/', search: '?profile=true' };
  assert.strictEqual(D.route(), 'profile');
  globalThis.location = { pathname: '/chat', search: '' };
  assert.strictEqual(D.route(), 'chat');
  globalThis.location = { pathname: '/', search: '' };
  assert.strictEqual(D.route(), 'grid');
});
