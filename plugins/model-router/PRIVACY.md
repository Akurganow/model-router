# Privacy policy

model-router is a Claude Code plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-10-24.

## Where requests go

The plugin asks Jev to score each Agent tool call it routes. Under the default
`core` scope, only the four built-in agents route. [The extended
scope](#the-extended-scope) adds the others. Jev answers on one or two
providers:

- TypeSafe, at https://api.typesafe.ai/v1/systemone, with your TypeSafe key
- OpenRouter, at https://openrouter.ai/api/v1/systemone, with your OpenRouter
  key.

The plugin's `provider` option decides which providers receive the task text
and their keys:

| `provider` | First request | Second request, after a failure |
| :-- | :-- | :-- |
| `typesafe`, the default | TypeSafe, with the TypeSafe key | none |
| `openrouter` | OpenRouter, with the OpenRouter key | none |
| `auto` | TypeSafe, with the TypeSafe key | OpenRouter, with the OpenRouter key |
| `openrouter-first` | OpenRouter, with the OpenRouter key | TypeSafe, with the TypeSafe key |

An unknown value acts as `typesafe`. With `auto` or `openrouter-first` and one
key set, the plugin uses that key's provider alone. With both keys set, one
call may reach both companies. The second provider gets the call only when the
first fails with a connection error, a timeout, or HTTP status 401, 402, 403,
404, 408, 429 or 5xx. It never gets the call after 400, 422, a cancel, the
routing limit or a bad reply.

Each key goes only to its own provider's address above. The plugin passes the
address and the key with every request, so no environment variable moves a key
to another host. An environment variable can supply a key, and with it the
account that receives the task text, as [What the plugin stores](#what-the-plugin-stores)
says.

## What the plugin sends

On every Agent tool call it routes, the plugin sends an HTTPS POST to the
provider the table above names. The plugin bundles the official TypeSafe SDK,
`@typesafe-ai/sdk`, which builds the request for both providers. The JSON body
holds:

- the subagent's task text, condensed and with token-shaped strings masked.
  A text over 12,000 characters keeps its start and its end
- the agent's description, as Claude Code offers it, condensed and with
  token-shaped strings masked, capped at 500 characters. A missing or blank
  description sends `An agent with no description.` Under the default scope
  these are the built-in agents' descriptions, unless you replace a built-in
  agent with your own. Under `extended`, they are the descriptions of the
  agents routed then
- the caller's one-line description of the task
- the Jev alias `jev-latest`, and two fixed scoring questions, `tier` and
  `work`, with their three descriptions each, text that ships with the plugin.

The request headers hold:

- `authorization`, with the key of the provider that receives the request
- `accept` and `content-type`, both `application/json`
- `user-agent` and `x-typesafe-sdk`, both naming the SDK and its version,
  `typesafe-sdk/0.7.0`
- `x-typesafe-runtime`, which reads `unknown` under Claude Code
- `x-typesafe-retry-count`, `1` or `2`, on a retry only.

OpenRouter receives the same headers, the `x-typesafe-*` ones included. Claude
Code adds the transport headers, such as `host` and `content-length`.

The task text holds whatever the caller put in it, which can include code. The
request is sent before Claude Code decides whether the call may run. Before
routing, the plugin asks Claude Code's permission rules about the call's
original arguments. If they deny the call, the plugin does not send the
request. A rule on the model the plugin picks, a PreToolUse hook and the
auto-mode classifier decide after the request left. A call that prompts you
for permission is sent before you answer. That list is the whole request. Each
key identifies your account to its provider. The plugin sends no telemetry and
no identifier of you or your machine. With Claude Code's `--debug` flag, the
plugin writes each request body to your debug log, in numbered pieces when it
is long. No key is ever written.

## The extended scope

Under `extended`, the plugin routes every Agent call that passes no model and
no name, except a fork. That includes your user, project and plugin agents.

- The description and the task text of each such agent leave your machine, as
  What the plugin sends describes.
- A hand-written description can hold private names, such as a client, a
  product or a team. The plugin masks token-shaped strings only. Read your
  agents' descriptions before you set `extended`.
- The plugin replaces the model and effort that an agent's definition sets,
  because Claude Code does not expose them.

## Requests and billing

With one provider, a routed call sends one request and up to two retries,
three attempts in all. The SDK retries a connection error and an HTTP status
408, 429 or 5xx. It waits for a `Retry-After` header when one comes, within the
limit. It retries no other status. The retries send the same body as the first
request.

With two providers, the first provider gets one request and no retry. The
plugin gives up on it after 2 s. The second provider then gets up to three
attempts as above. One call therefore sends at most four requests.

One fixed 8 s limit covers the whole call, both providers and all retries
included. The plugin stops waiting at the limit, but it cannot recall a
request in flight. A request can reach its provider even when its answer never
returns. A retry after a network failure may be billed more than once. A first
request the plugin gave up on may still be billed, on top of the second
provider's answer.

## What the providers do with it

Each provider processes the request to answer the scoring questions.
TypeSafe's handling of request data is set by its privacy policy at
https://typesafe.ai/legal/privacy-policy. OpenRouter's privacy policy is at
https://openrouter.ai/privacy. OpenRouter does not document retention or
training for the System One endpoint. OpenRouter names the answering model
`typesafe/jev-…`, and the plugin cannot see where OpenRouter passes the
request on. The plugin author has no access to those requests.

## What the plugin stores

The plugin stores nothing on disk itself. With `--debug`, Claude Code writes
each request body to its debug log file. In memory the plugin holds the
configured keys while the hook is registered. It also holds the latest source
and description of each agent name Claude Code offers, such as `built-in`.
Claude Code keeps your API keys in your system's secure storage as sensitive
plugin options. The plugin reads a key only for a provider the `provider`
option allows, and only to send it as the bearer token of a request to that
provider. When the TypeSafe key option is empty, the plugin reads that key
from the environment variable `TYPESAFE_API_KEY`. When the OpenRouter key
option is empty, it reads `OPENROUTER_API_KEY`. A key in either variable stays
wherever you set it, for example in plaintext in a settings file. It is
visible to every process Claude Code starts.

The plugin reads no other environment variable. The `config` tool reports only
whether a key is set, never the key, its length or any part of it.

A project can set either variable in the `env` block of its Claude Code
project settings. When the matching key option is empty, the plugin then sends
the task text to the account that project key belongs to.

The provider and scope choices live in your Claude Code settings, as the plugin
options `provider` and `scope`. The plugin writes them in two cases only. You
pick a value in the dialog that the `config` tool opens. Or you type
`/model-router:provider` or `/model-router:scope` with a value at your own
prompt. A command from any other origin writes nothing. The plugin writes no
other option and no file. Claude Code ignores plugin options in project and
local settings, so a project cannot change either option.
The lines the plugin prints per call go to your own transcript and, with
`--debug`, to your debug log.

## Your choices

Set `provider` to `typesafe` or `openrouter` to keep each call with one
company. Keep `scope` at `core` to route the four built-in agents only.
Remove the keys from the plugin's configuration and from both
variables, and the plugin skips routing. Disable the plugin and nothing is
sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
