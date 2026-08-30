# Architecture

One file, one IIFE, no dependencies, no build step. It runs at `document-start` in
the page's own context (`@grant none`) on `https://web.grindr.com/*`.

## Why a single file

It is pasted into Tampermonkey by hand. A build step would put a compiled artifact
between the source you read and the code that runs, and every bug in this project
was diagnosed by reading the running code. The cost is a long file; the benefit is
that what you paste is what you reviewed.

## Layers

```
  observation            actuation                surface
  ───────────            ─────────                ───────
  fetch / XHR patch      block & unblock queue    hotkeys (6, rebindable)
  WebSocket send/recv    greet flow               mouse gestures
  sendBeacon patch       album share rotation     HUD + settings + greetings
  MutationObserver       DOM enforcement sweep    diagnostic recorder
        │                        │                        │
        └──────── shared state (profile ids, tiers, lists) ┘
```

**Observation never mutates.** The patched globals only read: they capture auth
headers, index profile ids from payloads, learn which conversation is open, and
feed the recorder. Every one is wrapped so a parsing error can never break a
request the app depends on. Our own calls use `origFetch`, captured before the
patch, so they cannot re-enter the observers.

## The hard problem: identity

Grindr's grid exposes no profile ids, and `?profile=true` carries none either. So
identity is reconstructed, and **this is where every serious bug has lived** — a
wrong id means blocking or messaging the wrong person.

Resolution order, most authoritative first:

1. **The open conversation.** When a profile overlay is open, Grindr fetches
   `/api/v4/chat/conversation/<a>:<b>/message`. That names who is on screen and
   nothing else does.
2. **URL** — `/chat/<id>` on older builds.
3. **The open profile view**, via a bounded DOM search.
4. **Hover** — the tile under the pointer, resolved as a click would.
5. **The tile cursor**, then the last single profile the app fetched.

Two rules make this safe:

- **A contradiction aborts.** If the resolved target disagrees with the open
  profile, greet and block refuse outright. That guard exists because a message was
  once delivered to the wrong person (`v0.43.0`).
- **A resolver that cannot identify its target returns `null`.** Guessing is how
  the wrong card gets hidden and the wrong person gets messaged.

## Blocks: two tiers

A block is **pending** until Grindr's own list confirms it, then **confirmed**.

The distinction is only allowed to gate *API* work — `maybeReblock` skips a
confirmed id rather than re-POSTing. It must **never** gate DOM enforcement:
Grindr keeps serving profiles you have blocked until its cascade refreshes, so the
card only disappears because we remove it. v0.31 got this wrong and blocks stopped
working visibly.

Confirmation is authoritative, not inferred — `/api/v1/hides` returns the complete
list in one response, so one request answers it for every pending block at once.

## The enforcement sweep

One pass over **rendered** tiles, not one query per blocked id:

```
for each visible profile photo → hash → profileId → Set lookup → collapse
```

`O(images)`, not `O(ids × hashes × images)`. With a 500-entry block list the old
form did ~120,000 substring comparisons every three seconds and nearly all found
nothing, because the virtualised grid renders only a few dozen tiles.

## Rate limiting

Every write goes through one queue with a minimum interval, a rolling hourly cap,
exponential backoff, and a session-dead pause on 401/403. The auto-drain does not
send anything itself — it tops that queue up when it runs low, so it inherits all
of it and cannot burst.

## Decisions worth knowing

| Decision | Why |
|---|---|
| No build step | what you paste is what you reviewed |
| Observation is read-only | a parse error must never break the app's own request |
| Bindings are alias lists, rebindable | `Insert` does not exist on Apple keyboards; `F8` is a media key. Hard-coding a key is a guess about someone's hardware |
| Acting console functions are arm-gated | `@grant none` shares a global scope with the page |
| The kill switch is **never** gated | its whole value is being reachable in ten seconds |
| Anchored matching + exclusion lists | `aria-label*="send"` matches `Send Location`, which sits left of the composer and wins on DOM order |
| Card resolution by geometry is bounded | an unbounded walk reached a 241×13414 `UL` — the whole chat sidebar |
