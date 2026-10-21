---
date: 2026-10-21
heist: multi-harness
phase: laundering
tags: [laundering, jscpd, audit, exceptions]
severity: medium
---

# A narrow audit produced false exceptions

## What Happened

jscpd ran on a subset of files and missed three clone clusters between the Claude mod's router tests and the shared core tests. Two exceptions went to the Don as unavoidable. One was an import-list clone caused by dead test scaffolding. The other described the supply-chain risk in the wrong step of the workflow. Both turned out to be fixable.

## Cognitive Diagnosis

The agent recorded the first explanation that fit as the exception and did not look for the cause behind the finding.

## Negative Constraint

NEVER scope a Laundering scan to a subset of source folders or submit an exception before tracing its cause, because a narrow scan hides defects and an untraced exception asks the Don to accept a fixable one.
