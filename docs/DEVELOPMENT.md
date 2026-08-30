# Development

```sh
npm run check    # node --check on the userscript
npm test         # node --test, no dependencies
npm run verify   # both
```

There is no build, no bundler, no transpiler. Edit the `.user.js` and paste it in.

## The loop

1. Edit the userscript.
2. `npm run verify`.
3. Paste into Tampermonkey, reload the page.
4. If something misbehaves: HUD → `record` → reproduce → `save` and `har`.

Step 4 is the one that matters. Nearly every bug in this project was found from a
recording or from driving the live page — not from reading the code, which
repeatedly looked correct while being wrong about Grindr's DOM.

## Layout

| Path | What |
|---|---|
| `Grindr Middle-Click Block.user.js` | the whole script |
| `docs/grindr-dom-and-api.md` | observed routes, DOM shapes, endpoints, traps |
| `docs/function-reference.md` | every function, generated from source |
| `test/` | the suite; `stubs.cjs` is the fake DOM |
| `scripts/` | doc generation and the drift check |

## Conventions

- **Version in two places, together**: the `@version` header and `package.json`.
- **Changelog goes in the `@description` header.** It is long deliberately — it is
  the only record that travels with the file when someone pastes it into
  Tampermonkey, and this project's history is mostly a record of wrong assumptions
  about Grindr, which is worth carrying.
- **Comments explain why, not what.** The valuable ones name the capture that
  disproved an earlier belief.
- Regenerate the function reference after adding or renaming functions:
  ```sh
  node scripts/gen-function-reference.mjs
  ```

## Debugging aids

| Call | Does |
|---|---|
| `__grindrBlock_why()` | every precondition the action keys depend on |
| `__grindrBlock_setLog('trace')` | full verbosity |
| `__grindrBlock_record()` / `__grindrBlock_saveReport()` | capture and download |
| `__grindrBlock_captureWrites(30000)` | log every mutating request for 30s |
| `__grindrBlock_disable()` | kill switch — no-ops every listener, restores patched globals |

`__grindrBlock_disable()` answers "is the userscript causing this?" in ten seconds
without uninstalling. It is never gated behind arming, for that reason.

## Environment

No environment variables, no config file, no secrets. All state is `localStorage`
under the `grindrMiddleClick` prefix — see
[`external-calls.md`](external-calls.md) for the full key list.
