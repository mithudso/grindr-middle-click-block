# Grindr Interaction Library — Design Spec

**Date:** 2026-08-30
**Status:** Approved (design), pending implementation plan
**Source:** extracted from `Grindr Middle-Click Block.user.js` and `docs/grindr-dom-and-api.md`

## 1. Overview

A modular, zero-dependency JavaScript library exposing the reverse-engineered
Grindr Web interaction surface — the authed REST API, the DOM/resolution rules,
composer send, traffic observation, and hide/block reconciliation — decoupled from
the userscript's UI (HUD, hotkeys, gestures, diagnostics).

The value is the *verified* knowledge: endpoints and required headers, the
sidebar-trap-safe tile resolution, composer drawer-vs-profile discrimination, the
hide-vs-block relationship, sorted conversation ids, and burst-logout rate limits —
all confirmed via HAR/live capture (see `docs/grindr-dom-and-api.md`).

## 2. Goals / Non-goals

**Goals**
- Reusable in a userscript (`window.Grindr` global) and in a bundled web app (ESM `import`).
- Every module independently testable with a stubbed `fetch`/DOM (no network), matching the repo's `node --test` suite.
- Zero runtime and dev dependencies. No bundler. A stdlib-only build script.
- Encode the verified API/DOM invariants so a consumer cannot trivially reintroduce the bugs this project already fixed.

**Non-goals**
- No UI (HUD, toasts), hotkeys, middle-click/touch gestures, diagnostics/HAR recorder, kill switch, settings persistence, or the stay-logged-in idle hack.
- No headless-Node runtime support (Grindr's session is tab-local and message-send is WebSocket-only). Node is used only to run tests.
- Not (yet) refactoring the userscript to consume the library — that is a possible later pass, called out but out of scope here.

## 3. Consumption & build (decided)

- **Source:** ES modules under `lib/`.
- **Distribution:** `scripts/build-lib.mjs` (Node stdlib only) concatenates the modules in dependency order and emits:
  - `dist/grindr.esm.js` — single-file ESM (named exports).
  - `dist/grindr.global.js` — IIFE that assigns `window.Grindr`.
- Because every module is first-party with no external imports, the build resolves the intra-`lib/` import graph by inlining modules in a fixed dependency order and stripping the intra-lib `import`/`export` lines; a single trailing export block (ESM) or `window.Grindr =` assignment (global) is appended. No third-party bundler.
- `package.json` `exports` maps the ESM entry to `dist/grindr.esm.js`; a freshness check (dist regenerated == committed) folds into `verify`, mirroring the existing `docs:check` pattern.

## 4. Statefulness (decided: factory-based)

API modules are **factories bound to an `Auth` instance** — not a global singleton —
so multiple credentials and clean test isolation are possible.

- `createAuth(config?)` → an `Auth` instance.
- `createBlocks(auth)`, `createAlbums(auth)`, `createChat(auth)`, `createProfiles(auth)` → namespaced method objects bound to that `auth`.
- `dom`, `compose`, `reconcile` core functions are **pure** (no auth): element/args in, value out. `reconcile.reconcileTiers` takes a bound client.
- `createObserver(handlers)` → `{ install, uninstall }`.
- `createLimiter(opts)` → a rate limiter.
- `createClient(opts)` wires the above into one object.

`window.Grindr` exposes `{ createClient, createObserver, createLimiter, dom, compose, reconcile, VERSION }` plus the pure static helpers (`conversationId`, `idsFromListPayload`, etc.). Userscript usage: `const g = Grindr.createClient({ observe: true });`

## 5. Module manifest & API

All ids are strings; every write path runs `encodeURIComponent` on the id and sends
`Authorization: Grindr3 <JWT>`, `country-code`, and `l-locale` (the last two absent → **501**).

### lib/errors.js
- `class GrindrError extends Error { status, code, path }` — `code` parsed from a `urn:gr:err:*` body when present.
- `class GrindrAuthError extends GrindrError` — credentials not ready.
- `parseErrorCode(body) -> string` — best-effort `urn:gr:err:*` extraction.
- Invariant: error messages never contain the token or raw auth header.

### lib/auth.js — `createAuth(config?) -> Auth`
- `set({ token, countryCode, locale, base? })` — validates `token` non-empty; stores. `base` defaults `https://web.grindr.com`.
- `clear()`, `isReady() -> boolean`.
- `headers(extra?) -> object` — `{ Authorization, 'country-code', 'l-locale', 'Content-Type':'application/json', ...extra }`; throws `GrindrAuthError` if not ready.
- `request(path, { method='GET', body?, signal?, timeoutMs=20000 }) -> Promise<any>` — `fetch(base+path, { method, credentials:'include', headers, body:JSON, signal })` with an internal `AbortController` timeout merged with any caller `signal`; parses JSON (or `null`); on `!res.ok` throws `GrindrError{ status, code, path }`; on network error `status:0`.
- `enc(id) -> string` — `encodeURIComponent(String(id))`.

### lib/blocks.js — `createBlocks(auth)`
- `hide(id) -> Promise<true>` — `POST /api/v1/me/hides/{enc}`. Does **not** chain a block (mutual exclusion; a trailing block undoes the hide).
- `block(id) -> Promise<true>` — `POST /api/v3/me/blocks/{enc}`.
- `unblock(id, kind='block') -> Promise<true>` — `kind:'block'` → `DELETE /api/v3/me/blocks/{enc}`; `kind:'hide'` → throws `GrindrError{ code:'no-unhide' }` because `DELETE /api/v1/me/hides` returns **501** (there is no un-hide via that verb).
- `listHides() -> Promise<Array<{profileId,displayName,mediaHash}>>` — `GET /api/v1/hides` (unpaginated).
- `listBlocks({ maxPages=20 } = {}) -> Promise<Array<...>>` — walks `GET /api/v4/blocks?page=N` until a page returns 0 ids.

### lib/albums.js — `createAlbums(auth)`
- `getShares(albumId) -> Promise<string[]>` — `GET /api/v1/albums/{enc}/shares` → `profileIds`.
- `share(albumId, profileId, shareId=uuid4()) -> Promise<any>` — `POST .../shares`, body `{ profiles:[{ profileId, shareId }] }`.
- `unshare(albumId, profileId, shareId=uuid4()) -> Promise<any>` — `PUT .../unshares`, same body shape.
- `queryShare(profileId) -> Promise<{profileId,hasAlbum,hasSharedWithMe}>` — `POST /api/v2/albums/shares`, body `{ profileId:String }` (a query despite the verb).
- `403` on album ops = album not yours; caller should retire it.

### lib/chat.js — `createChat(auth)` + static exports
- `conversationId(a, b) -> string` *(static, pure)* — ascending-numeric sorted `"{lo}:{hi}"`.
- `deriveOwnId(convA, convB) -> string` *(static, pure)* — intersect two id-pairs → the shared (your) id, else `''`.
- `getHistory(convId, limit=20) -> Promise<any>` — `GET /api/v4/chat/conversation/{enc}/message?limit=`. `403 urn:gr:err:unauthorized_action` = blocked/hidden → fail fast.
- `sendTyping(convId, status='Typing') -> Promise<any>` — `POST /api/v4/chatstatus/typing`, body `{ conversationId, status }`.
- Message send has **no HTTP** (WebSocket) — see `compose.greet`.

### lib/profiles.js — `createProfiles(auth)`
- `getProfile(id) -> Promise<any>` — `GET /api/v7/profiles/{enc}`.
- `getCascade(params) -> Promise<any>` — `GET /api/v4/cascade/?<query>`.
- `recordView(id) -> Promise<any>` — `POST /api/v4/views/{enc}`.

### lib/dom.js *(pure, browser)*
- Constants: `PROFILE_PHOTO_SELECTOR`, `CASCADE_TILE_SELECTOR = '[data-testid="cascadeCellContainer"]'`.
- `isPlausibleProfileId(id) -> boolean` — 5–10 digits.
- `resolveProfileIdFromElement(el, { hashIndex? } = {}) -> string` — strategies: chat-URL peer, `data-testid`/`aria`, optional photo-hash index, bounded React-fiber walk; `''` on miss.
- `resolveCascadeTile(el) -> Element|null` — outermost bounded wrapper: ≤4 hops, single profile photo, not taller than viewport; **returns null rather than guess** (sidebar-trap safe).
- `route() -> 'grid'|'profile'|'chat'|'login'`, `isProfileOverlayOpen()`, `isOnChat()`.

### lib/compose.js *(pure, browser; send is WS)*
- `findComposer() -> Element|null` — profile/active composer, drawer-discriminated by bounded ancestor walk vetoing `close drawer`/`Open chat list`/`chat-button` controls.
- `findSendButton(composer) -> Element|null` — anchored name `/^(send|send message|send chat|submit)$/i`, excludes `send location`/attachment controls; `disabled` while empty is not disqualifying.
- `fill(composer, text)`, `submit(composer) -> boolean`, `confirmCleared(composer) -> boolean`.
- `greet(text, { composer? } = {}) -> Promise<boolean>` — orchestrated fill → submit → confirm-by-clear.

### lib/observe.js — `createObserver({ onAuth?, onListResponse?, onWsSend?, onError?, isGrindrUrl? }) -> { install, uninstall }`
- `install()` patches `window.fetch`, `XMLHttpRequest` (open/setRequestHeader/send), and `WebSocket.prototype.send`, each guarded for frozen intrinsics (try/catch, degrade rather than throw).
- Captures `Authorization`/`country-code`/`l-locale` off real grindr.com requests → `onAuth({ token, countryCode, locale })`.
- Taps JSON responses whose URL matches `/api/(v1/hides|v\d+/blocks)` → `onListResponse({ url, data })`.
- Taps outbound WS string frames → `onWsSend(data)`.
- Real hostname test (default `isGrindrUrl`), never substring.
- `uninstall()` restores the true originals.

### lib/reconcile.js
- `idsFromListPayload(textOrObj) -> Set<string>` *(pure)* — structural walk; regex fallback **only when JSON parse failed**; whole-number-boundary + plausibility gate. (Ported hardened parser.)
- `reconcileTiers(client, { maxPages=20 } = {}) -> Promise<{ hideIds:Set, blockIds:Set, needsUpgrade:Set }>` — `needsUpgrade` = hides not present as real blocks.

### lib/limiter.js — `createLimiter({ minIntervalMs=500, maxPerHour=500 } = {})`
- `run(fn) -> Promise<any>` — serializes calls behind a min-interval gate and a rolling hourly cap. Opt-in; documents that Grindr force-logs-out on bursts.
- `pending() -> number`.

### lib/index.js
- `createClient({ token?, countryCode?, locale?, base?, observe=false } = {}) -> Client` — builds an `Auth`, optionally installs an observer wired to `auth.set` on capture, returns `{ auth, blocks, albums, chat, profiles, dom, compose, reconcile, limiter: createLimiter, observer }`.
- Re-exports pure statics (`conversationId`, `deriveOwnId`, `idsFromListPayload`, `dom`, `compose`) and `VERSION`.

## 6. Error handling

- Write/get methods throw `GrindrError` on hard failure; `GrindrAuthError` when creds are absent.
- List/query methods return data or `[]`.
- Documented known statuses per method: `403` (`unauthorized_action` → fail fast), `501` (missing headers / no un-hide), `405` (wrong verb), `500` (no such conversation).
- Never place the token in an error message or path query string.

## 7. Testing (node --test, stubbed fetch/DOM — no network)

| Area | Assertions |
|---|---|
| auth | `headers()` includes Authorization/country-code/l-locale; throws when unset; `request` encodes path, sets AbortController, maps `!ok`→GrindrError, network→status 0 |
| blocks | hide/block/unblock hit the right method+path+encoded id (stub fetch records); `unblock(id,'hide')` throws `no-unhide`; `listBlocks` walks pages and stops on empty; `listHides` parses |
| albums | share/unshare body shapes; `queryShare` posts `{profileId}` |
| chat | `conversationId` ascending sort; `deriveOwnId` intersection; `getHistory` 403 surfaces |
| dom | `resolveProfileIdFromElement` hits + misses; `resolveCascadeTile` bounds (single-photo, ≤viewport, ≤4 hops) and refuses the sidebar `UL` (returns null) |
| compose | `findComposer` prefers the profile input over the drawer textarea; `findSendButton` rejects `send location` |
| reconcile | `idsFromListPayload` structural + parse-fail-fallback + empty-envelope-with-numbers → empty (ported regression cases); `reconcileTiers` classifies needsUpgrade |
| errors | no token substring in any thrown message |

Stubs mirror `test/stubs.cjs`: a settable `fetch` response, minimal `Element`/`document` shims for the DOM tests.

## 8. Repo integration

- `package.json`: add `"build:lib": "node scripts/build-lib.mjs"`; extend `test` glob to include `test/lib/*.test.cjs`; add a dist-freshness check to `verify` (build then `git diff --exit-code dist/` or a hash compare).
- JSDoc on every exported symbol; a `## Library` section in `README.md` with a userscript and an ESM usage example.
- Zero new dependencies; Node `>=20` (already required).

## 9. Out of scope (YAGNI)

HUD, hotkeys, middle-click/touch gestures, diagnostics/HAR recorder, kill switch,
settings persistence, toasts, the stay-logged-in idle-timer hack. A later pass may
refactor the userscript to consume this library; not part of this work.

## 10. File manifest

```
lib/errors.js  lib/auth.js  lib/blocks.js  lib/albums.js  lib/chat.js
lib/profiles.js  lib/dom.js  lib/compose.js  lib/observe.js
lib/reconcile.js  lib/limiter.js  lib/index.js
scripts/build-lib.mjs
dist/grindr.esm.js  dist/grindr.global.js   (generated)
test/lib/{auth,blocks,albums,chat,dom,compose,reconcile,errors}.test.cjs
README.md (Library section)  package.json (scripts)
```
