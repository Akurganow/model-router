---
name: model-router
description: Use to pick a model or effort for a subagent by hand, when one reports BLOCKED or fails its check, or when asked about routing subagents or turning it off in OpenClaw.
---

# model-router

model-router scores each eligible `sessions_spawn` call through Jev, on TypeSafe or OpenRouter as the `provider` setting allows. At spawn, it sets `model` to the person's `small_model` for level 0, or to their `large_model` for level 2. Level 1 changes nothing. It also sets `thinking` to an effort of the ladder: `low`, `medium`, `high` or `xhigh`.

- The plugin writes a `model-router` line to the gateway log. It shows each decision, or the reason a spawn ran unrouted.
- The `scope` setting decides which agents the plugin routes.
- A spawn that sets `model` is never overridden. A spawn that sets `thinking` keeps it.
- A model set in `agents.defaults.subagents.model` or in an agent's `subagents.model` wins over the plugin.

## Escalation

Escalate when a subagent reports BLOCKED, fails the check its brief names, or two fix rounds in a row make no progress.

1. If the report shows skipped steps (a file not read, tests not run), re-dispatch with a brief that names those steps and a higher `thinking`.
2. Otherwise, re-dispatch with a stronger `model` and a new brief.
3. If the stronger model also fails, raise `thinking` one step at a time up to `xhigh`.
4. If `xhigh` also fails, stop and report to the person.

Use a flagship model only when the person opted in. Do not change a setting to reach one without their word.

## Re-dispatch

A spawn that sets `model` passes through unrouted, so the stronger model you name is the one that runs.

- Set `model` on `sessions_spawn` to a model the person's config allows. Its provider needs an API-key credential.
- Set `thinking` to one of `low`, `medium`, `high` or `xhigh`. Never set `max`, `ultra`, `adaptive`, `minimal` or `off`.
- Put the new brief in `task`. State what failed and which steps were skipped.
- Name no `agentId` unless the brief needs another agent.

```json
{
  "task": "Fix the failing test. Run npm test. The first run changed no test.",
  "model": "<stronger-model>",
  "thinking": "high"
}
```

Replace `<stronger-model>` with a model the person's config lists. If you do not know one, ask.

## Turn routing off

Ask the person to run `openclaw plugins disable model-router-openclaw`. To turn routing back on, they run `openclaw plugins enable model-router-openclaw`.

To find the settings that turn routing off, or to change the options, run the `model-router-setup` skill. To change one option, the person types `/model-router-provider` or `/model-router-scope`. They assign `small_model` and `large_model` in OpenClaw's config.
