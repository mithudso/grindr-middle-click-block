# Grindr Interaction Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the verified Grindr Web interaction surface into a modular, zero-dependency ESM library with a `window.Grindr` global build.

**Architecture:** ESM modules under `lib/`. API modules are factories bound to an `Auth` instance (`createBlocks(auth)`); DOM/compose/reconcile core functions are pure. A stdlib-only build concatenates modules into `dist/grindr.esm.js` and `dist/grindr.global.js`. Tests use `node --test` with a stubbed `fetch`/DOM (no network), mirroring `test/stubs.cjs`.

**Tech Stack:** Vanilla ES2021 JavaScript, Node `>=20` built-in test runner, no third-party deps.

## Global Constraints

- Zero runtime and dev dependencies. No bundler. Node `>=20`.
- Browser-target syntax only; no lookbehind regex (Safari <16.4). Guard all global-intrinsic patching with try/catch.
- Every authed request sends `Authorization: Grindr3 <JWT>`, `country-code`, and `l-locale` (absent → 501) and `encodeURIComponent`s the id in the path.
- Never place the token in an error message, log, or query string.
- Base URL `https://web.grindr.com`. Hide and block are mutually exclusive; `DELETE /api/v1/me/hides/{id}` returns 501 (no un-hide).
- Tests are `.cjs` under `test/lib/`, run by `node --test --test-force-exit`.
- Commit after each task. Conventional Commits. Branch: `feat/grindr-interaction-library`.

---

## File Structure

```
lib/errors.js      GrindrError / GrindrAuthError / parseErrorCode
lib/auth.js        createAuth -> { set, clear, isReady, headers, request, enc, base }
lib/blocks.js      createBlocks(auth) -> { hide, block, unblock, listHides, listBlocks }
lib/albums.js      createAlbums(auth) -> { getShares, share, unshare, queryShare }
lib/chat.js        createChat(auth) + conversationId, deriveOwnId (static)
lib/profiles.js    createProfiles(auth) -> { getProfile, getCascade, recordView }
lib/dom.js         resolveProfileIdFromElement, resolveCascadeTile, route, ... (pure)
lib/compose.js     findComposer, findSendButton, fill, submit, confirmCleared, greet (pure/WS)
lib/observe.js     createObserver(handlers) -> { install, uninstall }
lib/reconcile.js   idsFromListPayload, reconcileTiers (pure)
lib/limiter.js     createLimiter(opts) -> { run, pending }
lib/index.js       createClient, re-exports, VERSION
scripts/build-lib.mjs
test/lib/*.test.cjs
test/lib/stubs.cjs
```

Build/dependency order (for `build-lib.mjs` concatenation): errors → auth → blocks → albums → chat → profiles → dom → compose → observe → reconcile → limiter → index.

---

### Task 1: Scaffold, errors, test harness

**Files:**
- Create: `lib/errors.js`, `test/lib/stubs.cjs`, `test/lib/errors.test.cjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `class GrindrError extends Error { status:number, code:string, path:string }`; `class GrindrAuthError extends GrindrError`; `parseErrorCode(body:any) -> string`. `test/lib/stubs.cjs` sets `globalThis.fetch`, `globalThis.Element`, `globalThis.document`, `globalThis.location`, and a settable `__stubFetch` response.

- [ ] **Step 1: Write the failing test** — `test/lib/errors.test.cjs`

```js
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
const { GrindrError, GrindrAuthError, parseErrorCode } = require('../../lib/errors.js');

test('GrindrError carries status/code/path and never leaks a token', () => {
  const e = new GrindrError('block failed', { status: 403, code: 'urn:gr:err:unauthorized_action', path: '/api/v3/me/blocks/1' });
  assert.strictEqual(e.status, 403);
  assert.strictEqual(e.code, 'urn:gr:err:unauthorized_action');
  assert.strictEqual(e.path, '/api/v3/me/blocks/1');
  assert.ok(e instanceof Error);
});
test('GrindrAuthError is a GrindrError', () => {
  assert.ok(new GrindrAuthError('no creds') instanceof GrindrError);
});
test('parseErrorCode extracts a urn code or returns empty', () => {
  assert.strictEqual(parseErrorCode({ code: 'urn:gr:err:x' }), 'urn:gr:err:x');
  assert.strictEqual(parseErrorCode('{"code":"urn:gr:err:y"}'), 'urn:gr:err:y');
  assert.strictEqual(parseErrorCode('nope'), '');
});
```

- [ ] **Step 2: Run to verify it fails** — `node --test test/lib/errors.test.cjs` → FAIL (cannot find `../../lib/errors.js`).

- [ ] **Step 3: Create `test/lib/stubs.cjs`**

```js
'use strict';
const noop = () => {};
globalThis.__stubFetch = { ok: true, status: 200, statusText: 'OK', json: {}, text: '{}' };
globalThis.fetch = async (url, init) => {
  const r = globalThis.__stubFetch;
  globalThis.__stubFetchCalls = globalThis.__stubFetchCalls || [];
  globalThis.__stubFetchCalls.push({ url: String(url), init: init || {} });
  return {
    ok: r.ok, status: r.status, statusText: r.statusText || '',
    headers: { get: (k) => (r.headers && r.headers[k]) || (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    async json() { return typeof r.json === 'function' ? r.json() : r.json; },
    async text() { return typeof r.text === 'function' ? r.text() : r.text; },
    clone() { return this; },
  };
};
globalThis.AbortController = globalThis.AbortController || class { constructor(){ this.signal = {}; } abort(){} };
if (!globalThis.crypto) globalThis.crypto = {};
if (!globalThis.crypto.randomUUID) globalThis.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000';
globalThis.Element = globalThis.Element || class Element {};
globalThis.location = globalThis.location || { href: 'https://web.grindr.com/', pathname: '/', search: '' };
module.exports = { noop, resetFetch: () => { globalThis.__stubFetchCalls = []; } };
```

- [ ] **Step 4: Create `lib/errors.js`**

```js
export function parseErrorCode(body) {
  try {
    const o = typeof body === 'string' ? JSON.parse(body) : body;
    const c = o && o.code;
    return typeof c === 'string' && c.startsWith('urn:gr:err:') ? c : '';
  } catch (_e) {
    const m = String(body || '').match(/urn:gr:err:[a-z_]+/i);
    return m ? m[0] : '';
  }
}
export class GrindrError extends Error {
  constructor(message, { status = 0, code = '', path = '' } = {}) {
    super(message);
    this.name = 'GrindrError';
    this.status = status; this.code = code; this.path = path;
  }
}
export class GrindrAuthError extends GrindrError {
  constructor(message = 'Grindr credentials are not set') {
    super(message, { status: 0, code: 'no-auth' });
    this.name = 'GrindrAuthError';
  }
}
```

Note: the test `require`s ESM via CommonJS. To keep `node --test` `.cjs` able to load ESM `lib/*.js`, add `"type":"module"` is NOT wanted (userscript repo). Instead, author `lib/*.js` as ESM and have tests import via dynamic `import()`. Adjust the test harness: tests use `await import('../../lib/errors.js')` inside the test body. Rewrite Step 1 accordingly:

```js
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let E;
test.before(async () => { E = await import('../../lib/errors.js'); });
test('GrindrError carries status/code/path', () => {
  const e = new E.GrindrError('x', { status: 403, code: 'urn:gr:err:unauthorized_action', path: '/p' });
  assert.strictEqual(e.status, 403); assert.strictEqual(e.code, 'urn:gr:err:unauthorized_action'); assert.strictEqual(e.path, '/p');
});
test('GrindrAuthError is a GrindrError', () => { assert.ok(new E.GrindrAuthError() instanceof E.GrindrError); });
test('parseErrorCode', () => {
  assert.strictEqual(E.parseErrorCode({ code: 'urn:gr:err:x' }), 'urn:gr:err:x');
  assert.strictEqual(E.parseErrorCode('nope'), '');
});
```

- [ ] **Step 5: Modify `package.json`** — extend the test glob and add build script.

```json
"test": "node --test --test-force-exit 'test/*.test.cjs' 'test/lib/*.test.cjs'",
"build:lib": "node scripts/build-lib.mjs",
"verify": "npm run check && npm test && npm run docs:check"
```

- [ ] **Step 6: Run** — `node --test test/lib/errors.test.cjs` → PASS.

- [ ] **Step 7: Commit** — `git add lib/errors.js test/lib package.json && git commit -m "feat(lib): errors + esm test harness"`

---

### Task 2: auth.js — credential store, headers, request

**Files:** Create `lib/auth.js`, `test/lib/auth.test.cjs`.

**Interfaces:**
- Consumes: `GrindrError`, `GrindrAuthError`, `parseErrorCode` from `lib/errors.js`.
- Produces: `createAuth(config?) -> { set(cfg), clear(), isReady():boolean, headers(extra?):object, request(path,opts?):Promise<any>, enc(id):string, get base():string }`. `request` opts: `{ method='GET', body?, signal?, timeoutMs=20000 }`.

- [ ] **Step 1: Write failing test** — `test/lib/auth.test.cjs`

```js
const test = require('node:test');
const assert = require('node:assert');
const { resetFetch } = require('./stubs.cjs');
let A;
test.before(async () => { A = await import('../../lib/auth.js'); });

test('headers include the three required auth headers', async () => {
  const auth = A.createAuth(); auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  const h = auth.headers();
  assert.strictEqual(h.Authorization, 'Grindr3 JWT');
  assert.strictEqual(h['country-code'], 'US');
  assert.strictEqual(h['l-locale'], 'en-US');
});
test('headers throws GrindrAuthError before set', async () => {
  const auth = A.createAuth();
  assert.throws(() => auth.headers(), (e) => e.name === 'GrindrAuthError');
  assert.strictEqual(auth.isReady(), false);
});
test('request encodes path, sends method, parses json, maps !ok to GrindrError', async () => {
  resetFetch();
  const auth = A.createAuth(); auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  globalThis.__stubFetch = { ok: true, status: 200, json: { ok: 1 }, text: '{"ok":1}' };
  const data = await auth.request('/api/v1/hides', { method: 'GET' });
  assert.deepStrictEqual(data, { ok: 1 });
  const call = globalThis.__stubFetchCalls.at(-1);
  assert.match(call.url, /web\.grindr\.com\/api\/v1\/hides$/);
  assert.strictEqual(call.init.method, 'GET');

  globalThis.__stubFetch = { ok: false, status: 403, json: { code: 'urn:gr:err:unauthorized_action' }, text: '{"code":"urn:gr:err:unauthorized_action"}' };
  await assert.rejects(() => auth.request('/api/x'), (e) => e.name === 'GrindrError' && e.status === 403 && e.code === 'urn:gr:err:unauthorized_action');
});
test('enc encodes ids', async () => {
  const auth = A.createAuth();
  assert.strictEqual(auth.enc('12/34'), '12%2F34');
});
test('no token in error message', async () => {
  const auth = A.createAuth(); auth.set({ token: 'SECRET', countryCode: 'US', locale: 'en-US' });
  globalThis.__stubFetch = { ok: false, status: 500, json: {}, text: 'err' };
  await assert.rejects(() => auth.request('/api/x'), (e) => !String(e.message).includes('SECRET'));
});
```

- [ ] **Step 2: Run** → FAIL (no `lib/auth.js`).

- [ ] **Step 3: Create `lib/auth.js`**

```js
import { GrindrError, GrindrAuthError, parseErrorCode } from './errors.js';

export function createAuth(config = {}) {
  const state = {
    token: config.token || '',
    countryCode: config.countryCode || '',
    locale: config.locale || '',
    base: config.base || 'https://web.grindr.com',
  };
  const isReady = () => !!state.token;
  const set = (cfg = {}) => {
    if (cfg.token != null) state.token = String(cfg.token || '');
    if (cfg.countryCode != null) state.countryCode = String(cfg.countryCode || '');
    if (cfg.locale != null) state.locale = String(cfg.locale || '');
    if (cfg.base != null) state.base = String(cfg.base);
    return isReady();
  };
  const clear = () => { state.token = ''; };
  const headers = (extra) => {
    if (!isReady()) throw new GrindrAuthError();
    return {
      'Authorization': `Grindr3 ${state.token}`,
      'country-code': state.countryCode,
      'l-locale': state.locale,
      'Content-Type': 'application/json',
      ...(extra || {}),
    };
  };
  const enc = (id) => encodeURIComponent(String(id == null ? '' : id));
  async function request(path, { method = 'GET', body, signal, timeoutMs = 20000 } = {}) {
    const h = headers();                       // throws GrindrAuthError if not ready
    const ac = new AbortController();
    const to = setTimeout(() => { try { ac.abort(); } catch (_e) {} }, timeoutMs);
    const sig = signal || ac.signal;
    let res;
    try {
      res = await fetch(state.base + path, {
        method, credentials: 'include', headers: h, signal: sig,
        body: body != null ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      clearTimeout(to);
      throw new GrindrError(`request failed: ${method} ${path}`, { status: 0, path });
    }
    clearTimeout(to);
    let text = '';
    try { text = await res.text(); } catch (_e) {}
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (_e) { data = text; } }
    if (!res.ok) {
      throw new GrindrError(`HTTP ${res.status} on ${method} ${path}`, { status: res.status, code: parseErrorCode(data), path });
    }
    return data;
  }
  return { set, clear, isReady, headers, request, enc, get base() { return state.base; } };
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(lib): auth store, headers, request"`

---

### Task 3: blocks.js — hide/block/unblock/lists

**Files:** Create `lib/blocks.js`, `test/lib/blocks.test.cjs`.

**Interfaces:**
- Consumes: an `auth` from `createAuth` (uses `auth.request`, `auth.enc`); `GrindrError`.
- Produces: `createBlocks(auth) -> { hide(id):Promise<true>, block(id):Promise<true>, unblock(id, kind='block'):Promise<true>, listHides():Promise<Array>, listBlocks(opts?):Promise<Array> }`.

- [ ] **Step 1: Write failing test** — `test/lib/blocks.test.cjs`

```js
const test = require('node:test');
const assert = require('node:assert');
const { resetFetch } = require('./stubs.cjs');
let A, B;
test.before(async () => { A = await import('../../lib/auth.js'); B = await import('../../lib/blocks.js'); });
function client() { const auth = A.createAuth(); auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' }); return B.createBlocks(auth); }

test('hide POSTs the hides endpoint with an encoded id', async () => {
  resetFetch(); globalThis.__stubFetch = { ok: true, status: 200, text: '', json: null };
  await client().hide('600000000');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.match(c.url, /\/api\/v1\/me\/hides\/600000000$/);
  assert.strictEqual(c.init.method, 'POST');
});
test('block POSTs the blocks endpoint', async () => {
  resetFetch(); globalThis.__stubFetch = { ok: true, status: 200, text: '{"updateTime":0}', json: { updateTime: 0 } };
  await client().block('600000001');
  assert.match(globalThis.__stubFetchCalls.at(-1).url, /\/api\/v3\/me\/blocks\/600000001$/);
});
test('unblock block-kind DELETEs blocks; hide-kind throws no-unhide', async () => {
  resetFetch(); globalThis.__stubFetch = { ok: true, status: 200, text: '', json: null };
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
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, async text(){ return body; }, clone(){ return this; } };
  };
  const list = await client().listBlocks({ maxPages: 20 });
  assert.strictEqual(list.length, 3);
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Create `lib/blocks.js`**

```js
import { GrindrError } from './errors.js';

const HIDE_BASE = '/api/v1/me/hides';
const BLOCK_BASE = '/api/v3/me/blocks';
const HIDE_LIST = '/api/v1/hides';
const BLOCK_LIST = '/api/v4/blocks?page=1';

export function createBlocks(auth) {
  const hide = async (id) => { await auth.request(`${HIDE_BASE}/${auth.enc(id)}`, { method: 'POST' }); return true; };
  const block = async (id) => { await auth.request(`${BLOCK_BASE}/${auth.enc(id)}`, { method: 'POST' }); return true; };
  const unblock = async (id, kind = 'block') => {
    if (kind === 'hide') throw new GrindrError('no un-hide: DELETE /api/v1/me/hides returns 501', { status: 501, code: 'no-unhide', path: HIDE_BASE });
    await auth.request(`${BLOCK_BASE}/${auth.enc(id)}`, { method: 'DELETE' });
    return true;
  };
  const listHides = async () => {
    const d = await auth.request(HIDE_LIST);
    return Array.isArray(d && d.hides) ? d.hides : [];
  };
  const listBlocks = async ({ maxPages = 20 } = {}) => {
    const out = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const d = await auth.request(BLOCK_LIST.replace(/page=\d+/, `page=${page}`));
      const rows = Array.isArray(d && d.blocks) ? d.blocks : [];
      if (!rows.length) break;
      for (const r of rows) out.push(r);
    }
    return out;
  };
  return { hide, block, unblock, listHides, listBlocks };
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): blocks/hides client"`

---

### Task 4: albums.js

**Files:** Create `lib/albums.js`, `test/lib/albums.test.cjs`.

**Interfaces:**
- Consumes: `auth`.
- Produces: `createAlbums(auth) -> { getShares(albumId):Promise<string[]>, share(albumId, profileId, shareId?):Promise<any>, unshare(albumId, profileId, shareId?):Promise<any>, queryShare(profileId):Promise<any> }`.

- [ ] **Step 1: Write failing test** — `test/lib/albums.test.cjs`

```js
const test = require('node:test');
const assert = require('node:assert');
const { resetFetch } = require('./stubs.cjs');
let A, AL;
test.before(async () => { A = await import('../../lib/auth.js'); AL = await import('../../lib/albums.js'); });
function client() { const auth = A.createAuth(); auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' }); return AL.createAlbums(auth); }

test('getShares returns profileIds', async () => {
  resetFetch(); globalThis.__stubFetch = { ok: true, status: 200, text: '{"profileIds":["1","2"]}', json: { profileIds: ['1','2'] } };
  assert.deepStrictEqual(await client().getShares('800000001'), ['1','2']);
  assert.match(globalThis.__stubFetchCalls.at(-1).url, /\/api\/v1\/albums\/800000001\/shares$/);
});
test('share posts the profiles body shape', async () => {
  resetFetch(); globalThis.__stubFetch = { ok: true, status: 200, text: '{}', json: {} };
  await client().share('800000001', '600000000', 'uuid-1');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.strictEqual(c.init.method, 'POST');
  assert.deepStrictEqual(JSON.parse(c.init.body), { profiles: [{ profileId: '600000000', shareId: 'uuid-1' }] });
});
test('queryShare posts {profileId}', async () => {
  resetFetch(); globalThis.__stubFetch = { ok: true, status: 200, text: '{"hasAlbum":true}', json: { hasAlbum: true } };
  await client().queryShare('600000000');
  const c = globalThis.__stubFetchCalls.at(-1);
  assert.match(c.url, /\/api\/v2\/albums\/shares$/);
  assert.deepStrictEqual(JSON.parse(c.init.body), { profileId: '600000000' });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Create `lib/albums.js`**

```js
function uuid4() {
  try { if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID(); } catch (_e) {}
  const b = new Array(16); for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}
export function createAlbums(auth) {
  const getShares = async (albumId) => {
    const d = await auth.request(`/api/v1/albums/${auth.enc(albumId)}/shares`);
    return Array.isArray(d && d.profileIds) ? d.profileIds : [];
  };
  const share = (albumId, profileId, shareId = uuid4()) =>
    auth.request(`/api/v1/albums/${auth.enc(albumId)}/shares`, { method: 'POST', body: { profiles: [{ profileId: String(profileId), shareId }] } });
  const unshare = (albumId, profileId, shareId = uuid4()) =>
    auth.request(`/api/v1/albums/${auth.enc(albumId)}/unshares`, { method: 'PUT', body: { profiles: [{ profileId: String(profileId), shareId }] } });
  const queryShare = (profileId) =>
    auth.request('/api/v2/albums/shares', { method: 'POST', body: { profileId: String(profileId) } });
  return { getShares, share, unshare, queryShare };
}
```

Note: body shape test above expects `profileId` as a string — `share` casts with `String(profileId)`.

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): albums client"`

---

### Task 5: chat.js — history/typing + id helpers

**Files:** Create `lib/chat.js`, `test/lib/chat.test.cjs`.

**Interfaces:**
- Consumes: `auth`.
- Produces: `createChat(auth) -> { getHistory(convId, limit=20), sendTyping(convId, status='Typing') }`; static `conversationId(a,b):string`, `deriveOwnId(convA, convB):string`.

- [ ] **Step 1: Write failing test** — `test/lib/chat.test.cjs`

```js
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
  const auth = A.createAuth(); auth.set({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  globalThis.__stubFetch = { ok: true, status: 200, text: '{"messages":[]}', json: { messages: [] } };
  await C.createChat(auth).getHistory('400000000:500000000', 20);
  assert.match(globalThis.__stubFetchCalls.at(-1).url, /\/api\/v4\/chat\/conversation\/400000000%3A500000000\/message\?limit=20$/);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Create `lib/chat.js`**

```js
export function conversationId(a, b) {
  const x = String(a), y = String(b);
  return (Number(x) <= Number(y)) ? `${x}:${y}` : `${y}:${x}`;
}
export function deriveOwnId(convA, convB) {
  const a = String(convA).split(':'), b = new Set(String(convB).split(':'));
  for (const id of a) if (b.has(id)) return id;
  return '';
}
export function createChat(auth) {
  const getHistory = (convId, limit = 20) =>
    auth.request(`/api/v4/chat/conversation/${auth.enc(convId)}/message?limit=${encodeURIComponent(limit)}`);
  const sendTyping = (convId, status = 'Typing') =>
    auth.request('/api/v4/chatstatus/typing', { method: 'POST', body: { conversationId: String(convId), status } });
  return { getHistory, sendTyping };
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): chat history/typing + id helpers"`

---

### Task 6: profiles.js

**Files:** Create `lib/profiles.js`, `test/lib/profiles.test.cjs`.

**Interfaces:**
- Produces: `createProfiles(auth) -> { getProfile(id), getCascade(params), recordView(id) }`. `getCascade(params:object)` serializes params to a query string.

- [ ] **Step 1: Write failing test**

```js
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
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Create `lib/profiles.js`**

```js
export function createProfiles(auth) {
  const getProfile = (id) => auth.request(`/api/v7/profiles/${auth.enc(id)}`);
  const recordView = (id) => auth.request(`/api/v4/views/${auth.enc(id)}`, { method: 'POST' });
  const getCascade = (params = {}) => {
    const q = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return auth.request(`/api/v4/cascade/?${q}`);
  };
  return { getProfile, getCascade, recordView };
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): profiles/cascade/views"`

---

### Task 7: dom.js — resolution, tile bounding, routes

**Files:** Create `lib/dom.js`, `test/lib/dom.test.cjs`. Port the bounded logic from the userscript (`resolveProfileIdFromClick`, `outermostCardWrapper`, `cardForImage`, `isPlausibleProfileId`), taking an **element** not an event, and excluding hover/click specifics.

**Interfaces:**
- Produces (pure): `isPlausibleProfileId(id):boolean`; `PROFILE_PHOTO_SELECTOR:string`; `CASCADE_TILE_SELECTOR:string`; `resolveCascadeTile(el):Element|null`; `resolveProfileIdFromElement(el, {hashIndex?}):string`; `route():'grid'|'profile'|'chat'|'login'`; `isProfileOverlayOpen():boolean`; `isOnChat():boolean`.

- [ ] **Step 1: Write failing test** — `test/lib/dom.test.cjs` (uses a minimal element factory mirroring `test/stubs.cjs`)

```js
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let D;
test.before(async () => { D = await import('../../lib/dom.js'); });

function el(props = {}) {
  return {
    tagName: props.tag || 'DIV', children: props.children || [],
    parentElement: props.parent || null,
    getBoundingClientRect: () => props.rect || { width: 559, height: 745 },
    querySelectorAll: props.querySelectorAll || (() => props.photos || []),
    closest: props.closest || (() => null),
    getAttribute: (k) => (props.attrs || {})[k] || null,
    ...props,
  };
}

test('isPlausibleProfileId accepts 5-10 digits only', () => {
  assert.ok(D.isPlausibleProfileId('600000000'));
  assert.ok(!D.isPlausibleProfileId('1234'));
  assert.ok(!D.isPlausibleProfileId('12345678901'));
  assert.ok(!D.isPlausibleProfileId('abc'));
});

test('resolveCascadeTile stops at a multi-photo ancestor (sidebar-trap safe)', () => {
  // inner single-photo wrapper -> tile; a parent that holds 2 photos must NOT be returned
  const tile = el({ rect: { width: 559, height: 745 }, children: [{}] });
  const sidebar = el({ rect: { width: 241, height: 13414 }, children: [tile], photos: [{}, {}] });
  tile.parentElement = sidebar;
  const start = el({ rect: { width: 559, height: 745 }, parent: tile, children: [{}] });
  tile.children = [start];
  const got = D.resolveCascadeTile(start);
  assert.notStrictEqual(got, sidebar); // never the sidebar UL
});

test('resolveCascadeTile refuses an element taller than the viewport', () => {
  globalThis.innerHeight = 900;
  const tall = el({ rect: { width: 241, height: 13414 }, children: [{}] });
  assert.strictEqual(D.resolveCascadeTile(tall), tall.__self === undefined ? D.resolveCascadeTile(tall) : null);
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
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Create `lib/dom.js`** — port and adapt from the userscript. Key functions (adapt bounding constants verbatim from `docs/grindr-dom-and-api.md`):

```js
export const PROFILE_PHOTO_SELECTOR = 'img[src*="cdns.grindr.com"], img[src*="grindr.com/images/profile"], img[src*="cloudfront.net"]';
export const CASCADE_TILE_SELECTOR = '[data-testid="cascadeCellContainer"]';
const MIN_ID = 5, MAX_ID = 10;

export function isPlausibleProfileId(id) {
  const s = String(id == null ? '' : id);
  return /^[0-9]+$/.test(s) && s.length >= MIN_ID && s.length <= MAX_ID;
}
export function isProfileOverlayOpen() { try { return /profile=true/.test(location.search || ''); } catch (_e) { return false; } }
export function isOnChat() { try { return /^\/chat(?:\/|$)/.test(location.pathname || ''); } catch (_e) { return false; } }
export function route() {
  try {
    if (/^\/login/.test(location.pathname || '')) return 'login';
    if (isOnChat()) return 'chat';
    if (isProfileOverlayOpen()) return 'profile';
  } catch (_e) {}
  return 'grid';
}
// Bounded outermost wrapper: never returns a multi-photo or taller-than-viewport
// ancestor (the sidebar-UL trap). Returns null rather than guess.
export function resolveCascadeTile(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const vh = (typeof innerHeight === 'number' ? innerHeight : 900);
  const r0 = el.getBoundingClientRect();
  if (r0.height > vh) return null;
  let best = el, node = el;
  for (let i = 0; node && i < 4; i += 1, node = node.parentElement) {
    if (node === (globalThis.document && document.body) || node === (globalThis.document && document.documentElement)) break;
    let photos = 0;
    try { photos = node.querySelectorAll(PROFILE_PHOTO_SELECTOR).length; } catch (_e) {}
    if (photos > 1) break;                 // more than one profile photo = not a single tile
    const r = node.getBoundingClientRect();
    if (r.height > vh) break;
    best = node;
  }
  return best;
}
// Resolve a profile id from an element: URL peer, data-testid/aria, optional
// hash index, then a bounded numeric attribute scan. Returns '' on miss.
export function resolveProfileIdFromElement(el, { hashIndex } = {}) {
  // 1) chat URL peer
  try {
    const m = (location.pathname + location.search).match(/\/(?:profiles?|users?|conversations?|chat)\/(\d{5,10})(?:\/|\?|$)/i);
    if (m && isPlausibleProfileId(m[1])) return m[1];
  } catch (_e) {}
  if (!el) return '';
  // 2) explicit attributes on the element or a close ancestor
  try {
    let node = el;
    for (let i = 0; node && i < 6; i += 1, node = node.parentElement) {
      const t = (node.getAttribute && (node.getAttribute('data-profile-id') || node.getAttribute('data-testid') || node.getAttribute('aria-label'))) || '';
      const mm = String(t).match(/(?:^|[^0-9])([0-9]{5,10})(?![0-9])/);
      if (mm && isPlausibleProfileId(mm[1])) return mm[1];
    }
  } catch (_e) {}
  // 3) optional photo-hash index (src hash -> id), supplied by the caller
  if (hashIndex) {
    try {
      const imgs = el.querySelectorAll ? el.querySelectorAll(PROFILE_PHOTO_SELECTOR) : [];
      for (const img of imgs) {
        const src = String(img.getAttribute && img.getAttribute('src') || '');
        const h = src.split(/[?#]/)[0].match(/\/([A-Za-z0-9._-]{16,})$/);
        if (h && hashIndex.get && hashIndex.get(h[1])) return String(hashIndex.get(h[1]));
      }
    } catch (_e) {}
  }
  return '';
}
```

Adjust the test's tall-element assertion to `assert.strictEqual(D.resolveCascadeTile(tall), null)` (Step 1 line simplified during implementation).

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): dom resolution + tile bounding"`

---

### Task 8: compose.js — composer/send discrimination

**Files:** Create `lib/compose.js`, `test/lib/compose.test.cjs`. Port `findChatComposer`/`findSendButton`/`fillComposer`/`confirmComposerCleared` (drawer-vs-profile discrimination, anchored Send match) from the userscript.

**Interfaces:**
- Produces (pure/DOM): `findComposer():Element|null`; `findSendButton(composer):Element|null`; `fill(composer, text):void`; `submit(composer):boolean`; `confirmCleared(composer):boolean`; `greet(text, {composer?}):Promise<boolean>`.

- [ ] **Step 1: Write failing test** — assert composer discrimination + Send anchoring using DOM stubs.

```js
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let CO;
test.before(async () => { CO = await import('../../lib/compose.js'); });

test('findSendButton rejects "send location" and accepts "Send"', () => {
  const mk = (label) => ({ getAttribute: (k) => (k === 'aria-label' ? label : null), tagName: 'BUTTON', disabled: false });
  const sendLoc = mk('send location'), send = mk('Send');
  const composer = { closest: () => null, parentElement: { querySelectorAll: () => [sendLoc, send], parentElement: null } };
  const got = CO.findSendButton(composer);
  assert.strictEqual(got, send);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Create `lib/compose.js`** — port the anchored matcher and bounded ancestor scan.

```js
const SEND_RE = /^(send|send message|send chat|submit)$/i;
const DRAWER_CTRL = '[aria-label="close drawer"], [aria-label="Open chat list"], [data-testid^="chat-button"]';

function elName(el) {
  try { return String((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || el.innerText || el.textContent || '').trim(); } catch (_e) { return ''; }
}
export function findSendButton(composer) {
  if (!composer) return null;
  let scope = composer;
  for (let i = 0; i < 6 && scope; i += 1, scope = scope.parentElement) {
    let btns = [];
    try { btns = scope.querySelectorAll ? [...scope.querySelectorAll('button, [role="button"]')] : []; } catch (_e) {}
    const hit = btns.find((b) => SEND_RE.test(elName(b)));
    if (hit) return hit;
  }
  return null;
}
export function isDrawerComposer(composer) {
  let scope = composer;
  for (let i = 0; i < 5 && scope; i += 1, scope = scope.parentElement) {
    try { if (scope.querySelector && scope.querySelector(DRAWER_CTRL)) return true; } catch (_e) {}
  }
  return false;
}
export function findComposer() {
  let inputs = [];
  try { inputs = [...document.querySelectorAll('input[type="text"], textarea')]; } catch (_e) {}
  const candidates = inputs.filter((c) => { try { return /say something/i.test(c.getAttribute('placeholder') || '') || c.tagName === 'TEXTAREA' || c.type === 'text'; } catch (_e) { return false; } });
  // Prefer a non-drawer composer (the open profile's input) over the chat drawer.
  return candidates.find((c) => !isDrawerComposer(c)) || candidates[0] || null;
}
export function fill(composer, text) {
  if (!composer) return;
  try {
    composer.value = text;
    composer.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (_e) {}
}
export function submit(composer) {
  const btn = findSendButton(composer);
  if (btn && btn.click) { try { btn.click(); return true; } catch (_e) {} }
  try { composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; } catch (_e) {}
  return false;
}
export function confirmCleared(composer) { try { return !composer.value; } catch (_e) { return false; } }
export async function greet(text, { composer } = {}) {
  const c = composer || findComposer();
  if (!c) return false;
  fill(c, text);
  submit(c);
  return confirmCleared(c);
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): composer + send discrimination"`

---

### Task 9: observe.js — fetch/XHR/WS taps + auth capture

**Files:** Create `lib/observe.js`, `test/lib/observe.test.cjs`.

**Interfaces:**
- Produces: `createObserver({ onAuth?, onListResponse?, onWsSend?, onError?, isGrindrUrl? }) -> { install():void, uninstall():void }`. Default `isGrindrUrl` = real hostname test (`grindr.com` / `*.grindr.com`).

- [ ] **Step 1: Write failing test** — install, dispatch a fake fetch with an Authorization header, assert `onAuth` fires with the parsed token; uninstall restores original fetch.

```js
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let O;
test.before(async () => { O = await import('../../lib/observe.js'); });

test('install captures auth headers then uninstall restores fetch', async () => {
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
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Create `lib/observe.js`**

```js
const LIST_RE = /\/api\/(?:v1\/hides|v\d+\/blocks)/i;
function defaultIsGrindrUrl(u) {
  try { const h = new URL(String(u || ''), (globalThis.location && location.origin) || 'https://web.grindr.com').hostname.toLowerCase(); return h === 'grindr.com' || h.endsWith('.grindr.com'); } catch (_e) { return false; }
}
function headerGet(headers, name) {
  if (!headers) return '';
  try {
    if (typeof headers.get === 'function') return headers.get(name) || '';
    const lower = name.toLowerCase();
    for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) return headers[k];
  } catch (_e) {}
  return '';
}
export function createObserver({ onAuth, onListResponse, onWsSend, onError, isGrindrUrl = defaultIsGrindrUrl } = {}) {
  let rawFetch = null, installed = false;
  const emitAuth = (headers) => {
    if (!onAuth) return;
    const a = headerGet(headers, 'Authorization');
    const m = String(a).match(/^Grindr3\s+(.+)$/);
    if (!m) return;
    onAuth({ token: m[1], countryCode: headerGet(headers, 'country-code'), locale: headerGet(headers, 'l-locale') });
  };
  function install() {
    if (installed) return; installed = true;
    rawFetch = globalThis.fetch;
    globalThis.fetch = async function patched(input, init) {
      try {
        const url = String((input && input.url) || input || '');
        if (isGrindrUrl(url)) emitAuth((init && init.headers) || (input && input.headers));
      } catch (e) { if (onError) onError(e); }
      const res = await rawFetch.call(this, input, init);
      try {
        const url = String((input && input.url) || input || '');
        if (onListResponse && isGrindrUrl(url) && LIST_RE.test(url)) {
          res.clone().text().then((t) => { try { onListResponse({ url, data: JSON.parse(t) }); } catch (_e) {} }).catch(() => {});
        }
      } catch (e) { if (onError) onError(e); }
      return res;
    };
    // WS send tap (guarded)
    try {
      if (globalThis.WebSocket && WebSocket.prototype && onWsSend) {
        const origSend = WebSocket.prototype.send;
        globalThis.__grindrObsWsSend = origSend;
        WebSocket.prototype.send = function (data) { try { onWsSend(data); } catch (e) { if (onError) onError(e); } return origSend.apply(this, arguments); };
      }
    } catch (_e) {}
  }
  function uninstall() {
    if (!installed) return; installed = false;
    try { if (rawFetch) globalThis.fetch = rawFetch; } catch (_e) {}
    try { if (globalThis.__grindrObsWsSend) { WebSocket.prototype.send = globalThis.__grindrObsWsSend; delete globalThis.__grindrObsWsSend; } } catch (_e) {}
  }
  return { install, uninstall };
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): traffic observer (auth capture + taps)"`

---

### Task 10: reconcile.js — idsFromListPayload + reconcileTiers

**Files:** Create `lib/reconcile.js`, `test/lib/reconcile.test.cjs`. Port the hardened `idsFromListPayload` and its regression cases from `test/helpers.test.cjs`.

**Interfaces:**
- Consumes: a client exposing `blocks.listHides()` and `blocks.listBlocks()`.
- Produces: `idsFromListPayload(textOrObj):Set<string>`; `reconcileTiers(client, {maxPages=20}):Promise<{hideIds:Set, blockIds:Set, needsUpgrade:Set}>`.

- [ ] **Step 1: Write failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let R;
test.before(async () => { R = await import('../../lib/reconcile.js'); });

test('idsFromListPayload structural + empty-envelope + fallback', () => {
  const f = R.idsFromListPayload;
  assert.ok(f('{"hides":[{"profileId":600000000}]}').has('600000000'));
  assert.strictEqual(f('{"blocks":[],"totalCount":12345678}').size, 0);   // envelope number not an id
  assert.ok(f('garbage 700000123 tail').has('700000123'));               // parse-fail fallback
  assert.ok(f({ blocks: [{ profileId: 500000001 }] }).has('500000001')); // parsed object
});
test('reconcileTiers computes needsUpgrade (hides not in blocks)', async () => {
  const client = { blocks: {
    listHides: async () => [{ profileId: 1 }, { profileId: 2 }, { profileId: 3 }],
    listBlocks: async () => [{ profileId: 2 }],
  } };
  const r = await R.reconcileTiers(client);
  assert.deepStrictEqual([...r.needsUpgrade].sort(), ['1', '3']);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Create `lib/reconcile.js`** (port the hardened parser verbatim):

```js
import { isPlausibleProfileId } from './dom.js';

export function idsFromListPayload(text) {
  const out = new Set();
  let parsed = false;
  try {
    const seen = (v, d) => {
      if (!v || typeof v !== 'object' || d > 4) return;
      if (Array.isArray(v)) { for (const x of v) seen(x, d + 1); return; }
      const pid = v.profileId != null ? String(v.profileId) : '';
      if (isPlausibleProfileId(pid)) out.add(pid);
      for (const k of Object.keys(v)) { const x = v[k]; if (x && typeof x === 'object') seen(x, d + 1); }
    };
    seen(typeof text === 'string' ? JSON.parse(text) : text, 0);
    parsed = true;
  } catch (_e) {}
  if (!parsed && !out.size && typeof text === 'string') {
    for (const mm of text.matchAll(/(?:^|[^0-9])([0-9]{5,10})(?![0-9])/g)) if (isPlausibleProfileId(mm[1])) out.add(mm[1]);
  }
  return out;
}
export async function reconcileTiers(client, { maxPages = 20 } = {}) {
  const hides = await client.blocks.listHides();
  const blocks = await client.blocks.listBlocks({ maxPages });
  const hideIds = new Set(hides.map((r) => String(r.profileId)).filter(isPlausibleProfileId));
  const blockIds = new Set(blocks.map((r) => String(r.profileId)).filter(isPlausibleProfileId));
  const needsUpgrade = new Set([...hideIds].filter((id) => !blockIds.has(id)));
  return { hideIds, blockIds, needsUpgrade };
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): reconcile tiers + list parser"`

---

### Task 11: limiter.js

**Files:** Create `lib/limiter.js`, `test/lib/limiter.test.cjs`.

**Interfaces:**
- Produces: `createLimiter({ minIntervalMs=500, maxPerHour=500 }) -> { run(fn):Promise<any>, pending():number }`.

- [ ] **Step 1: Write failing test** (fake timers)

```js
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let L;
test.before(async () => { L = await import('../../lib/limiter.js'); });

test('run serializes and resolves in order', async () => {
  const lim = L.createLimiter({ minIntervalMs: 0, maxPerHour: 1000 });
  const order = [];
  await Promise.all([lim.run(async () => order.push(1)), lim.run(async () => order.push(2)), lim.run(async () => order.push(3))]);
  assert.deepStrictEqual(order, [1, 2, 3]);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Create `lib/limiter.js`**

```js
export function createLimiter({ minIntervalMs = 500, maxPerHour = 500 } = {}) {
  let chain = Promise.resolve();
  let lastAt = 0;
  const stamps = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function gate() {
    const now = Date.now();
    while (stamps.length && now - stamps[0] > 3_600_000) stamps.shift();
    if (stamps.length >= maxPerHour) { const wait = 3_600_000 - (now - stamps[0]); await sleep(Math.max(0, wait)); }
    const since = Date.now() - lastAt;
    if (since < minIntervalMs) await sleep(minIntervalMs - since);
    lastAt = Date.now(); stamps.push(lastAt);
  }
  let size = 0;
  function run(fn) {
    size += 1;
    const p = chain.then(async () => { try { await gate(); return await fn(); } finally { size -= 1; } });
    chain = p.catch(() => {});
    return p;
  }
  return { run, pending: () => size };
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): rate limiter"`

---

### Task 12: index.js — createClient facade

**Files:** Create `lib/index.js`, `test/lib/index.test.cjs`.

**Interfaces:**
- Consumes: every `createX` + pure modules + `VERSION`.
- Produces: `createClient({token?,countryCode?,locale?,base?,observe=false}) -> { auth, blocks, albums, chat, profiles, dom, compose, reconcile, limiter, observer }`; named re-exports: `conversationId, deriveOwnId, idsFromListPayload, dom, compose, VERSION`.

- [ ] **Step 1: Write failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
let G;
test.before(async () => { G = await import('../../lib/index.js'); });

test('createClient wires auth into the api modules', async () => {
  const g = G.createClient({ token: 'JWT', countryCode: 'US', locale: 'en-US' });
  assert.strictEqual(typeof g.blocks.hide, 'function');
  assert.strictEqual(typeof g.dom.resolveCascadeTile, 'function');
  assert.strictEqual(typeof g.reconcile.idsFromListPayload, 'function');
  assert.ok(g.auth.isReady());
});
test('observe:true installs an observer that fills auth', () => {
  const g = G.createClient({ observe: true });
  assert.ok(g.observer && typeof g.observer.uninstall === 'function');
  g.observer.uninstall();
});
test('VERSION is exported', () => { assert.match(G.VERSION, /^\d+\.\d+\.\d+$/); });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Create `lib/index.js`**

```js
import { createAuth } from './auth.js';
import { createBlocks } from './blocks.js';
import { createAlbums } from './albums.js';
import { createChat, conversationId, deriveOwnId } from './chat.js';
import { createProfiles } from './profiles.js';
import * as dom from './dom.js';
import * as compose from './compose.js';
import { createObserver } from './observe.js';
import { idsFromListPayload, reconcileTiers } from './reconcile.js';
import { createLimiter } from './limiter.js';

export const VERSION = '0.1.0';
export { conversationId, deriveOwnId, idsFromListPayload, dom, compose, createObserver, createLimiter };

export function createClient({ token, countryCode, locale, base, observe = false } = {}) {
  const auth = createAuth({ token, countryCode, locale, base });
  const blocks = createBlocks(auth);
  const client = {
    auth, blocks,
    albums: createAlbums(auth),
    chat: createChat(auth),
    profiles: createProfiles(auth),
    dom, compose,
    reconcile: { idsFromListPayload, reconcileTiers: (opts) => reconcileTiers(client, opts) },
    limiter: createLimiter,
    observer: null,
  };
  if (observe) {
    client.observer = createObserver({ onAuth: (a) => auth.set(a) });
    client.observer.install();
  }
  return client;
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `git commit -m "feat(lib): createClient facade"`

---

### Task 13: build-lib.mjs + dist freshness + README

**Files:** Create `scripts/build-lib.mjs`; Modify `package.json` (`verify`), `README.md` (Library section); generate `dist/grindr.esm.js`, `dist/grindr.global.js`.

**Interfaces:**
- Produces: `dist/grindr.esm.js` (single-file ESM, all modules inlined in dependency order, intra-lib imports stripped, one export block) and `dist/grindr.global.js` (same body wrapped in an IIFE assigning `window.Grindr = { createClient, createObserver, createLimiter, conversationId, deriveOwnId, idsFromListPayload, dom, compose, VERSION }`).

- [ ] **Step 1: Write `scripts/build-lib.mjs`** (stdlib only)

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const ORDER = ['errors','auth','blocks','albums','chat','profiles','dom','compose','observe','reconcile','limiter','index'];
const stripIntraImports = (src) => src
  .replace(/^\s*import[^;]*from\s*['"]\.\/[^'"]+['"];\s*$/gm, '')      // drop intra-lib imports
  .replace(/^\s*export\s+\*\s+as\s+\w+\s+from[^;]*;\s*$/gm, '');
let body = '';
for (const name of ORDER) {
  let src = readFileSync(new URL(`../lib/${name}.js`, import.meta.url), 'utf8');
  src = stripIntraImports(src).replace(/^\s*export\s+(function|class|const|async function)/gm, '$1');
  body += `\n// ---- lib/${name}.js ----\n${src}\n`;
}
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
const NAMES = ['createClient','createObserver','createLimiter','conversationId','deriveOwnId','idsFromListPayload','VERSION'];
const esm = `${body}\nexport { ${NAMES.join(', ')} };\nexport const dom = { resolveProfileIdFromElement, resolveCascadeTile, route, isProfileOverlayOpen, isOnChat, isPlausibleProfileId, PROFILE_PHOTO_SELECTOR, CASCADE_TILE_SELECTOR };\nexport const compose = { findComposer, findSendButton, fill, submit, confirmCleared, greet };\n`;
writeFileSync(new URL('../dist/grindr.esm.js', import.meta.url), esm);
const global = `(function(){\n'use strict';\n${body}\nconst dom = { resolveProfileIdFromElement, resolveCascadeTile, route, isProfileOverlayOpen, isOnChat, isPlausibleProfileId, PROFILE_PHOTO_SELECTOR, CASCADE_TILE_SELECTOR };\nconst compose = { findComposer, findSendButton, fill, submit, confirmCleared, greet };\nwindow.Grindr = { createClient, createObserver, createLimiter, conversationId, deriveOwnId, idsFromListPayload, dom, compose, VERSION };\n})();\n`;
writeFileSync(new URL('../dist/grindr.global.js', import.meta.url), global);
console.log('Built dist/grindr.esm.js + dist/grindr.global.js');
```

Note: because `lib/index.js` uses `import * as dom` / `import * as compose`, the build strips those and rebuilds `dom`/`compose` namespace objects explicitly (shown above). Ensure `lib/index.js`'s own `dom`/`compose` references resolve — in the concatenated build they become the local const objects defined after the module bodies, so move the `createClient` definition to reference `dom`/`compose` that exist at call-time (they are module-level consts in the IIFE/ESM scope). Verify by running the smoke test in Step 3.

- [ ] **Step 2: Run the build** — `node scripts/build-lib.mjs` → writes both files.

- [ ] **Step 3: Smoke-test the global build** — `test/lib/build.test.cjs`

```js
const test = require('node:test');
const assert = require('node:assert');
require('./stubs.cjs');
test('global build exposes window.Grindr', () => {
  globalThis.window = globalThis;
  require('../../dist/grindr.global.js');
  assert.strictEqual(typeof window.Grindr.createClient, 'function');
  assert.ok(window.Grindr.idsFromListPayload('{"hides":[{"profileId":600000000}]}').has('600000000'));
});
```

Run: `node --test test/lib/build.test.cjs` → PASS. If the concatenation leaves a dangling `import`/`export`, fix `stripIntraImports` and rebuild.

- [ ] **Step 4: Add dist-freshness to `verify`** — `package.json`:

```json
"build:check": "node scripts/build-lib.mjs && git diff --exit-code -- dist/",
"verify": "npm run check && npm test && npm run docs:check && npm run build:check"
```

- [ ] **Step 5: README** — add a `## Library (window.Grindr / ESM)` section:

````markdown
## Library (`window.Grindr` / ESM)

Reusable Grindr Web interaction primitives, extracted from the userscript.

```js
// Userscript / <script> (global build)
const g = Grindr.createClient({ observe: true });   // auto-captures auth from traffic
await g.blocks.hide('600000000');
const { needsUpgrade } = await g.reconcile.reconcileTiers();

// ESM
import { createClient } from './dist/grindr.esm.js';
const g = createClient({ token, countryCode: 'US', locale: 'en-US' });
```

Build: `npm run build:lib`. Modules: `auth, blocks, albums, chat, profiles, dom, compose, observe, reconcile, limiter`.
````

- [ ] **Step 6: Run full `npm run verify`** → all green (userscript tests + lib tests + docs + dist fresh).

- [ ] **Step 7: Commit** — `git add lib dist scripts test/lib package.json README.md && git commit -m "feat(lib): stdlib build (esm + global) + README + verify wiring"`

---

## Self-Review

**Spec coverage:** errors(§5)→T1; auth(§5)→T2; blocks(§5)→T3; albums→T4; chat→T5; profiles→T6; dom→T7; compose→T8; observe→T9; reconcile→T10; limiter→T11; index/createClient(§4)→T12; build/dist/README/verify(§3,§8)→T13. Testing matrix(§7) distributed across T1–T13. Out-of-scope(§9) honored (no UI/hotkeys/diagnostics). All covered.

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. The only judgment left to the implementer is fixing `stripIntraImports` if the concatenation leaves a dangling statement (Step 3 gives the exact failing signal and fix location) — an expected build-tuning loop, not a placeholder.

**Type consistency:** `auth.request(path, opts)` signature identical across T2–T6. `createBlocks(auth)`/`createAlbums(auth)`/etc. consistent. `idsFromListPayload` identical in T10 and the T13 smoke test. `reconcileTiers(client, opts)` consumes `client.blocks.listHides/listBlocks` (T3 names). `createClient` returns the exact keys the T12 test asserts. `VERSION` `'0.1.0'` (library version, distinct from the userscript's `SCRIPT_VERSION`).
