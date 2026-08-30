# External calls

Every request this script makes, and what happens when it fails.

There is exactly **one** external host: `web.grindr.com`. Nothing else is
contacted — no telemetry, no analytics, no CDN for code. The script has no
dependencies and loads nothing at runtime (`@grant none`, no `@require`).

Two fetch paths exist and the distinction matters:

| Path | Used by | Observed by the recorder? |
|---|---|---|
| `origFetch` | **our own** calls | yes, marked `>>` |
| `window.fetch` (patched) | Grindr's own traffic, which we observe | yes |

`origFetch` is captured before the patch is installed, so our calls never
re-enter the observers and cannot self-index. That design once made them
invisible to the recorder too — fixed in v0.37 by wrapping it for diagnostics
only.

---

## The inventory

| Call | Where | Method | Failure handling |
|---|---|---|---|
| `POST /api/v3/me/blocks/{id}` | `attemptRealBlock` | POST | rate-limited queue; 429 → 30s backoff; 401/403 → session-dead pause; 400/422 → dropped, no retry |
| `DELETE /api/v3/me/blocks/{id}` | `attemptRealBlock` | DELETE | same queue and policy; this is how Undo reverses a block |
| `POST /api/v1/me/hides/{id}` | `attemptHideOrBlock` | POST | legacy path (`BLOCK_MODE='hide'`); block collection as fallback |
| `GET /api/v4/blocks?page=1` | `reconcileBlockTiers` | GET | throttled to once per 30 min; failure leaves tiers unchanged |
| `GET /api/v1/hides` | `reconcileBlockTiers`, `verifyBlock` | GET | as above |
| `GET /api/v1/albums/{id}/shares` | `fetchAlbumShares` | GET | 403/404 **retires the album** from the rotation permanently |
| `POST /api/v1/albums/{id}/shares` | `shareAlbumWith` | POST | spaced by `ALBUM_MIN_INTERVAL_MS`; failure logged, rotation advances |
| `PUT /api/v1/albums/{id}/unshares` | `unshareAlbumFrom` | PUT | only from `__grindrBlock_reshareAlbum`, which is arm-gated |
| album list probe | `loadAlbumNames` | GET | probes candidates once, keeps the first that answers |

**Sending a message is not on this list, and that is not an omission.** Chat
travels over the WebSocket; the only HTTP trace is `POST /api/v4/chatstatus/typing`,
which Grindr sends. A send is confirmed by the composer clearing, plus an outbound
WS frame carrying the text.

## Rate limiting

Every write goes through one queue (`processQueue`):

- `MIN_INTERVAL_MS` between calls
- `MAX_PER_HOUR` rolling cap
- exponential backoff with jitter on retry
- a 401/403 latches `blockSessionDead` and **pauses the queue** until a canary succeeds
- `ENDPOINT_WRONG_STATUSES` (404/405/501) drop the job rather than loop

The hide→block auto-drain never sends anything itself. It only tops this queue up
when it has run low, so it inherits every protection above and cannot burst.

## Auth

The script does not authenticate. It captures the `Authorization` header from
Grindr's own requests and replays it, along with the `country-code` and `l-locale`
headers the API requires — omitting those returned 501.

The token is never logged, never stored, and never sent anywhere but
`*.grindr.com`. `__grindrBlock_state()` reports `authCaptured` as a boolean and an
age, never the value.

## Storage

All local, all prefixed `grindrMiddleClick` so the stay-logged-in guard preserves
them through Grindr's logout `clear()`.

| Key | Holds |
|---|---|
| `grindrMiddleClickBlockList_v1` | locally blocked profile ids |
| `grindrMiddleClickBlockConfirmed_v1` | ids Grindr confirms are blocked |
| `grindrMiddleClickHiddenList_v1` | local hides, `id → hiddenAt` |
| `grindrMiddleClickAlbums_v1` | album order, names, share ledger, your own id |
| `grindrMiddleClickSettings_v1` | after-greet / after-block behaviour |
| `grindrMiddleClickGreetings_v1` | your edited phrase list |
| `grindrMiddleClickKeys_v1` | key rebindings |
| `grindrMiddleClickHud_v1`, `…HudPos_v1` | HUD open state and position |
| `grindrMiddleClickDrain_v1` | auto-drain on/off |
| `grindrMiddleClickLastBlock_v1` | the last block, so it stays undoable |
| `grindrMiddleClickPendingGreet_v1` | queued greetings (`newtab` mode) |
