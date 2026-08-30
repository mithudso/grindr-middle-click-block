## What changed

<!-- One or two sentences. -->

## Why

<!-- What was broken or missing? If a capture or live inspection proved it, say so. -->

## Evidence

<!-- The thing that makes this reviewable. A log line, a captured request, a
     measurement. "It looks right" is not evidence — this project has shipped
     several bugs that looked right. -->

## Checklist

- [ ] `npm run verify` passes
- [ ] `@version` and `package.json` version bumped together
- [ ] Changelog entry appended to the `@description` header
- [ ] `docs/function-reference.md` regenerated if functions changed
- [ ] A regression test added, if this fixes a real bug
- [ ] No real profile or album ids anywhere in the diff
