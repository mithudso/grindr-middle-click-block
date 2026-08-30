# Grindr Web — DOM & API reference

Everything here was **observed**, not inferred. Each entry says how it was confirmed:
a HAR capture, a diagnostic recording, or direct inspection of the live logged-in
page via browser automation on 2026-08-30.

This file exists because six rounds of this project were lost to reasoning about
markup and endpoints from the outside. When a matcher breaks again, check it here
before theorising.

---

## 1. Routes

| Route | Meaning |
|---|---|
| `/` | the cascade grid |
| `/?profile=true` | a profile overlay is open **over** the grid — no id in the URL |
| `/?profile=true&lightbox=true` | the photo lightbox is open on top of that profile |
| `/chat` | chat view — **bare, no id**. The conversation is selected in app state |
| `/login` | not authenticated |

**A profile overlay carries no id.** Anything needing "which profile is open" must
resolve it from the DOM or from traffic, never from the URL.

**Session is tab-local.** Opening `web.grindr.com` in a fresh tab lands on `/login`
even when another tab is signed in — the session is not in cookies. *Confirmed live.*

---

## 2. Cascade grid DOM

| Selector | Count on a live page | Notes |
|---|---|---|
| `[data-testid="cascadeCellContainer"]` | 18 | **the tile.** Alive and reliable |
| `[data-testid="masonry-scroll-container"]` | 1 | scroll host |
| `#cascade` | 1 | inner grid, ~3361 x 75814 px |
| `img[src*="cdns.grindr.com"]` | ~141 | **NOT all tiles** — see the trap below |

A tile measures ~559x745. Ancestor chain from a tile photo:

```
img.sc-jKCWkB.caHOKQ  [559x745]
└ picture                                    [0x0]
  └ div[data-testid=cascadeCellContainer]    [559x745]   ← the tile
    └ div.sc-lkCrJH …                        [559x745]
      └ div#cascade                          [3361x75814]
        └ div[data-testid=masonry-scroll-container]
```

### The trap: most profile photos are not tiles

Of ~141 profile images on a live page, **only 8–18 are in cascade cells**. The other
~132 are conversation avatars in the inbox sidebar. Walking up from one of those to
"the first ancestor ≥ 80x80" reaches a `UL` of **241x13414** — the whole sidebar.

A userscript that hides that element wipes the chat list. This actually shipped in
v0.38–v0.39. Any tile-resolution fallback must be bounded:

- stop as soon as an ancestor holds **more than one** profile photo (a tile holds exactly one)
- refuse anything **taller than the viewport**
- **return null rather than guess**

Verified after bounding: 8 tiles resolve, all 132 sidebar avatars refused, largest
target 559x745.

### Class names are useless

Grindr uses styled-components. Classes are content hashes (`sc-jKCWkB caHOKQ`) that
change per build. **Match on `data-testid`, `aria-label`, or geometry — never class.**
MUI is also present (~1967 `[class*="Mui"]` nodes), so `[class*="modal"]`-style
substring matching produces false positives.

---

## 3. Chat composer DOM

| Element | Shape |
|---|---|
| composer | `<input type="text" placeholder="Say something...">`, ~1152x23 |
| send button | `<button aria-label="Send">`, ~40x36, at the **far right** |

**The composer has no chat-ish ancestor.** `composer.closest("form, [class*='chat'], [class*='message'], [class*='conversation']")` returns **null** — the classes are hashes.
Scoping a send-button search that way finds nothing. Use a bounded ancestor walk
(6 levels) instead; that scope yields exactly one `Send` candidate.

**The Send button is `disabled` while the box is empty** and enables on the first
`input` event. Do not treat `disabled` as disqualifying — fill first, then look.

### Buttons on the composer row (all `aria-label`)

`Send` · `send location` · `send gif/gaymoji` · `send saved phrases` · `Tap` ·
`Friendly Tap` · `Looking Tap` · `Chat` · `message options` · `More` · `Reply` ·
`close drawer` · `Open chat list`

**`send location` is the classic trap.** A substring test for `send` matches it, and
it sits *left* of the input so it wins on DOM order. Anchor the match
(`/^(send|send message|send chat|submit)$/i`) and exclude attachment words.

---

## 3b. The profile overlay (`/?profile=true`)

**The overlay carries its own composer. There is no Chat button to press.**

When a profile is open, the detail pane ends in a `Say something...` composer —
`<input type="text">`, ~1152px wide. A greet should type into it directly. The only
element on the page named `Chat` at that moment belongs to the floating chat drawer,
not the profile.

### Two composers can be on screen at once

| Composer | Shape | Belongs to |
|---|---|---|
| `input` ~1152px @ x1801 | wide, under the profile | **the open profile** |
| `textarea` ~296px @ x2844 | narrow, bottom-right | the floating chat drawer |

A naive scorer prefers the **drawer** (a `textarea` earns a type bonus), which would
send the greeting into whatever conversation the drawer had open — a message to the
wrong person. Discriminate with drawer-only controls, bounded to ~5 ancestors:

```
[aria-label="close drawer"], [aria-label="Open chat list"], [data-testid^="chat-button"]
```

Verified: marks the 296px textarea as drawer, the 1152px input as not.

### `data-testid*="cascade"` does NOT identify the profile view

It matches `cascadeCellContainer` — a **grid tile**. A profile-view selector including
it resolves to a 559×745 tile containing **zero buttons**, which is exactly why a
Chat-button search kept coming back empty.

### The sidebar is full of decoys

~190 elements carry `data-testid="chat-button-<name>"` — those are **inbox
conversation rows**, not the profile's chat control. Any `[data-testid*="chat"]`
match will hit all of them.

---

## 4. API

Base `https://web.grindr.com`. All authed calls need `Authorization: Grindr3 <JWT>`
plus `country-code` and `l-locale` — **omitting the latter two returns 501**.

### Blocking / hiding

| Call | Result |
|---|---|
| `POST /api/v1/me/hides/{profileId}` | **200**. Confirmed live |
| `GET /api/v1/hides` | `{"hides":[{profileId,displayName,mediaHash}]}` — **complete and unpaginated** (3309 entries, ~230KB) |
| `GET /api/v4/blocks?page=1` | `{"blocks":[{profileId,displayName,mediaHash}]}` — 94 entries |
| `POST /api/v3/me/blocks/{id}` | block collection; only as a fallback when hide fails |

**Grindr's own hide button calls the same endpoint we do** — `POST /api/v1/me/hides/{id}`.
Confirmed by capturing the app's own click. There is no secret block call.

**A 200 here really does apply.** Verified by POSTing two hides and then asking
`/api/v1/hides`: both came back in the list. If a block "doesn't take", the API is
not the reason.

**But the cascade keeps serving hidden profiles.** Grindr's own client filters them
out locally; the server does not. So a hide is invisible until the client removes
the card. Any tool doing this must hide the card itself — immediately, not on a
timer — or the block looks like it failed.

### Hide vs block are genuinely different relationships

Verified live by performing each and then reading both lists back:

| Action | Call | Lands in | Removes from cascade? |
|---|---|---|---|
| **Hide** | `POST /api/v1/me/hides/{id}` → 200 | `/api/v1/hides` (3322) | **No** |
| **Block** | `POST /api/v3/me/blocks/{id}` → 200 `{"updateTime":0}` | `/api/v4/blocks` (94) | yes |

A blocked id appears in the **blocks** list and not in hides. `DELETE` on
`/api/v3/me/blocks/{id}` returns 200 and reverses it. Note the asymmetry:
**`DELETE /api/v1/me/hides/{id}` returns 501** — there is no un-hide via that verb.

Grindr's own card menu fires the *hide*, which is why copying it produced blocks
that never removed anyone from the feed.

Hide and block are **mutually exclusive states**. Firing a block after a successful
hide silently undoes it.

**A hide does not reliably remove the profile from the cascade.** Confirmed: hidden
profiles keep arriving in cascade payloads, so local DOM enforcement must continue
even after the server confirms the hide.

#### Entries that will never become real blocks (measured 2026-08-30)

A consequence of the two rules above, worth stating as a number because it looks
like a bug and is not. On the live account, a local block list of 1496 against
Grindr's 1656 real blocks:

| | count |
|---|---|
| present in the **blocks** list | 1105 |
| present in the **hides** list only | 156 |
| present in **neither** list | 235 |
| **cannot be converted** | **391** |

All 391 answer `POST /api/v3/me/blocks/{id}` with `200 {"updateTime":0}` and never
appear in `/api/v4/blocks`. Verified live: `remaining 391 → upgrade 5 → reconcile
→ remaining 391, promoted 0`.

* The **156** are hidden, and hide and block are mutually exclusive, so the block
  is a no-op. They cannot be un-hidden either — `DELETE /api/v1/me/hides/{id}` is
  the 501 noted above. There is no known route from hidden to blocked.
* The **235** are in neither list and almost certainly no longer exist (deleted or
  banned accounts). Grindr accepts the write and discards it.

**Decision (operator, 2026-08-30): leave them permanently hidden-not-blocked.**
Do not add an unhide-then-block path; there is no working unhide verb, and the
question has been asked and answered. v0.60.0 retires an entry after
`MAX_UPGRADE_ATTEMPTS` completed POSTs the next authoritative walk does not
reflect. Retired entries stay blocked LOCALLY — the card is still hidden and the
enforcement sweep still applies — they are excluded only from the hide→block
backlog, so that backlog can reach zero. `__grindrBlock_stuckBlocks()` lists them.

Note the walk itself is NOT implicated here and was suspected twice without
cause: a capture shows pages 1–17 read, an empty page 18 ending the loop, and
1656 ids collected, matching the total Grindr reports exactly.

### Albums

| Call | Result |
|---|---|
| `GET /api/v1/albums/{albumId}/shares` | `{"profileIds":[…]}` — who already holds it |
| `POST /api/v1/albums/{albumId}/shares` | body `{"profiles":[{"profileId":N,"shareId":"<uuid4>"}]}` |
| `PUT /api/v1/albums/{albumId}/unshares` | same body shape, fresh uuid |
| `POST /api/v2/albums/shares` | body `{"profileId":"N"}` → `{profileId,hasAlbum,hasSharedWithMe}` — a **query**, despite the name |
| `GET /api/v1/albums/{id}` | **405** — path exists, verb doesn't |

An album that answers **403** is not yours (deleted or invalid). Retire it; retrying
stalls the rotation forever.

### Chat

| Call | Result |
|---|---|
| `GET /api/v4/chat/conversation/{a}:{b}/message?limit=20` | history |
| `POST /api/v4/chatstatus/typing` | `{"conversationId":"{a}:{b}","status":"Typing"}` |
| `POST /api/v1/inbox/conversation` | **500** for a conversation that doesn't exist yet — do not use to create one |

**Sending a message produces no HTTP request.** Chat goes over the WebSocket. The
only HTTP trace is the typing indicator. To confirm a send, watch the composer clear
or inspect outbound WS frames.

**Conversation ids are SORTED, not `<me>:<them>`.** Same account observed as
`500000000:600000000` (first) and `400000000:500000000` (second) and
`400000001:500000000` (second). Ascending numeric. A single id identifies neither
party — derive your own id by intersecting two different conversations.

### Blocked/hidden profiles refuse chat

`GET /api/v4/chat/conversation/{id}/message` → **403** `urn:gr:err:unauthorized_action`
for a profile you have hidden, and the profile renders **no Chat button**. Greeting
one can never succeed; fail fast rather than polling.

### Other

`GET /api/v4/cascade/?sexualPositions=…&nearbyGeoHash=…&pageNumber=N` ·
`GET /api/v7/profiles/{id}` · `POST /api/v4/views/{id}` ·
`GET /api/v1/consumables/inventory` · `GET /api/v1/boost/sessions?limit=1`

---

## 5. Keyboard reality

`Insert` does not exist on Apple keyboards — it produces **no keydown at all**.
`F8` is a media key unless "Use F1, F2 as standard function keys" is enabled.

`Delete`, `Home`, `End`, `PageUp`, `PageDown` all arrive normally. *Confirmed by a
recording in which every other key logged an event and Insert logged nothing.*

Never hard-code a key you cannot verify on the target hardware. Let the user rebind.

## Cascade tiles without a photo (observed 2026-08-30, live page)

A profile with no public picture renders the grey silhouette as an **inline
`data:image/svg+xml` `<img>`**, not a hosted image:

```html
<div data-testid="cascadeCellContainer" class="sc-cLEHLr eVWQRw">
  <picture>
    <source media="(max-width: 768px)"
            srcset="data:image/svg+xml,%3csvg%20width='124'%20height='124'...">
```

That `src` matches none of `PROFILE_PHOTO_SELECTOR`'s host patterns
(`cdns.grindr.com`, `grindr.com/images/profile`, `.cloudfront.net/profile`) and
carries no filename hash, so such a tile is invisible to any photo-driven pass
and cannot enter the photo-hash index.

**Measured on the live grid**, 30 cascade cells:

| | count |
|---|---|
| tiles with a hosted photo URL | 17 |
| tiles with a `data:` placeholder only | **13** |
| identifiable by `findProfileIdInFiber` | **30 / 30** |

So roughly four in ten tiles could not be reached by the image-driven
enforcement sweep. A blocked profile with no picture stayed on the grid
indefinitely — which is why pressing `End` on one answered "already blocked".

Fixed in v0.57.0 by a second sweep pass that walks `CASCADE_CARD_SELECTOR`
elements directly and resolves each id from the React fiber. This is safe where
the v0.38 geometry fallback was not: a cascade cell is a grid tile by
definition, so the walk cannot wander into the chat sidebar.

### Identity: always ask the fiber, and ask it properly

Every cascade cell is identifiable — 100% of them, measured across two grid
states, including placeholder-only tiles and tiles rendered ahead of the
viewport. But the id is not always a scalar prop. An off-screen cell exposes it
only as **`props.profile.profileId`**, nested one level:

```
fiber props: { profile: { profileId, onlineUntil, lastOnline, distanceMeters,
                          primaryImageUrl, favorite, viewed, chatted, ... },
               height, width }
```

`findProfileIdInFiber` already checks `props.profile?.profileId` (along with
`item`, `data` and `user` variants) and so reaches all of them. A shortcut
resolver that only reads scalar `props.profileId` finds about 80% and makes the
remainder look like non-profile cells — an earlier pass of this investigation
reported exactly that and was wrong. If a future measurement claims some cells
are unidentifiable, check the resolver before believing it.

Cells rendered ahead of the viewport measure 132x176 rather than the on-screen
559x745, and carry `$hasUnread` / `$isThrob` styled-component props. They are
ordinary profile cells, not a carousel or promo row.

### The sidebar avatars, for contrast

The same page holds 148 profile images, of which **130 are inbox-sidebar
avatars**: 40x40 `MuiAvatar` elements whose nearest multi-photo ancestor is a
`UL` measuring 241x13627. `cardForImage` refuses all of them, which is correct —
collapsing that `UL` would wipe the chat list (the v0.38 bug). Any future change
to card resolution must keep refusing them.
