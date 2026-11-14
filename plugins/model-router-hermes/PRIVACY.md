# Privacy policy

model-router for Hermes Agent is a plugin published by Akurganow. This policy
says what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-11-14.

## Where requests go

The plugin asks Jev to score each `delegate_task` task it routes. It never
scores the main turn. Jev answers on one or two providers:

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

With both keys under `auto` or `openrouter-first`, one task may reach both companies.

A model setting does not decide whether a request leaves: with a key set and
no model set, each routed task is still sent for scoring, as
[A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) says.

[Which provider gets a task](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#which-provider-gets-a-task)
gives the fallback rules.

Each key goes only to its own provider's address above, as
[Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys)
explains.

Hermes's env file or environment can supply a key, as [What the plugin
stores](#what-the-plugin-stores) says.

## What the plugin sends

Each routed task sends an HTTPS POST to the provider the table above names. The
JSON body holds:

- the task's `goal` text, prepared as
  [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
  says
- the task's `context` text, when the task has one. It follows the goal, at
  most 3,000 characters, prepared the same way. Goal and context together stay
  within 12,000 characters, and the context is left out when less than 500
  characters of room remain
- the agent text, the request's `role` field: one fixed text that ships with
  the plugin. Hermes passes this backend the goal, the context, the task's
  index and the parameters the plugin declares, so the plugin has no agent
  description to send.
  [model-choice.md](../model-router/docs/model-choice.md#the-role-of-the-default-agent)
  says why the text is fixed
- the task's `description` parameter, when the delegating model sets one, or
  an empty description. The plugin masks its token-shaped strings as it masks
  the task text, turns each run of whitespace into one space, and cuts it to
  500 characters. A private name in a description still leaves your
  machine, as
  [Descriptions and private names](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#descriptions-and-private-names)
  says
- the Jev alias and the two scoring questions, as
  [The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
  lists them

The `x-typesafe-runtime` header reads `node/<version> (<os>; <arch>)`, and it
tells the provider which Node, system and architecture Hermes runs the plugin
on.
[The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
lists the other headers, which the bundled SDK builds. The goal and the context
hold whatever the model put in them, which can include code. Hermes routes all
tasks of a call, one after another, before any child starts, and the plugin
sends each request during that routing. A task that Hermes later refuses was
already sent. A task that sets the `level` parameter is not scored and sends
no request. That list is the whole request, and
[the plugin sends no telemetry](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#no-telemetry).

## The program the plugin starts

The plugin starts one Node program, `route.mjs`, for each task it routes. It
uses Hermes's own Node and never the Node on `PATH`. The program makes the
requests above.

- The plugin hands the program the task text, the context, the description
  and the keys on standard input. A key never appears in the program's environment or
  arguments.
- The program's environment holds only `PATH`, `HOME`, `TMPDIR`,
  `SYSTEMROOT`, the proxy variables `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`
  in both cases, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE` and
  `NODE_USE_ENV_PROXY`. With `HTTPS_PROXY` or `HTTP_PROXY` present, the plugin
  turns Node's proxy support on, as [Node](README.md#node) details.
- The program answers with one line of JSON on standard output. The plugin
  discards its standard error.
- The program ends after one task.

## Requests and billing

One task sends at most four requests, as
[Retries and the second provider](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-provider)
explains.

One routing limit covers all tasks of a `delegate_task` call, both providers and
all retries included.
[Sequential routing and the shared budget](README.md#sequential-routing-and-the-shared-budget)
gives the limit. A task that starts after the limit has passed sends nothing, so
a call can send fewer requests than it has tasks.
[The routing limit and billing](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-limit-and-billing)
says what a request in flight can cost. The plugin sends no other request.

## What the providers do with it

The providers' privacy policies are linked at
[What the providers do with it](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-the-providers-do-with-it).

## What the plugin stores

The plugin keeps no file of its own. In memory it holds the routing-budget
record, which has the start and end times of the current call, and the last 128
distinct log lines. Both leave when the gateway or the plugin host stops.

It reads a key only for a provider the `provider` setting allows. It reads the
key through Hermes's own secret reader, from the variable `TYPESAFE_API_KEY` or
`OPENROUTER_API_KEY`. [Keys](README.md#keys) says where Hermes holds them. The
plugin holds a key in memory only while it routes a task, and it passes the key
to the program above on standard input.

`TYPESAFE_API_KEY` in Hermes's env file is a variable in the environment of
the gateway and of the plugin host. Like any key in the environment, it is
visible to the programs Hermes starts. Keep a key out of the environment of
programs you do not trust.

At each task the plugin reads four of its own settings through Hermes:
`provider`, `small_model`, `middle_model` and `large_model`. It reads the task's
`description`, `reasoning_effort` and `level` parameters. Of those, only the
description leaves your machine, in the request. It also reads the `delegation`
section of Hermes's configuration, which Hermes passes with the task. It uses
`model`, `provider`, `base_url`, `api_key` and `reasoning_effort` to decide
whether to route. The plugin reads `api_key` only to see whether it is set.
The value never enters a request, a log line or the program above. The plugin
hands the whole `delegation` section back to Hermes as the base of the route,
as Hermes's own default backend does, with a model, a provider and an effort
changed when it routes. When the section sets no effort, every route carries
the task's `reasoning_effort` parameter.

The plugin reads no credential of a model's provider. It sets the model and
provider you named in a slot on the task. Of its reads, only the role text
leaves your machine, in the request, as described above.

The `model_router_config` tool only reads.
[The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool)
says what it reports.

The command `/model-router-provider` writes the plugin's `provider` setting
into Hermes's configuration. It writes only from a local session, which is a
Hermes CLI, TUI or Desktop session. The plugin writes no other setting, no
file, and never `delegation.backend`. You assign `small_model`,
`middle_model` and `large_model` yourself, in Hermes's configuration.

The plugin writes one line per routed or skipped task. It puts the line in the
task's `route.label`, which Hermes shows with the child's progress and result,
and in Hermes's `agent.log` at INFO level, once per distinct line.
[The label and the log](README.md#the-label-and-the-log) lists its fields. It
holds no task text, no context and no key.

## Fails open

The plugin fails open, as
[Fails open](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#fails-open)
defines it. It never refuses a task. When it fails open, it returns the route
Hermes's default backend would give the task.

The plugin cannot promise more than that:

- The child can still fail on the model.
- A model set on a task loses Hermes's configured fallbacks, unless
  `delegation.fallback_providers` declares them.
- Hermes fails delegation closed when `delegation.backend` names a backend that
  no enabled plugin provides. If you disable or remove the plugin and leave
  `delegation.backend` at `model-router`, every `delegate_task` call returns an
  error. [Turn off and uninstall](../../README.md#turn-off-and-uninstall) gives
  the order.

## Your choices

Every plugin offers the choices in
[Your choices](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#your-choices).
Here, remove the keys from Hermes's env file and from the environment. Set
`delegation.backend` back to `default`, and nothing is sent.
[Turn it off](README.md#turn-it-off) says how.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
