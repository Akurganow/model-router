# Privacy policy

model-router is a Claude Code plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-10-09.

## What the plugin sends

On every subagent dispatch it routes, the plugin sends one HTTPS POST to
TypeSafe at https://api.typesafe.ai/v1/systemone. The request holds:

- the subagent's task text, condensed and with token-shaped strings masked
- the subagent's type
- the caller's one-line description of the task
- your TypeSafe API key, as the bearer token.

The task text holds whatever the caller put in it, which can include code. The
request is sent in both modes, `suggest` and `auto`. Nothing else leaves your
machine. The plugin sends no telemetry and no identifier of you or your
machine.

## What TypeSafe does with it

TypeSafe processes the request to answer one scoring question. Its handling of
request data is set by TypeSafe's own privacy policy at
https://typesafe.ai/legal/privacy-policy. The plugin author has no access to
those requests.

## What the plugin stores

The plugin stores nothing. Claude Code keeps your API key in your system's
secure storage as a sensitive plugin option, and the plugin reads it only to
sign the request. The routing mode lives in your Claude Code settings. The one
line the plugin prints per dispatch goes to your own transcript.

## Your choices

Set the mode to `suggest` and the plugin changes nothing, while still sending
the request. Remove the key from the plugin's configuration and the plugin
skips routing. Disable the plugin and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
