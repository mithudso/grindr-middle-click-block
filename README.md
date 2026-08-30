# Grindr Middle-Click Block

A userscript for `web.grindr.com`. Block and hide profiles from the grid, send
canned greetings, unlock albums, and drive the whole thing from the keyboard —
with an on-screen HUD that shows what every key does and can record a diagnostic
bundle when something misbehaves.

Single file, no dependencies, `@grant none`. Paste
`Grindr Middle-Click Block.user.js` into Tampermonkey.

---

## What it does

| Feature | How |
|---|---|
| **Block a profile** | middle-click, shift+left-click, or `Home`. Sends a real block (`POST /api/v3/me/blocks/{id}`), hides the card immediately, offers a 30-second Undo. |
| **Hide a profile** | `End`. **Local only** — no API call, nothing sent to Grindr. Persists across reloads, expires after 90 days, and reverses itself if they message you. |
| **Greet a profile** | `Insert` (or rebind). Picks a random canned phrase, types it into the profile's own composer, sends, then advances / stays / returns to the grid as you prefer. |
| **Unlock an album** | `Delete`. Shares the next album that profile does not already have, in your configured order. Albums Grindr refuses (403) retire themselves. |
| **Navigate** | `PageUp` / `PageDown`. Grindr's own pager on an open profile; a visual tile cursor on the grid. |
| **Text filter** | Optional. Auto-hides or auto-blocks profiles whose text matches a keyword list. |
| **Stay logged in** | Neutralises the 30-minute idle logout from the userscript sandbox. |

Every key is **rebindable** — click its row in the HUD and press the key you want.
This matters more than it sounds: `Insert` does not exist on Apple keyboards and
`F8` is a media key, so a hard-coded default is a guess about your hardware.

## The HUD

Toggle with `\` or the badge in the corner. Draggable; position is remembered.

- **main** — live state, the resolved target and why a key would refuse, block
  tiers, and buttons for `record` / `save` / `har` / `reconcile` / `drain` /
  `unblock <id>`.
- **settings** — what happens after a greet or a block, and whether a blocked
  card disappears immediately.
- **greetings** — edit the phrase list, one per line.

## Diagnostics

`record` captures every log line at trace detail, every hotkey decision (including
the ones that *refused*, and why), every click with the profile id it resolves to,
the page's own console errors, and all network traffic — ours marked `>>`.

`save` writes a text report; `har` writes a real HAR 1.2 file that opens in any HAR
viewer. Nearly every bug in this project's history was found from one of those two.

## Console API

Read-only diagnostics are always available. The twelve functions that *act* —
`greet`, `unlockAlbum`, `reshareAlbum`, the `clear*` family — are disarmed until
`__grindrBlock_arm()`, because under `@grant none` anything else running on the
page can call them.

```js
__grindrBlock_why()            // every precondition the action keys depend on
__grindrBlock_hotkeys()        // current bindings, and .greet() / .block() / …
__grindrBlock_state()          // queue, auth, block list, tiers
__grindrBlock_settings()       // read or set behaviour
__grindrBlock_greetings()      // read or replace the phrase list
__grindrBlock_blockTiers()     // pending vs confirmed blocks
__grindrBlock_autoDrain(true)  // background hide→block migration
__grindrBlock_disable()        // kill switch — never gated
```

## Docs

- [`docs/grindr-dom-and-api.md`](docs/grindr-dom-and-api.md) — the Grindr
  interaction library: routes, DOM shapes, endpoints, and the traps. Everything
  in it was **observed**, and each entry says how it was confirmed.
- [`docs/function-reference.md`](docs/function-reference.md) — every named
  function in the script, generated from the source.

## Tests

```sh
npm run verify      # syntax check + test suite
npm test            # node --test, no dependencies
```

The suite boots the whole IIFE under DOM stubs — which catches "the script died
at document-start", something a syntax check cannot — then covers the public API,
hotkey routing, persisted state, and a regression file where **every case is a bug
that actually shipped**, each named in a comment.

What the suite deliberately does **not** cover: anything needing real layout or a
live session. Those were verified by driving the logged-in page directly, and the
findings live in the interaction library rather than in a fake DOM that would only
ever tell us what we already assumed.

## A note on scope

This automates one person's own account. It is rate-limited on purpose, it never
handles credentials, and the actions that touch other people are behind an arming
gate. The block queue paces itself and backs off when Grindr says to.
