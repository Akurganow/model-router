---
name: model-router
description: >
  Use when choosing a router agent or an effort for a task spawn by hand, when
  a subagent reports BLOCKED, fails the check its brief names, or two fix
  rounds in a row make no progress, or when the user asks about routing
  subagents in omp or about turning routing off.
---

# model-router

An extension in this plugin hooks every `task` call. For each generic item, it
asks TypeSafe Jev how much judgment and work the item needs. It then sets the
item's agent and effort.

- The agent is `router_light` for lookup or transcription, `router_mid` for
  bounded judgment and `router_heavy` for open judgment. Each runs the model
  of its own role.
- The effort is `lo`, `med` or `hi`. `router_light` never runs at its model's
  lowest level.
- The router writes an effort only when `task.enableEffort` is on. omp's
  `auto` thinking sets the level otherwise, and the line shows `auto`.

The extension routes an item only when its `agent` is absent or `task`. It
never overrides an agent, model or effort that you, omp or the user chose. It
shows one line per batch, starting with `model-router`, with one entry per
item. The line also gives the reason when the batch ran unrouted.

## Escalation

Escalate when a subagent reports BLOCKED, fails the check its brief names,
or two fix rounds in a row make no progress.

- If the report shows skipped steps (a file not read, tests not run),
  re-dispatch on the same agent at higher effort.
- Otherwise re-dispatch one tier up with a new brief that states what
  failed. The tiers run from `router_light` to `router_mid` to `router_heavy`.
- Level 0 goes one tier up on its first failure, skipped steps included.
  Level 0 is `router_light`.
- Above `router_heavy`, re-dispatch `router_heavy` with higher effort. Step
  `lo` to `med`, then `med` to `hi`. At `hi`, stop and report.
- Use a flagship model only when the user opted in. Routing never assigns it.
  Do not change a role to reach one without the user's word.

Raise effort one step at a time. The ceiling is `hi`, which the cap
`task.maxEffort` holds at `high`. Never raise that cap, and never ask for
`max`.

## Re-dispatch

A re-dispatch names its target, so routing leaves it alone.

- Set `agent` to a `router_*` agent. The extension skips an item that
  names any agent other than `task`.
- Set `effort` to `lo`, `med` or `hi`. The extension keeps an effort the
  caller sets.
- Put the new brief in `task`. State what failed and which steps were skipped.

Example: `router_mid` failed its check and skipped no step. The re-dispatch
goes one tier up and keeps the previous effort.

```json
{
  "context": "Failed check: npm test. The first run changed no test.",
  "tasks": [
    { "agent": "router_heavy", "effort": "med", "task": "Fix the failing test. Run npm test." }
  ]
}
```

The `effort` field exists only when `task.enableEffort` is on. Run
`omp config get task.enableEffort` if the field is missing. When it is off:

- Re-dispatch on the same agent for skipped steps, with a brief that lists
  them.
- Stop and report when the top-tier rule asks for more effort.
- Ask the user whether to run the setup to turn effort on.

## Turn routing off

Disable the plugin.

1. Run `omp plugin list` to find the model-router id.
2. Run `omp plugin disable <id>`.
3. Restart omp. Extension modules load at start.

To turn it back on, run `omp plugin enable <id>` and restart.

To change roles, the effort mode or the Jev alias, run the `model-router-setup`
skill.
