# Testing

```sh
npm run verify   # node --check + the suite
npm test         # node --test, no dependencies
```

CI runs both on every push and pull request, plus a docs-drift check.

## Coverage target

Meaningful coverage of the important and risky paths, with real assertions on
behaviour — **not** a line-percentage mandate. A line-coverage target on this
codebase would reward tests that execute DOM code against stubs and assert
nothing, which is exactly the kind of test that would have passed while every bug
in this project's history shipped.

## What the suite covers

| File | Covers |
|---|---|
| `load.test.cjs` | the IIFE boots to completion, installs its listeners, publishes the console API, and keeps acting functions disarmed while leaving the kill switch open |
| `keymap.test.cjs` | hotkey routing, alias matching, rebinding, and that a key with nothing to act on passes through instead of being swallowed |
| `helpers.test.cjs` | the pure helpers, imported for real — id validation, conversation-id sorting, hash safety, greeting tokens, list parsing, and all five matcher regexes |
| `regression.test.cjs` | bugs that actually shipped, each named in a comment |
| `settings.test.cjs` | persisted settings, greetings, block-tier invariants, auto-drain, and the recorder |

**The most valuable test is `load.test.cjs`.** A syntax check only proves the file
parses; booting the whole IIFE under DOM stubs is what catches "the script dies at
document-start", which happened and took a full round to find.

## How tests are written here

Each helper test states **why** the helper exists and **what** it must guarantee:

```js
// WHY: the single gate every profile id crosses before reaching the API. Two
// shipped bugs came from it being too loose…
// MUST: accept only a 5-10 digit STRING. Not a number, not padded, not longer.
```

So a failure tells you what the behaviour was supposed to be, not merely that
something changed. Where a rule came from a real capture, the comment says so.
That is the difference between a test that pins behaviour and one that records
whatever the code happened to do the day it was written.

## What is deliberately not covered

Anything needing real layout or a live session. A stubbed DOM only confirms the
assumptions that wrote the stub — and several bugs here were *caused* by exactly
those assumptions being wrong.

Those paths were verified by driving the logged-in page directly, and the findings
live in [`grindr-dom-and-api.md`](grindr-dom-and-api.md) as observations with a note
on how each was confirmed. That file is the regression suite for everything a stub
cannot reach.
