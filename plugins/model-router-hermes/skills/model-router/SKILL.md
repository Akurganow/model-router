---
name: model-router
description: Use to pick a model or effort for a delegated task by hand, when a delegated task reports BLOCKED or fails its check, or when asked about routing subagents or turning it off in Hermes Agent.
---

# model-router for Hermes Agent

model-router is the `delegate_task` backend. It scores each task through Jev, on TypeSafe or OpenRouter as the `provider` setting allows.

- Level 0 gives the task the person's `small_model`, level 1 their `middle_model` and level 2 their `large_model`. A level whose slot is unset, or fails the plugin's offline check, keeps the model Hermes would give it.
- It sets `reasoning_effort` from a fixed ladder: `low`, `medium`, `high` or `xhigh`.
- Each result's `route.label` reads `model-router L<level> <model or slot state> · <effort> · …`, or `model-router skipped, <reason>`. The slot state is `<slot> model unset` or `<slot> model unresolved`.
- The person's `delegation` section wins: its `reasoning_effort` beats any effort, and its `model`, `provider`, `base_url` or `api_key` beats any level.

## Task parameters

Each `tasks[]` item takes three parameters of this plugin:

- `description`: one line that says what the task is. Set it on every task. Jev reads it with the goal.
- `reasoning_effort`: one of `low`, `medium`, `high` or `xhigh`. The child runs at it, and the plugin still picks the model.
- `level`: `0`, `1` or `2`. The child runs on that level's model, and Jev scores nothing. Such a task carries no `route.label` when its model is set. When the slot has no usable model, it runs on Hermes's model with the label `model-router L<level> <slot> model unset` or `unresolved`.

Leave `reasoning_effort` and `level` unset on a first dispatch. Set them only to escalate.

## Escalation

Escalate when a delegated task reports BLOCKED, fails the check its goal names, or two fix rounds in a row make no progress.

1. Read the failed task's `route`: the `L<level>` in its label, its `model` and its `reasoning_effort`. A task you pinned has the level you set. A skipped task counts as level 1.
2. At level 1 or 2, if the report shows skipped steps (a file not read, tests not run), re-dispatch at the same `level` with `reasoning_effort` one step above the failed task's effort.
3. Otherwise, at level 0 or 1, re-dispatch with `level` one above, and a goal that states what failed. Level 0 goes up on its first failure, skipped steps included.
4. When a level 2 task fails, re-dispatch it at level 2 with `reasoning_effort` one step above the failed task's effort, up to `xhigh`.
5. If `xhigh` at level 2 also fails, stop and report to the person.

A label that reads `<slot> model unset` or `<slot> model unresolved` means that level set no model, and the task ran on Hermes's own route.

A label that shows `config effort`, or a route whose `reasoning_effort` did not rise after you raised it, means the person's `delegation.reasoning_effort` holds the effort. A higher `reasoning_effort` then changes nothing. Skip the effort steps, and at level 2 stop and report that limit to the person.

## Re-dispatch

- Put the new brief in `goal`. State what failed and which steps were skipped.
- Set `description` to one line.
- Never set `max`, `ultra`, `minimal` or `none`. Hermes refuses a value off the list.
- Ask the person before you change a setting. A `subagent model set` label means their `delegation` section names a model, and no `level` overrides it.

```json
{
  "goal": "Fix the failing test in tests/test_api.py and run the test suite. The first run changed no test.",
  "description": "Fix one failing API test",
  "level": 2,
  "reasoning_effort": "high"
}
```

## Turn routing off

Ask the person to type `/delegation default`, which puts Hermes's own backend back from the next session. To find the settings that turn routing off, or to set routing up, load the `model-router-hermes:model-router-setup` skill.
