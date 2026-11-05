# Privacy policy

model-router for OpenClaw is a plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-11-05.

## Where requests go

The plugin asks Jev to score each `sessions_spawn` call it routes. Under the
default `core` scope, only
[the spawn of the requesting agent itself](README.md#the-spawn-of-the-requesting-agent-itself)
routes. [The extended scope](#the-extended-scope) adds the other configured
agents. Jev answers on one or two providers:

- TypeSafe, at https://api.typesafe.ai/v1/systemone, with your TypeSafe key
- OpenRouter, at https://openrouter.ai/api/v1/systemone, with your OpenRouter
  key.

The plugin's `provider` setting decides which providers receive the task text
and their keys:

| `provider` | First request | Second request, after a failure |
| :-- | :-- | :-- |
| `typesafe`, the default | TypeSafe, with the TypeSafe key | none |
| `openrouter` | OpenRouter, with the OpenRouter key | none |
| `auto` | TypeSafe, with the TypeSafe key | OpenRouter, with the OpenRouter key |
| `openrouter-first` | OpenRouter, with the OpenRouter key | TypeSafe, with the TypeSafe key |

An unknown value acts as `typesafe`. With `auto` or `openrouter-first` and one
key set, the plugin uses that key's provider alone. With both keys set, one
spawn may reach both companies. The second provider gets the spawn only when
the first fails with a connection error, a timeout, or HTTP status 401, 402,
403, 404, 408, 429 or 5xx. It never gets the spawn after 400, 422, a cancel, the
routing limit or a bad reply.

Each key goes only to its own provider's address above. The plugin passes the
address and the key with every request, so no environment variable moves a key
to another host. An environment variable can supply a key, and with it the
account that receives the task text, as
[What the plugin stores](#what-the-plugin-stores) says.

## What the plugin sends

For every spawn it routes, the plugin sends an HTTPS POST to the provider the
table above names. The plugin bundles the official TypeSafe SDK,
`@typesafe-ai/sdk`, which builds the request for both providers. The JSON body
holds:

- the spawn's `task` text, condensed and with token-shaped strings masked.
  A text over 12,000 characters keeps its start and its end
- the agent's role:
  - [the spawn of the requesting agent itself](README.md#the-spawn-of-the-requesting-agent-itself)
    sends that agent's `description` from OpenClaw's configuration when one is
    set. The plugin masks token-shaped strings, collapses whitespace and cuts
    it to 500 characters
  - the same spawn sends one fixed text that ships with the plugin when the
    requester has no description
  - under `extended`, a spawn of another configured agent sends that agent's
    own description, prepared the same way. A missing or blank description
    sends `An agent with no description.`
  - [The role of the default agent](../model-router/docs/model-choice.md#the-role-of-the-default-agent)
    says why the other plugins always send the fixed text
- the spawn's `label` as the description, else its `taskName`, or an empty
  description when it has neither. The plugin reads `label` and `taskName` as
  [How the plugin reads a spawn](README.md#how-the-plugin-reads-a-spawn) says.
  It sends the value as is, as the other plugins send the description of a
  call. It masks and cuts nothing in it, so a key or a private name in a label
  leaves your machine
- the Jev alias `jev-latest`, and two fixed scoring questions, `tier` and
  `work`, with their three descriptions each, text that ships with the plugin.

The request headers hold:

- `authorization`, with the key of the provider that receives the request
- `accept` and `content-type`, both `application/json`
- `user-agent` and `x-typesafe-sdk`, both naming the SDK and its version,
  `typesafe-sdk/0.7.0`
- `x-typesafe-runtime`, which names the Gateway's runtime, the operating system
  and the architecture, in the form `<runtime>/<version> (<os>; <arch>)`
- `x-typesafe-retry-count`, `1` or `2`, on a retry only.

OpenRouter receives the same headers, the `x-typesafe-*` ones included. The
runtime header tells the provider which runtime, system and architecture the
Gateway runs on. The task text holds whatever the caller put in it, which can
include code. The request is sent when OpenClaw runs the `before_tool_call`
hook, before the spawn starts. A spawn that a later hook or a policy blocks was
already sent. That list is the whole request. Each key identifies your account
to its provider. The plugin sends no telemetry and no other data about you or
your machine.

## The extended scope

Under `extended`, the plugin routes the spawn of every other configured agent
that does not set its own model, as well as
[the spawn of the requesting agent itself](README.md#the-spawn-of-the-requesting-agent-itself).

- The description and the task text of each such agent leave your machine, as
  What the plugin sends describes.
- A hand-written description can hold private names, such as a client, a
  product or a team. The plugin masks token-shaped strings only. Read your
  agents' descriptions before you set `extended`.
- The plugin can replace an effort you set.
  [Efforts the plugin keeps](README.md#efforts-the-plugin-keeps) lists when.

## Requests and billing

With one provider, a routed spawn sends one request and up to two retries,
three attempts in all. The SDK retries a connection error and an HTTP status
408, 429 or 5xx. It waits for a `Retry-After` header when one comes, within the
limit. It retries no other status. The retries send the same body as the first
request.

With two providers, the first provider gets one request and no retry. The
plugin gives up on it after 2 s. The second provider then gets up to three
attempts as above. One spawn therefore sends at most four requests.

One routing limit covers the whole spawn, both providers and all retries
included. [Routing behaviour](README.md#routing-behaviour) gives the limit. The
plugin stops waiting at the limit, but it cannot recall a request in flight. A
request can reach its provider even when its answer never returns. A retry
after a network failure may be billed more than once. A first request the
plugin gave up on may still be billed, on top of the second provider's answer.
Many parallel spawns make as many requests, so a provider's rate limit can
leave later spawns unrouted. The plugin sends no other request.

## What the providers do with it

Each provider processes the request to answer the scoring questions.
TypeSafe's handling of request data is set by its privacy policy at
https://typesafe.ai/legal/privacy-policy. OpenRouter's privacy policy is at
https://openrouter.ai/privacy. OpenRouter does not document retention or
training for the System One endpoint. OpenRouter names the answering model
`typesafe/jev-…`, and the plugin cannot see where OpenRouter passes the
request on. The plugin author has no access to those requests.

## What the plugin stores

The plugin keeps no file of its own and no state between spawns.

It reads a key only for a provider the `provider` setting allows.
[Keys](README.md#keys) says where it looks, and in which order. It holds a key
in memory only while it checks whether to route and while it sends a request,
and it sends each key only to its own provider's endpoint above, as the bearer
token. It never uses OpenClaw's own provider credentials as a Jev key. It reads
no other environment variable, and it runs no program.

A key in an environment variable stays wherever you set it. It is visible to
every process the Gateway starts. A `.env` file in the Gateway's working
directory can supply either variable. The plugin then sends the task text to the
account that key belongs to. OpenClaw 2026.10.10 drops `OPENROUTER_API_KEY`
from such a file but loads `TYPESAFE_API_KEY`, as
[the `.env` fact](../../docs/clients.md#openclaw-runtime-logs-and-environment)
records. The plugin does not depend on that filter. Keep the keys in the
plugin's settings, or in the Gateway's own environment.

The `model_router_config` tool only reads. It reports whether a key is set and
never returns the key, its length or any part of it.

The commands `/model-router-provider` and `/model-router-scope` write the
plugin's `provider` or `scope` setting into OpenClaw's configuration. They
refuse unless the sender is the owner. The plugin writes no other setting and no
file. You assign `small_model` and `large_model` yourself, in OpenClaw's
configuration.

At each spawn the plugin reads OpenClaw's live configuration: its own settings,
`agents.defaults.subagents.model` and `.thinking`, and for the requesting agent
and, under `extended`, the target agent, `description`, `model`,
`subagents.model` and `subagents.thinking`. It finds an agent as
[The agent roster](README.md#the-agent-roster) says. For a model it is about to
set, it asks OpenClaw to resolve the model string and to report whether a
credential exists for that model's provider. These calls make no network
request and refresh no credential. Nothing from these reads leaves your
machine, except the role text the request carries as described above.

The plugin writes one line per routed or skipped spawn, `model-router` followed
by the decision, to the Gateway log and nowhere else. The line holds the level,
the model string you assigned or `no change`, the effort, the probabilities, and
a skip reason such as `key unset` or an HTTP status. It holds the Jev model
name and token counts when the reply carries them. It holds no task text, no
description and no key. OpenClaw shows no line in the chat.

## Fails open

The plugin fails open. That means the plugin itself never blocks a spawn, never
asks for approval and never throws into OpenClaw. A missing key, a closed gate,
an error, a timeout or a failed check returns nothing, and the spawn runs as
OpenClaw would run it without the plugin.

The plugin cannot promise more than that:

- The plugin checks a model before it sets one. OpenClaw can still reject the
  rewritten spawn, and the child can still fail on the model.
- A model set on a spawn loses OpenClaw's configured fallbacks.

## Your choices

Set `provider` to `typesafe` or `openrouter` to keep each spawn with one
company. Keep `scope` at `core` to route only
[the spawn of the requesting agent itself](README.md#the-spawn-of-the-requesting-agent-itself).
Remove the keys from the plugin's settings and from both variables, and the
plugin skips routing. Disable the plugin, as
[Turn it off](README.md#turn-it-off) says, and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
