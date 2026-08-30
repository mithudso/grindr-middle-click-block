# Logging

## Levels

`LOG_LEVEL` is one of `silent` / `error` / `warn` / `info` / `trace`, cumulative,
default `info`. Change it live with `__grindrBlock_setLog('trace')`.

```
logError  logWarn  logInfo  logTrace
```

## Every line is offered to the recorder first

The four helpers push to the diagnostic recorder **before** the verbosity gate:

```js
function logTrace(...a) { diagPush('trace', a); if (logEnabled('trace')) console.debug(...a); }
```

That ordering is the point. A recording captures full trace detail without putting
your console into trace mode for the rest of the session — so you can reproduce a
problem at normal verbosity and still get everything.

## The recorder is partitioned

An early recording filled all 3000 entries in **four seconds**: 2952 of them were a
single trace line (`indexProfileFromPayload`, which fires once per profile, and
Grindr's hides list carries thousands). The one keypress it existed to capture was
evicted before it could be pressed.

So the buffer is split. Events, warnings and errors live in a ring that
high-volume trace **cannot** evict, and known floods are sampled 1-in-50 with the
omission recorded in the report. A recording can no longer drown itself.

## What is logged on the important paths

- **Every hotkey decision, including the refusals.** `hotkey-seen` records the key,
  whether we thought you were typing, and what had focus; `hotkey-ignored` names
  the gate that stopped it. "I pressed the key and nothing happened" was
  undiagnosable until this existed, because only a *successful* press was logged.
- **Every block and greet outcome**, with the reason on failure.
- **Every external call** — status, timing, request body, and the response body of
  anything that failed.
- **Every click**, with the profile id it resolves to.
- **The enforcement sweep** — images scanned, ids matched, cards collapsed, cards
  not found. A silent sweep is indistinguishable from a broken one.
- **The page's own `console.error` / `console.warn`**, since Grindr's errors are
  often the real story.

## What is never logged

The captured `Authorization` header, and the contents of outbound WebSocket frames
unless capture was explicitly armed with bodies. `__grindrBlock_state()` reports
`authCaptured` as a boolean and an age, never the token.

## Reports

`save` writes a text report — build, keymap, live state, `why()`, the profile
view's button inventory, a network table, and a relative-timestamped timeline.
`har` writes a real HAR 1.2 file that opens in any HAR viewer.

They are separate buttons on purpose: Chrome blocks a second automatic download
from one gesture behind a prompt that is easy to miss, which is why an earlier
version's `.har` silently never appeared.
