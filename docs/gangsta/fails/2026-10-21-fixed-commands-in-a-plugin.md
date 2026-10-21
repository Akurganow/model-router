---
date: 2026-10-21
heist: multi-harness
phase: the-hit
tags: [omp, plugin, skills, documentation]
severity: high
---

# Fixed commands and variables in a shipped plugin

## What Happened

The omp extension ran `omp config get` and read agent files from fixed paths and an environment variable. The setup skill listed shell commands step by step. Both were built from the omp source alone. The Don rejected them: no marketplace review accepts fixed commands, and a skill must say what to do, not how. The extension was rebuilt on `pi.getAllTools()`, which the omp documentation describes, and the skill was rewritten without commands.

## Cognitive Diagnosis

The source showed what works today, so the agent took it as the contract. The documented extension API was the contract, and it already exposed the needed facts.

## Negative Constraint

NEVER put fixed commands, paths or environment variables other than the TypeSafe key into plugin code or skill text, and never design against a harness from its source before reading its official documentation, because only the documented API is stable and reviewable.
