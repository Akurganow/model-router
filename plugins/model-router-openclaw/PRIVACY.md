# Privacy policy

model-router for OpenClaw is a plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-11-21.

## Where requests go

Each `sessions_spawn` call the plugin routes goes to a decision model for
scoring. Under the default `core` scope, only [the spawn of the requesting
agent itself](README.md#the-spawn-of-the-requesting-agent-itself) routes, and
[the extended scope](#the-extended-scope) adds the other configured agents. The
model answers on one or two paths:

- the direct path: the provider's own API, with the provider's key
- the gateway path: OpenRouter, with your OpenRouter key.

The `provider` setting says whose model scores: `typesafe`, `openai`,
`google` or `perplexity`. OpenRouter is a gateway that passes the request to that provider's
model. These companies can receive the task text:

| Company | Host | It receives the text when | Key it takes |
| :-- | :-- | :-- | :-- |
| TypeSafe | `api.typesafe.ai` | `provider` is `typesafe` and `gateway` allows the direct path | the TypeSafe key, as a bearer token |
| OpenAI | `api.openai.com` | `provider` is `openai` and `gateway` allows the direct path | the OpenAI key, as a bearer token |
| Google | `generativelanguage.googleapis.com` | `provider` is `google` and `gateway` allows the direct path | the Google key, in the `x-goog-api-key` header |
| Perplexity | `api.perplexity.ai` | `provider` is `perplexity` and `gateway` allows the direct path | the Perplexity key, as a bearer token |
| OpenRouter | `openrouter.ai` | `gateway` allows its path, as the gateway to each of the four | the OpenRouter key, as a bearer token |

The `gateway` setting decides which paths are open:

| `gateway` | First request | Second request, after a failure |
| :-- | :-- | :-- |
| `direct`, the default | the provider, with its key | none |
| `auto` | the provider, with its key | OpenRouter, with the OpenRouter key |
| `openrouter-first` | OpenRouter, with the OpenRouter key | the provider, with its key |
| `openrouter` | OpenRouter, with the OpenRouter key | none |

A path with no key is left out. With both keys under `auto` or `openrouter-first`, one spawn may reach both the provider and OpenRouter.

A model setting does not decide whether a request leaves: with a key set and
no model set, each routed spawn is still sent for scoring, as
[A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) says.

[The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway)
gives the fallback rules.

A setting that is not valid sends nothing, as
[A setting that is not valid](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid)
says.

Each key goes only to the host above of the company that issued it, as
[Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys)
explains.

The plugin's settings or the Gateway's environment can supply a key, as [What
the plugin stores](#what-the-plugin-stores) says.

## What the plugin sends

Each routed spawn sends an HTTPS POST to the company the table above names. The
JSON body holds:

- the spawn's `task` text, prepared as
  [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
  says
- the agent's role:
  - [the spawn of the requesting agent itself](README.md#the-spawn-of-the-requesting-agent-itself)
    sends that agent's `description` from OpenClaw's configuration when one is
    set. The plugin masks the token-shaped strings that
    [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
    lists, collapses whitespace and cuts it to 500 characters
  - the same spawn sends one fixed text that ships with the plugin when the
    requester has no description
  - under `extended`, a spawn of another configured agent sends that agent's
    own description, prepared the same way. A missing or blank description
    sends `An agent with no description.`
  - [The role of the default agent](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/docs/model-choice.md#the-role-of-the-default-agent)
    says why the other plugins always send the fixed text
- the spawn's `label` as the description, else its `taskName`, or an empty
  description when it has neither. The plugin reads `label` and `taskName` as
  [How the plugin reads a spawn](README.md#how-the-plugin-reads-a-spawn) says.
  The plugin masks, collapses and cuts the value like the agent's
  description, as the other plugins do with the description of a call. A
  private name in a label still leaves your machine, as
  [Descriptions and private names](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#descriptions-and-private-names)
  says
- the model of the endpoint and the two scoring questions, as
  [The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
  lists them

[The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
lists the headers the plugin sets. The task text holds
whatever the caller put in it, which can include code. The request is sent when
OpenClaw runs the `before_tool_call` hook, before the spawn starts. A spawn that
a later hook or a policy blocks was already sent. That list is the whole
request, and
[the plugin sends no telemetry](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#no-telemetry).

## The extended scope

Under `extended`, the plugin routes the spawn of every other configured agent
that does not set its own model, as well as
[the spawn of the requesting agent itself](README.md#the-spawn-of-the-requesting-agent-itself).

- Each such agent's description and task text leave your machine, as
  What the plugin sends describes.
- [Descriptions can hold private names](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#descriptions-and-private-names).
  Read them before you set `extended`.
- The plugin can replace an effort you set.
  [Efforts the plugin keeps](README.md#efforts-the-plugin-keeps) lists when.

## Requests and billing

One spawn sends at most four requests.
[Retries and the second attempt](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-attempt)
gives the attempts on each path. The plugin gives up on the first attempt
after the [first-attempt wait](README.md#hook-timeout).

One routing limit covers the whole spawn, both attempts and all retries
included. [Hook timeout](README.md#hook-timeout) gives the limit.
[The routing limit and billing](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-limit-and-billing)
says what a request in flight can cost. Many parallel spawns make as many
requests, so a company's rate limit can leave later spawns unrouted. The plugin
sends no other request.

## What each company does with the text

The companies' own pages are linked at
[What each company does with the text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-each-company-does-with-the-text).

## What the plugin stores

The plugin keeps no file of its own and no state between spawns.

It reads a key only for a company that the `provider` and `gateway` settings
allow. [Keys](README.md#keys) says where it looks, in which order, and who can read an
environment variable. The plugin holds a key in memory only while it checks
whether to route and while it sends a request. It reads no other environment
variable, and it runs no program.

A `.env` file in the Gateway's working directory is a lower-trust source.
OpenClaw drops `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` and
`PERPLEXITY_API_KEY` from it, while it can still supply `TYPESAFE_API_KEY`. The plugin then sends the task
text to the account that key belongs to. The global `~/.openclaw/.env` and the Gateway's
environment stay trusted sources, as
[the `.env` fact](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-runtime-logs-and-environment)
records. The plugin does not depend on that filter. Keep the keys in the
plugin's settings, or in the Gateway's own environment.

The `model_router_config` tool only reads.
[The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool)
says what it reports.

The commands `/model-router-provider`, `/model-router-gateway` and
`/model-router-scope` write the plugin's `provider`, `gateway` or `scope`
setting into OpenClaw's configuration. They
write only when the sender is the owner. The plugin writes no other setting and no
file. You assign `small_model`, `middle_model` and `large_model` yourself, in
OpenClaw's configuration.

At each spawn the plugin reads OpenClaw's live configuration: its own settings,
`agents.defaults.subagents.model` and `.thinking`, and for the requesting agent
and, under `extended`, the target agent, `description`, `model`,
`subagents.model` and `subagents.thinking`. It finds an agent as
[The agent roster](README.md#the-agent-roster) says. It sets the model you
named in the slot. Nothing from these reads leaves your machine, except the
role text the request carries as described above.

The plugin reads no credential of a model's provider except the five keys that
[Keys](README.md#keys) lists. It says there which of them OpenClaw's own
OpenRouter provider shares.

The plugin writes one line per routed or skipped spawn to the Gateway log and
nowhere else. [The log line](README.md#the-log-line) lists its fields. It holds
no task text, no description and no key.

## Fails open

The plugin fails open, as
[Fails open](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#fails-open)
defines it. It never blocks a spawn and never asks for approval. When it fails
open, it returns nothing to OpenClaw.

The plugin cannot promise more than that:

- OpenClaw can still reject the rewritten spawn, and the child can still fail
  on the model.
- A model set on a spawn loses OpenClaw's configured fallbacks.

## Your choices

Every plugin offers the choices in
[Your choices](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#your-choices).
Here, keep `scope` at `core` to route only
[the spawn of the requesting agent itself](README.md#the-spawn-of-the-requesting-agent-itself).
Remove the keys from the plugin's settings and from the five variables. Disable the
plugin, as [Turn it off](README.md#turn-it-off) says, and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
