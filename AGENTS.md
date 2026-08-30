# Agents

This repository defines no repo-local agents. It is a single file with no server,
no MCP servers, and no orchestration.

The tooling that matters here is inside the script itself — it is built to explain
its own behaviour rather than require an agent to infer it:

| Surface | What it answers |
|---|---|
| `__grindrBlock_why()` | every precondition the action keys depend on, in the order they are checked |
| HUD → `record` / `save` / `har` | a full timeline: hotkey decisions including refusals, clicks with resolved ids, sweep results, and all network traffic with ours marked `>>` |
| `__grindrBlock_state()` | queue depth, auth age, block tiers, drain progress |
| `__grindrBlock_disable()` | rules the script in or out in ten seconds |

Any agent working on this repository should reach for a capture before reading
code. The code has repeatedly looked correct while being wrong about Grindr's DOM;
the captures are what settled it every time.

See [`CLAUDE.md`](CLAUDE.md) for the working rules.
