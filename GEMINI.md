# Working in this repository (Gemini CLI)

A single-file Tampermonkey userscript for `web.grindr.com`. No build, no
dependencies, no server.

## Read this before changing a matcher

[`docs/grindr-dom-and-api.md`](docs/grindr-dom-and-api.md) records what was
**observed** about Grindr's DOM and API, and how each entry was confirmed. Nearly
every bug in this project came from reasoning about that surface from the outside
and being wrong — repeatedly, and confidently. Check the library before forming a
theory.

## Rules that came from real failures

1. **Never match a control by substring.** `aria-label*="send"` matches
   `Send Location`, which sits left of the composer and wins on DOM order. Anchor
   the match, keep an exclusion list, and rank exact over loose.
2. **A resolver that cannot identify its target returns `null`.** A "plausible"
   fallback is how a message reaches the wrong person and the wrong card gets
   hidden. Both have happened.
3. **Shared behaviour belongs at the shared entry point.** Putting the card
   collapse in one gesture's wrapper meant middle-click and `Home` behaved
   differently for two versions.
4. **Do not gate the kill switch.** `__grindrBlock_disable()` exists to answer "is
   the userscript causing this?" in ten seconds.
5. **Evidence over inspection.** If you cannot show a capture, a measurement, or a
   live check, say the claim is unverified.

## Verify

```sh
npm run verify   # syntax + 31 tests + docs drift
npm run docs     # regenerate the generated docs
```

Bump `@version` and `package.json` together, and append a changelog entry to the
`@description` header — it is the only record that travels with the file.

## Diagnosing

The script records its own behaviour. HUD → `record` → reproduce → `save` and
`har`. The report names which gate stopped a hotkey, what each click resolved to,
and what the network did, with our own calls marked `>>`. Prefer that over
reading code.

## Never commit

Real profile or album ids, in code, docs, or a commit message. Placeholders use
the 4/5/6/8-hundred-million ranges; `scripts/check-docs.mjs` enforces it.
