---
name: model-router
description: >
  Use when choosing a model or effort for a subagent by hand, when a subagent
  reports BLOCKED, fails the check its brief names, or two fix rounds in a row
  make no progress, or when the user asks about routing subagents or saving on
  models.
---

# model-router

A mod in this folder hooks the Agent tool call. For each call it routes, it
asks Jev, on TypeSafe or OpenRouter as the `provider` option allows, how much
judgment and work the task needs. It then sets the subagent's model and
effort. The model is `haiku` for lookup or transcription,
`sonnet` for bounded judgment and `opus` for open judgment. One dim line per
routed call appears in the transcript. To turn routing off, disable the
plugin in `/plugin`.

The `scope` option decides which Agent calls the mod routes. A call that sets
a `model`, is a fork or has a `name` always passes through. The
[README](README.md#which-calls-are-routed) lists the cases for `core` and
`extended`, and says what `extended` does to the model and effort an agent
definition sets.

## Escalation

Escalate when a subagent reports BLOCKED, fails the check its brief names,
or two fix rounds in a row make no progress.

- If the report shows skipped steps (a file not read, tests not run),
  re-dispatch on the same tier at higher effort.
- Otherwise re-dispatch one tier up with a new brief that states what
  failed.
- Level 0 goes one tier up on its first failure, skipped steps included.
- Above opus, re-dispatch opus at `high`, then at `xhigh`. Use fable only
  when the user opted in. Otherwise stop and report.

An escalated re-dispatch passes `model` and `effort` explicitly in the Agent
call. A call that names a model is not routed. A call that names only an effort
gets a model and keeps its effort. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` and
`CLAUDE_CODE_EFFORT_LEVEL` outrank the plugin.

## Commands

From the repository root:

- `node scripts/build.ts` builds `hooks/register.js` from `src/`.
- `claude plugin test plugins/model-router` runs the tests, no network.
- `claude plugin validate plugins/model-router` lists the hooks and calls.
- `npx tsc -p src` type-checks the sources. `npx tsc -p .` type-checks the
  plugin tests, which need the declarations Claude Code writes beside a
  loaded mod.
- `node scripts/calibrate.ts <typesafe|openrouter> [model]` takes that
  provider's API key from a masked prompt or stdin, runs the labelled seed
  against Jev and prints misses and agreement. The model defaults to
  `jev-latest`.
