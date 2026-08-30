# Contributing

## Before you change a matcher

Read [`docs/grindr-dom-and-api.md`](docs/grindr-dom-and-api.md) first. Nearly every
bug in this project's history came from reasoning about Grindr's markup or API from
the outside and getting it wrong. That file records what was actually **observed**,
and says how each entry was confirmed.

Two rules follow from that history:

1. **Never match a control by substring.** `aria-label*="send"` matches
   `Send Location`, which sits left of the composer and therefore wins on DOM
   order. Anchor the match and keep an exclusion list.
2. **A resolver that cannot identify its target must refuse, not guess.** A
   fallback that returns "something plausible" is how a message reaches the wrong
   person. Returning `null` is always the safer failure.

## Workflow

```sh
npm run verify     # node --check + the test suite
```

CI runs the same thing plus a docs-drift check. Both must pass.

- Bump `@version` in the userscript header and `version` in `package.json` together.
- Append a changelog entry to the `@description` header. It is long on purpose:
  it is the only record that travels with the file when someone pastes it into
  Tampermonkey.
- Regenerate `docs/function-reference.md` (`node scripts/gen-function-reference.mjs`)
  if you add, rename or remove a function.

## Tests

`test/helpers.test.cjs` imports the **real** helpers, not copies. Each block says
why the helper exists and what it must guarantee, so a failure tells you what the
behaviour was supposed to be rather than merely that something changed. Follow
that shape when you add one.

`test/regression.test.cjs` pins bugs that actually shipped, each named in a
comment. Add to it when you fix something real — that is what stops it coming back.

What the suite deliberately does **not** cover: anything needing real layout or a
live session. A stubbed DOM only ever confirms the assumptions that wrote the stub.
Verify those against a real page and write the finding into the interaction library.

## Identifiers

Profile and album ids in this repository are placeholders. Do not commit real
ones — not in code, not in docs, not in a commit message.
