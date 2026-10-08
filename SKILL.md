---
name: model-router
description: Use when choosing a model for a subagent by hand, when a subagent reports BLOCKED or a fix loop reaches its fourth round, or when the user asks about routing subagents or saving on models.
---

# model-router

A mod in this folder hooks every subagent start. In `auto` mode it asks
TypeSafe Jev how much judgment the task needs and sets the subagent's model:
`haiku` for lookup or transcription, `sonnet` for bounded judgment, `opus` for
open judgment. In `suggest` mode it only logs the model it would pick. One dim
line per dispatch appears in the transcript.

## Mode

The mode is the `Routing mode` row in `/config`. To turn routing off, disable
the plugin in `/plugin`.

## Escalation

Escalation follows superpowers:subagent-driven-development. One addition: the
hook keeps a model the caller names, so an escalated re-dispatch passes
`model` explicitly in the Agent call.

An explicit model the user names always wins: pass it in the Agent call.

## Commands

- `claude plugin test ~/.claude/skills/model-router` runs the tests, no network.
- `node ~/.claude/skills/model-router/scripts/calibrate.ts` runs the labelled seed against Jev and prints misses and agreement.
- `claude plugin validate ~/.claude/skills/model-router` lists the hooks and calls.
