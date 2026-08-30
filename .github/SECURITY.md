# Security policy

## Reporting

Open a [private security advisory](https://github.com/mithudso/grindr-middle-click-block/security/advisories/new)
rather than a public issue. Include the version from the `@version` header and
what the script did versus what you expected.

## Scope

This is a userscript that runs in your own browser against your own Grindr
account. There is no server, no telemetry, and no third party — nothing leaves
your machine except the requests you would make anyway.

The things worth reporting:

- **A path that could act on the wrong profile.** The script sends messages and
  blocks people. A resolution bug is a real-world harm, not a cosmetic one, and
  this project has shipped that bug before — see the `v0.43.0` entry.
- **Anything that leaks the session token.** The script captures Grindr's
  `Authorization` header to replay its own calls. It must never log it, store
  it, or send it anywhere but `*.grindr.com`.
- **A way to reach the acting console functions without arming them.** Under
  `@grant none` the script shares a global scope with the page, so
  `greet` / `unlockAlbum` / the `clear*` family are disarmed until
  `__grindrBlock_arm()`.

## Out of scope

Grindr's own API behaviour, rate limits, and account actions. This project only
documents what it observes.
