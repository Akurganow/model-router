# Privacy policy

model-router for Oh My Pi is a plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-10-24.

## Where requests go

The plugin asks Jev to score each `task` batch item it routes. Jev answers on
one or two providers:

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
item may reach both companies. The second provider gets the item only when the
first fails with a connection error, a timeout, or HTTP status 401, 402, 403,
404, 408, 429 or 5xx. It never gets the item after 400, 422, a cancel, the
routing limit or a bad reply.

A project's own value may only narrow `auto` or `openrouter-first` to one of
its two providers. It cannot add a provider, swap one or change the order.

Each key goes only to its own provider's address above. The plugin passes the
address and the key with every request, so no environment variable moves a key
to another host. An environment variable can supply a key, and with it the
account that receives the task text, as [What the plugin stores](#what-the-plugin-stores)
says.

## What the plugin sends

For every `task` batch item it routes, the plugin sends an HTTPS POST to the
provider the table above names. The plugin bundles the official TypeSafe SDK,
`@typesafe-ai/sdk`, which builds the request for both providers. The JSON body
holds:

- the item's task text, condensed and with token-shaped strings masked
- a capped part of the batch `context`, at most 3000 characters, prepared the
  same way and placed after the task text. Task text and context together stay
  within 12,000 characters
- the role: the description of the `task` agent that omp discovers, condensed
  and with token-shaped strings masked, capped at 500 characters. A missing or
  blank description sends `An agent with no description.` Under the default
  scope this is the bundled agent's description, unless you replace it with
  your own
- the item's `name` as the description, or an empty description when it has
  none
- the Jev alias `jev-latest`, and one fixed scoring question, `tier`, with
  its three descriptions, text that ships with the plugin.

The request headers hold:

- `authorization`, with the key of the provider that receives the request
- `accept` and `content-type`, both `application/json`
- `user-agent` and `x-typesafe-sdk`, both naming the SDK and its version,
  `typesafe-sdk/0.7.0`
- `x-typesafe-runtime`, which names the runtime, the operating system and the
  architecture, in the form `bun/<version> (<os>; <arch>)`
- `x-typesafe-retry-count`, `1` or `2`, on a retry only.

OpenRouter receives the same headers, the `x-typesafe-*` ones included. The
runtime header tells the provider which runtime, system and architecture omp
runs on. The task text and the context hold whatever the caller put in them,
which can include code. The request is sent before omp asks for approval of
the `task` call. A call you later refuse was already sent. That list is the
whole request. Each key identifies your account to its provider. The plugin
sends no telemetry and no other data about you or your machine.

## Requests and billing

The plugin scores each routed item on its own. An item a closed gate stops is
not routed and sends nothing. An item that starts after the batch's 8 s limit
has passed sends nothing either, so a batch can send fewer requests than it
has routed items.

With one provider, the SDK retries a connection error and an HTTP status 408,
429 or 5xx, up to three attempts in all. It waits for a `Retry-After` header
when one comes, within the limit. The retries send the same body as the first
request.

With two providers, the first provider gets one request and no retry. The
plugin gives up on it after 2 s. The second provider then gets up to three
attempts as above. One item therefore sends at most four requests. Once an
item falls back, items that start later in the same batch skip the failed
provider.

One fixed 8 s limit covers the scoring of a whole batch, both providers and
all retries included. The plugin stops waiting at the limit, but it cannot
recall a request in flight. A request can reach its provider even when its
answer never returns. A retry after a network failure may be billed more than
once. A first request the plugin gave up on may still be billed, on top of the
second provider's answer. The plugin sends no other request.

## What the providers do with it

Each provider processes the request to answer the scoring question.
TypeSafe's handling of request data is set by its privacy policy at
https://typesafe.ai/legal/privacy-policy. OpenRouter's privacy policy is at
https://openrouter.ai/privacy. OpenRouter does not document retention or
training for the System One endpoint. OpenRouter names the answering model
`typesafe/jev-…`, and the plugin cannot see where OpenRouter passes the
request on. The plugin author has no access to those requests.

## What the plugin stores

The plugin stores nothing on disk. In memory it holds up to 64 routing
decisions, each a model role and its log line. A decision leaves when its
subagent spawns, when its task call ends before omp reports the subagent's id,
or when newer decisions push it out.

It holds a key in memory only while it checks whether to route and while it
sends a request. It reads a key only for a provider the `provider` setting
allows. It reads omp's own credential for that provider, `typesafe` or
`openrouter`, and when that is empty, the environment variable
`TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`. It sends each key only to its own
provider's endpoint above, as the bearer token. It reads no other environment
variable, and it runs no program.

A project can set either variable in its `.env` file. When omp's credential
for that provider is empty, the plugin then sends the task text to the account
that project key belongs to. With the narrowing above, a project can also pick
which of your allowed providers receives it.

When a batch arrives, and again as each routed subagent starts, the plugin
reads its `provider` setting through omp's plugin settings, which include the
project's value. It also reads omp's plugins lockfile for your global value of
that setting, and reads a missing lockfile as empty. The lockfile is the only
file the plugin reads itself. When either read fails, the plugin skips routing
and sends nothing. At the same
points it reads omp's settings `modelRoles`, `task.agentModelOverrides` and
`task.disabledAgents`, and the source of each agent omp discovers, to see
whether your own `task` agent replaced the bundled one. It also checks whether
the `@smol` and `@slow` roles resolve to a model. Nothing from these leaves
your machine, except the `task` agent's description, which the request carries
as described above.

The lines the plugin prints per batch go to your omp notifications, or to
standard error when omp has no UI. The setup skill writes only the
configuration you approve: the `smol` and `slow` model roles and the global
`provider` setting.

## Your choices

Set `provider` to `typesafe` or `openrouter` in `/settings`, under Plugins, to
keep each item with one company. Remove the keys from omp's credential store
and from both variables, and the plugin skips routing. Disable the plugin and
nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
