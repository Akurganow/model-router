# Privacy policy

model-router is a Claude Code plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-10-11.

## What the plugin sends

On every Agent tool call it routes, the plugin sends one HTTPS POST to
TypeSafe at https://api.typesafe.ai/v1/systemone. The request holds:

- the subagent's task text, condensed and with token-shaped strings masked
- the subagent's type
- the caller's one-line description of the task
- the fixed model name `jev-1.13.0` and two fixed scoring questions with their
  three descriptions each, text that ships with the plugin
- your TypeSafe API key, as the bearer token.

The task text holds whatever the caller put in it, which can include code. The
request is sent in both modes, `suggest` and `auto`, before Claude Code
decides whether the call may run. A call that your permission rules deny as
Claude made it is not sent. A rule on the model the plugin picks, a PreToolUse
hook and the auto-mode classifier decide after the request left. A call that
prompts you for permission is sent before you answer. That list is the whole
request. The key identifies your TypeSafe account to TypeSafe. The plugin
sends no telemetry and no other identifier of you or your machine. With Claude
Code's `--debug` flag, the plugin writes each request body to your debug log,
in numbered pieces when it is long. The key is never written.

## What TypeSafe does with it

TypeSafe processes the request to answer two scoring questions. Its handling of
request data is set by TypeSafe's own privacy policy at
https://typesafe.ai/legal/privacy-policy. The plugin author has no access to
those requests.

## What the plugin stores

The plugin stores nothing on disk itself. With `--debug`, Claude Code writes
each request body to its debug log file. In memory the plugin holds the
configured key while the hook is registered, and no routing state between
calls. Claude Code keeps your API key in your system's secure storage as a
sensitive plugin option. The plugin reads it only to send it as the bearer
token of that request. The routing mode lives in your Claude Code settings.
The lines the plugin prints per call go to your own transcript and, with
`--debug`, to your debug log.

## Your choices

Set the mode to `suggest` and the plugin changes nothing, while still sending
the request. Remove the key from the plugin's configuration and the plugin
skips routing. Disable the plugin and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
