---
name: model-router
description: >
  Use when choosing an agent for a task spawn by hand, when a subagent reports
  BLOCKED, fails the check its brief names, or two fix rounds in a row make no
  progress, or when the user asks about routing subagents in omp or about
  turning routing off.
---

# model-router

model-router scores each eligible `task` item through Jev, on TypeSafe or OpenRouter as the `provider` setting allows. At spawn, it gives omp's bundled `task` agent the `smol` role for level 0, or the `slow` role for level 2. Level 1 changes nothing. The plugin sets no effort and changes no setting.

- The batch line starts with `model-router`. It shows each decision, or the reason an item ran unrouted.
- A named agent is never routed. It runs on its own model.
- A generic `task` item cannot set a model. The model comes from the agent's definition or from `task.agentModelOverrides`.

## Escalation

Escalate when a subagent reports BLOCKED, fails the check its brief names, or two fix rounds in a row make no progress.

1. If the report shows skipped steps (a file not read, tests not run), re-dispatch to the same agent with a brief that names those steps.
2. Otherwise, re-dispatch to an agent whose model is stronger.
3. If the stronger agent also fails, stop and report to the user.

To find a stronger agent, read the agents the task tool lists. omp's bundled agents are `scout`, `reviewer`, `security-reviewer`, `sonic` and `task`. Your own agents also appear. Check an agent's model in its definition or in `task.agentModelOverrides` before you name it.

Use a flagship model only when the user opted in. Do not change a role or a setting to reach one without the user's word.

## Re-dispatch

A named agent is not routed, so the re-dispatch keeps the agent's model.

- Set `agent` on the item to the stronger agent.
- Do not set `agent` to `task`. Routing would score the item again and may pick the same small model.
- Set `solutionSpace` on the item. It says how open the problem is.
- Put the new brief in `task`. State what failed and which steps were skipped.
- Set `effort` only when the item's schema lists it.

```json
{
  "context": "Failed check: npm test. The first run changed no test.",
  "tasks": [
    {
      "agent": "stronger-agent",
      "solutionSpace": "one fix: failing test, cause open",
      "task": "Fix the failing test. Run npm test."
    }
  ]
}
```

Replace `stronger-agent` with an agent that the task tool lists.

## Turn routing off

Disable the model-router plugin in omp, then restart omp. To turn routing back on, enable the plugin and restart.

To find the settings that turn routing off, run the `model-router-setup` skill. To change the `smol` and `slow` roles, run the same skill.
