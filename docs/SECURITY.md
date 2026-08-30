# Security

## Threat model

The script runs in your browser, against your account, with no server and no third
party. So the interesting risks are not exfiltration — they are **the script doing
something on your behalf that you did not intend**, and **the page abusing the
script**.

| Risk | Mitigation |
|---|---|
| Acting on the wrong profile | A contradiction between the resolved target and the open profile **aborts** the action. Resolvers return `null` rather than guess. This has happened (`v0.43.0`) and the guard exists because of it. |
| The page calling our functions | Under `@grant none` the script shares a global scope with the page. The twelve acting functions — `greet`, `unlockAlbum`, `reshareAlbum`, the `clear*` family — are disarmed until `__grindrBlock_arm()`, per tab. |
| Session token leaking | Captured from Grindr's own requests, replayed only to `*.grindr.com`, never logged, never stored. Host checks parse the URL rather than substring-matching `grindr.com`. |
| Rate-limit or lockout | One queue, minimum interval, rolling hourly cap, backoff, and a hard pause on 401/403 until a canary succeeds. |
| Hostile data in a payload | Every observer is wrapped so a parse error cannot break the app's request. Ids must pass `isPlausibleProfileId` before reaching any API. Photo hashes are charset-validated before being interpolated into a selector. |
| A stored value being replayed | A stored album list URL is host-validated before it is used with the bearer token. |

## Deliberately not gated

`__grindrBlock_disable()` and `__grindrBlock_enable()` are always reachable. They
are the kill switch, and gating the one function whose value is being reachable
instantly would defeat it. Same for `cancelBlock` and `clearQueue`, which only
stop our own traffic.

## Not in scope

Grindr's API behaviour, its rate limits, and what it does with an account. This
project documents what it observes and paces itself conservatively.

## Reporting

See [`.github/SECURITY.md`](../.github/SECURITY.md).
