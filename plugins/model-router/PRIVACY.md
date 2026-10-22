# Privacy policy

model-router is a Claude Code plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-10-15.

## What the plugin sends

On every Agent tool call it routes, the plugin sends an HTTPS POST to
TypeSafe at https://api.typesafe.ai/v1/systemone. The plugin bundles the
official TypeSafe SDK, `@typesafe-ai/sdk`, which builds the request. The JSON
body holds:

- the subagent's task text, condensed and with token-shaped strings masked.
  A text over 12,000 characters keeps its start and its end
- the subagent's type
- the caller's one-line description of the task
- the Jev alias you chose, `jev-latest` or `jev-preview`, and two fixed
  scoring questions, `tier` and `work`, with their three descriptions each,
  text that ships with the plugin.

The request headers hold:

- `authorization`, with the key
- `accept` and `content-type`, both `application/json`
- `user-agent` and `x-typesafe-sdk`, both naming the SDK and its version,
  `typesafe-sdk/0.7.0`
- `x-typesafe-runtime`, which reads `unknown` under Claude Code
- `x-typesafe-retry-count`, `1` or `2`, on a retry only.

Claude Code adds the transport headers, such as `host` and `content-length`.

The task text holds whatever the caller put in it, which can include code. The
request is sent before Claude Code decides whether the call may run. Before
routing, the plugin asks Claude Code's permission rules about the call's
original arguments. If they deny the call, the plugin does not send the
request. A rule on the model the plugin picks, a PreToolUse hook and the
auto-mode classifier decide after the request left. A call that prompts you
for permission is sent before you answer. That list is the whole request. The
key identifies your TypeSafe account to TypeSafe. The plugin sends no
telemetry and no identifier of you or your machine. With Claude Code's
`--debug` flag, the plugin writes each request body to your debug log, in
numbered pieces when it is long. The key is never written.

The key goes only to https://api.typesafe.ai/v1/systemone. No environment
variable moves it to another host.

## Requests and billing

A routed call sends one request and up to two retries, three attempts in all.
The SDK retries a connection error and an HTTP status 408, 429 or 5xx. It
waits for a `Retry-After` header when one comes, within the limit. It retries
no other status. The retries send the same body as the first request.

One fixed 8 s limit covers the whole call, retries included. The plugin
stops waiting at the limit, but it cannot recall a request in flight. A
request can reach TypeSafe even when its answer never returns, so a retry
after a network failure may be billed more than once.

## What TypeSafe does with it

TypeSafe processes the request to answer two scoring questions. Its handling of
request data is set by TypeSafe's own privacy policy at
https://typesafe.ai/legal/privacy-policy. The plugin author has no access to
those requests.

## What the plugin stores

The plugin stores nothing on disk itself. With `--debug`, Claude Code writes
each request body to its debug log file. In memory the plugin holds the
configured key while the hook is registered. It also holds the latest source
of each agent name Claude Code offers, such as `built-in`. Claude Code keeps
your API key in your system's secure storage as a
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
