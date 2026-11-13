# Privacy policy

model-router for OpenClaw is a plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-11-13.

## Where requests go

Each `sessions_spawn` call the plugin routes goes to Jev for scoring. Under the
default `core` scope, only [the spawn of the requesting agent
itself](README.md#the-spawn-of-the-requesting-agent-itself) routes, and [the
extended scope](#the-extended-scope) adds the other configured agents. Jev
answers on one or two providers:

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

With both keys under `auto` or `openrouter-first`, one spawn may reach both companies.

A model setting does not decide whether a request leaves: with a key set and
no model set, each routed spawn is still sent for scoring, as
[A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) says.

[Which provider gets a task](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#which-provider-gets-a-task)
gives the fallback rules.

Each key goes only to its own provider's address above, as
[Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys)
explains.

The plugin's settings or the Gateway's environment can supply a key, as [What
the plugin stores](#what-the-plugin-stores) says.

## What the plugin sends

Each routed spawn sends an HTTPS POST to the provider the table above names. The
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
  - [The role of the default agent](../model-router/docs/model-choice.md#the-role-of-the-default-agent)
    says why the other plugins always send the fixed text
- the spawn's `label` as the description, else its `taskName`, or an empty
  description when it has neither. The plugin reads `label` and `taskName` as
  [How the plugin reads a spawn](README.md#how-the-plugin-reads-a-spawn) says.
  The plugin masks, collapses and cuts the value like the agent's
  description, as the other plugins do with the description of a call. A
  private name in a label still leaves your machine, as
  [Descriptions and private names](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#descriptions-and-private-names)
  says
- the Jev alias and the two scoring questions, as
  [The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
  lists them

The `x-typesafe-runtime` header names the Gateway's runtime, the operating
system and the architecture. It tells the provider which runtime, system and
architecture the Gateway runs on.
[The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
lists the other headers, which the bundled SDK builds. The task text holds
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
[Retries and the second provider](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-provider)
gives the attempts at each provider. The plugin gives up on the first provider
after the [per-provider wait](README.md#hook-timeout).

One routing limit covers the whole spawn, both providers and all retries
included. [Hook timeout](README.md#hook-timeout) gives the limit.
[The routing limit and billing](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-limit-and-billing)
says what a request in flight can cost. Many parallel spawns make as many
requests, so a provider's rate limit can leave later spawns unrouted. The plugin
sends no other request.

## What the providers do with it

The providers' privacy policies are linked at
[What the providers do with it](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-the-providers-do-with-it).

## What the plugin stores

The plugin keeps no file of its own and no state between spawns.

It reads a key only for a provider the `provider` setting allows.
[Keys](README.md#keys) says where it looks, in which order, and who can read an
environment variable. The plugin holds a key in memory only while it checks
whether to route and while it sends a request. It reads no other environment
variable, and it runs no program.

A `.env` file in the Gateway's working directory can supply either variable.
The plugin then sends the task text to the account that key belongs to. OpenClaw 2026.10.10 drops `OPENROUTER_API_KEY`
from such a file but loads `TYPESAFE_API_KEY`, as
[the `.env` fact](../../docs/clients.md#openclaw-runtime-logs-and-environment)
records. The plugin does not depend on that filter. Keep the keys in the
plugin's settings, or in the Gateway's own environment.

The `model_router_config` tool only reads.
[The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool)
says what it reports.

The commands `/model-router-provider` and `/model-router-scope` write the
plugin's `provider` or `scope` setting into OpenClaw's configuration. They
refuse unless the sender is the owner. The plugin writes no other setting and no
file. You assign `small_model`, `middle_model` and `large_model` yourself, in
OpenClaw's configuration.

At each spawn the plugin reads OpenClaw's live configuration: its own settings,
`agents.defaults.subagents.model` and `.thinking`, and for the requesting agent
and, under `extended`, the target agent, `description`, `model`,
`subagents.model` and `subagents.thinking`. It finds an agent as
[The agent roster](README.md#the-agent-roster) says. For the model of the slot
the level picks, it asks OpenClaw to resolve the model string and to report whether a
credential exists for that model's provider. These calls make no network
request and refresh no credential. Nothing from these reads leaves your
machine, except the role text the request carries as described above.

The plugin writes one line per routed or skipped spawn to the Gateway log and
nowhere else. [The log line](README.md#the-log-line) lists its fields. It holds
no task text, no description and no key.

## Fails open

The plugin fails open, as
[Fails open](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#fails-open)
defines it. It never blocks a spawn and never asks for approval. When it fails
open, it returns nothing to OpenClaw.

The plugin cannot promise more than that:

- The plugin checks a model before it sets one. OpenClaw can still reject the
  rewritten spawn, and the child can still fail on the model.
- A model set on a spawn loses OpenClaw's configured fallbacks.

## Your choices

Every plugin offers the choices in
[Your choices](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#your-choices).
Here, keep `scope` at `core` to route only
[the spawn of the requesting agent itself](README.md#the-spawn-of-the-requesting-agent-itself).
Remove the keys from the plugin's settings and from both variables. Disable the
plugin, as [Turn it off](README.md#turn-it-off) says, and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
