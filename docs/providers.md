# How the plugins use the providers

This page holds what the four plugins do the same way when they ask Jev to score a task.
Each plugin's privacy policy and README keep what is specific to the plugin, and link here for the rest.
The word task stands for one routed unit of work.
It is an Agent tool call in Claude Code, a batch item in Oh My Pi, a `sessions_spawn` call in OpenClaw and a `delegate_task` task in Hermes Agent.
The word harness stands for Claude Code, Oh My Pi, OpenClaw or Hermes Agent.

## Which provider gets a task

The `provider` setting picks the providers and their order.
An unknown value acts as `typesafe`.
With `auto` or `openrouter-first` and one key set, the plugin uses that key's provider alone.
With both keys set, one task may reach both companies.
The second provider gets the task only when the first fails.
The failures that count are a connection error, a timeout, and HTTP status 401, 402, 403, 404, 408, 429 or 5xx.
It never gets the task after 400, 422, a cancel, the routing limit or a bad reply.

## Keys

Get a key from [TypeSafe](https://console.typesafe.ai/keys) or from [OpenRouter](https://openrouter.ai).
A plugin reads a key only for a provider its `provider` setting allows.
Each key goes only to its own provider's address.
The plugin passes the address and the key with every request, so no environment variable moves a key to another host.
An environment variable can supply a key, and with it the account that receives the task text.
Each key identifies your account to its provider.
With no key for any allowed provider, every task reports `key unset`.

## The config tool

The `model_router_config` tool, named `config` in Claude Code, reports `<provider> key: set` or `<provider> key: unset` for each provider the `provider` value allows.
It never returns a key, its length or any part of it.

## The request

Each plugin bundles the official TypeSafe SDK, `@typesafe-ai/sdk`, which builds the request for both providers.
The request is an HTTPS POST.
Its JSON body names the Jev alias `jev-latest` and fixed scoring questions, with their three descriptions each.
These texts ship with the plugin.
Claude Code, OpenClaw and Hermes Agent ask two questions: `tier`, how much judgment the task needs, and `work`, how much work it takes.
Oh My Pi asks `tier` only.

The request headers hold:

- `authorization`, with the key of the provider that receives the request
- `accept` and `content-type`, both `application/json`
- `user-agent` and `x-typesafe-sdk`, both naming the SDK and its version, `typesafe-sdk/0.7.0`
- `x-typesafe-runtime`, which names the runtime, the operating system and the architecture, in the form each privacy policy gives
- `x-typesafe-retry-count`, `1` or `2`, on a retry only.

OpenRouter receives the same headers, the `x-typesafe-*` ones included.
The body and the headers that a plugin's privacy policy lists are the whole request.
The plugin sends no telemetry and no other data about you or your machine.

## The task text

Before the task text leaves, the plugin condenses it and masks token-shaped strings.
In Claude Code, OpenClaw and Hermes Agent, a text over 12,000 characters keeps its start and its end.

## Retries and the second provider

With one provider, a routed task sends one request and up to two retries, three attempts in all.
The SDK retries a connection error and an HTTP status 408, 429 or 5xx.
It waits for a `Retry-After` header when one comes, within the limit.
It retries no other status.
The retries send the same body as the first request.

With two providers, the first provider gets one request and no retry.
The plugin gives up on it after 2 s.
The second provider then gets up to three attempts as above.
One task therefore sends at most four requests.

## The routing limit and billing

One fixed 8 s limit covers the scoring, both providers and all retries included.
Each plugin README says what the limit spans.
The plugin stops waiting at the limit, but it cannot recall a request in flight.
A request can reach its provider even when its answer never returns.
A retry after a network failure may be billed more than once.
A first request the plugin gave up on may still be billed, on top of the second provider's answer.

## What the providers do with it

Each provider processes the request to answer the scoring questions.
TypeSafe's handling of request data is set by its privacy policy at https://typesafe.ai/legal/privacy-policy.
OpenRouter's privacy policy is at https://openrouter.ai/privacy.
OpenRouter does not document retention or training for the System One endpoint.
OpenRouter names the answering model `typesafe/jev-…`, and the plugin cannot see where OpenRouter passes the request on.
The plugin author has no access to those requests.

## Descriptions and private names

A hand-written agent description can hold private names, such as a client, a product or a team.
The plugin masks token-shaped strings only.
Read your agents' descriptions before you set `extended`.

## The option commands

A bare command prints the current value.
A command with a valid value writes it and prints the new value.
An invalid value lists the allowed ones.
A refused or failed write prints `<setting> unchanged: <reason>`.

## Your choices

Set `provider` to `typesafe` or `openrouter` to keep each task with one company.
Remove the key of every provider the `provider` setting allows, and the plugin skips routing.

## Fails open

A plugin fails open.
It never throws into its harness.
A missing key, a closed gate, an error, a timeout or a failed check leaves the task to run as the harness would run it without the plugin.

## The routing line

A routed line of Claude Code, OpenClaw or Hermes Agent reads `L<level> <model or no change> · <effort or kept label> · p=<tier>/<work>`.
The two probabilities belong to the chosen levels of the two questions.
When the reply carries them, the line also names the Jev model and the token counts.
Oh My Pi prints one probability per entry, because it asks one question.

After a fallback, a routed line ends with the provider that answered and why the first one failed, for example ` · via openrouter (typesafe HTTP 503)`.
After two failed attempts, a skip reason names each provider with its own reason, in attempt order, for example `skipped, typesafe HTTP 503, openrouter timeout`.
