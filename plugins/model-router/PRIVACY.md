# Privacy policy

model-router is a Claude Code plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-10-15.

## What the plugin sends

On every Agent tool call it routes, the plugin sends one HTTPS POST to
TypeSafe at https://api.typesafe.ai/v1/systemone. The request holds:

- the subagent's task text, condensed and with token-shaped strings masked
- the subagent's type
- the caller's one-line description of the task
- the Jev alias you chose, `jev-latest` or `jev-preview`, and two fixed
  scoring questions with their three descriptions each, text that ships with
  the plugin
- your TypeSafe API key, as the bearer token.

The task text holds whatever the caller put in it, which can include code. The
request is sent before Claude Code decides whether the call may run. Before
routing, the plugin asks Claude Code's permission rules about the call's
original arguments. If they deny the call, the plugin does not send the
request. A rule on the model the plugin picks, a PreToolUse hook and the
auto-mode classifier decide after the request left. A call that prompts you
for permission is sent before you answer. That list is the whole request. The
key identifies your TypeSafe account to TypeSafe. The plugin sends no
telemetry and no other identifier of you or your machine. With Claude Code's
`--debug` flag, the plugin writes each request body to your debug log, in
numbered pieces when it is long. The key is never written.

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
token of that request. When that option is empty, the plugin reads the key
from the environment variable `TYPESAFE_API_KEY`. It reads nothing else from
the environment. The Jev model choice lives in your Claude Code settings.
The lines the plugin prints per call go to your own transcript and, with
`--debug`, to your debug log.

## Your choices

Remove the key from the plugin's configuration and from that variable, and
the plugin skips routing. Disable the plugin and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
