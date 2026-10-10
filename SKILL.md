---
name: model-router
description: >
  Use when choosing a model or effort for a subagent by hand, when a subagent
  reports BLOCKED, fails the check its brief names, or two fix rounds in a row
  make no progress, or when the user asks about routing subagents or saving on
  models.
---

# model-router

A mod in this folder hooks every subagent start. It asks TypeSafe Jev how much
judgment and work the task needs. In `auto` mode it sets the subagent's model
and effort. The model is `haiku` for lookup or transcription, `sonnet` for
bounded judgment and `opus` for open judgment. In `suggest` mode it only logs
the model and effort it would pick. One dim line per dispatch appears in the
transcript.

## Mode

The mode is the `Routing mode` row in `/config`. To turn routing off, disable
the plugin in `/plugin`.

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

A model or an effort named in the Agent call is kept, so an escalated
re-dispatch passes `model` and `effort` explicitly in the Agent call. In
auto mode the hook also overrides a model or an effort pinned in an agent
definition's frontmatter, because the hook cannot see it.

## Commands

From the plugin folder:

- `claude plugin test .` runs the tests, no network.
- `node scripts/calibrate.ts` takes the TypeSafe API key from a masked prompt
  or stdin, runs the labelled seed against Jev and prints misses and
  agreement.
- `claude plugin validate .` lists the hooks and calls.
