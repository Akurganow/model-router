# model-router

A Claude Code mod that picks the cheapest Claude model for each subagent before
it starts. On every subagent dispatch the mod condenses and redacts the task
text, asks [TypeSafe Jev](https://docs.typesafe.ai) one Score question, and
sets the subagent's model: `haiku` for lookup or transcription, `sonnet` for
bounded judgment, `opus` for open judgment.

## Requirements

- Claude Code v2.1.287 or later (mods are on by default).
- A TypeSafe API key from https://console.typesafe.ai/keys. The install dialog
  asks for it and keeps it in your system's secure storage. To set it later, run
  `/plugin configure model-router@model-router` in a session.
- Node 23.6 or later to run the calibration script.

## Install

```
/plugin install model-router --marketplace Akurganow/model-router
```

Answer `y` to add the marketplace, then pick the user scope.

## Mode

The `Routing mode` row in `/config` holds the mode:

- `suggest` (default): log the model Jev would pick, change nothing. One dim
  line per dispatch shows the pick beside the model that ran.
- `auto`: set the model.

To turn routing off, disable the plugin in `/plugin`.

The hook keeps a model passed in the Agent call. In `auto` mode it overrides
a model pinned in an agent definition's frontmatter, because the hook cannot
see it. Forks, agent-team teammates and workflow agents pass through untouched.

## What leaves the machine

The subagent's prompt goes to one endpoint, `https://api.typesafe.ai/v1/systemone`,
in an HTTPS POST with your TypeSafe API key as the bearer token, after two steps: fenced code blocks are
replaced by a one-line size note, and token-shaped strings are masked
(`Bearer …`, `sk-…` keys, assignments to names ending in `key`, `token`,
`secret` or `password`). The subagent's type and the caller's one-line
description go with it. Nothing else is sent, fetched or run. Any failure,
from a missing key to a timeout, leaves the dispatch unchanged.

## Calibration and tests

From the plugin folder:

```
claude plugin test .
node scripts/calibrate.ts --key <your TypeSafe API key>
```

The calibration script sends `calibration.jsonl`, twenty-one labelled briefs,
to the same endpoint and exits 1 when agreement falls below 85%. A miss is
fixed by rewording a tier text in `hooks/router.ts`, never by lowering the bar.
