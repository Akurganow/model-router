# Privacy policy

model-router for Oh My Pi is a plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-11-06.

## Where requests go

The plugin asks Jev to score each routed batch item. Only `task` items route
under the default `core` scope, and [the extended scope](#the-extended-scope)
adds the others. Jev answers on one or two providers:

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

With both keys under `auto` or `openrouter-first`, one item may reach both companies.

[Which provider gets a task](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#which-provider-gets-a-task)
gives the fallback rules.

A project can set two plugin settings. For `provider`, its value may only
narrow `auto` or `openrouter-first` to one of the two providers. It cannot add
a provider, swap one or change the order. For `scope`, its value overrides yours
in both directions. A project can also supply a key through its `.env` file, as
[What the plugin stores](#what-the-plugin-stores) says.

Each key goes only to its own provider's address above, as
[Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys)
explains.

omp's credential store or an environment variable can supply a key, as [What the
plugin stores](#what-the-plugin-stores) says.

## What the plugin sends

Each routed batch item sends an HTTPS POST to the provider the table above
names. The JSON body holds:

- the item's task text, prepared as
  [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
  says
- a capped part of the batch `context`, at most 3000 characters, prepared the
  same way and placed after the task text. Task text and context together stay
  within 12,000 characters
- the agent text, the request's `role` field:
  - for the bundled `task` agent, one fixed text that ships with the plugin
  - for every other routed agent, its description as omp discovers it, a
    `task` agent you define included. The plugin masks token-shaped strings,
    collapses whitespace and cuts it to 500 characters
  - a missing or blank description sends `An agent with no description.`
  - under the default scope only the bundled `task` agent is routed
  - [model-choice.md](../model-router/docs/model-choice.md#the-role-of-the-default-agent)
    says why the text is fixed
- the item's `name` as the description, or an empty description when it has
  none
- the Jev alias and one scoring question, `tier`, as
  [The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
  lists them

The `x-typesafe-runtime` header reads `bun/<version> (<os>; <arch>)`. It tells
the provider the runtime, system and architecture omp runs on.
[The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
lists the other headers, which the bundled SDK builds. The task text and the
context hold whatever the caller put in them, which can include code. The
request is sent before omp asks for approval of the `task` call. A call you
later refuse was already sent. That list is the whole request, and
[the plugin sends no telemetry](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#no-telemetry).

## The extended scope

Under `extended`, the plugin routes every agent whose model you did not set.
That includes the bundled agents `task`, `scout`, `sonic`, `reviewer`
and `security-reviewer`, and your own user, project and plugin agents
that declare no model.

- Each such agent sends its agent text and task text, as
  What the plugin sends describes.
- [Descriptions can hold private names](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#descriptions-and-private-names).
  Read them before you set `extended`.
- A project can set `scope` in its plugin settings, and its value overrides
  yours. A project that sets `extended` sends the descriptions and task text of
  your agents to your provider without your choice, and it can raise spend,
  because routed agents may run on the `slow` model role.

## Requests and billing

The plugin scores each routed item on its own. An item a closed gate stops is
not routed and sends nothing. An item that starts after the batch's scoring
limit has passed sends nothing either, so a batch can send fewer requests than it
has routed items.

One item sends at most four requests.
[Retries and the second provider](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-provider)
gives the attempts at each provider. Once an item falls back, items that start
later in the same batch skip the failed provider.

[The routing limit and billing](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-limit-and-billing)
says what a request in flight can cost. One limit covers the scoring of a
whole batch, both providers and all retries included: 8 s, or less under a
short omp tool call timeout, as the
[README](README.md#limits-and-retries) says. The plugin sends no
other request.

## What the providers do with it

The providers' privacy policies are linked at
[What the providers do with it](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-the-providers-do-with-it).

## What the plugin stores

The plugin keeps no file of its own. In memory it holds up to 64 routing
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

When you choose a value in the plugin's dialog or give a command, the plugin
writes your global `provider` or `scope` plugin setting through omp. It
writes no project setting.

When you call the `model_router_config` tool for a key, the plugin asks for
the key in its own text dialog and stores it in omp's credential store, as
`/login` does. The dialog shows the typed key in clear. The plugin passes the
key to the credential store and nowhere else. It never logs or returns a key,
and a failed save reports only `<provider> key not saved`. Other extensions'
hooks in omp may see a dialog answer, the key included.

A key you set as an environment variable is visible to every process omp
starts.

A project can set either variable in its `.env` file. When omp's credential
for that provider is empty, the plugin then sends the task text to the account
that project key belongs to. With the narrowing above, a project can also pick
which of your allowed providers receives it.

When a batch arrives, and again as each routed subagent starts, the plugin
reads its `provider` and `scope` settings through omp's plugin settings, which
include the project's value. It also reads omp's plugins lockfile for your
global values of them, and reads a missing lockfile as empty. The lockfile is the only
file the plugin reads itself. When either read fails, the plugin skips routing
and sends nothing. At the same
points it reads omp's settings `modelRoles`, `task.agentModelOverrides` and
`task.disabledAgents`, and the source, declared models and description of each
agent omp discovers, to see whether your own agent replaced a bundled one or
sets its own model. It also checks whether the `@smol` and `@slow` roles
resolve to a model. For each batch it also reads omp's
`extensionHandlers.toolCallTimeoutMs` setting, to fit its scoring time into
it. Nothing from these leaves your machine, except the
agent text of each routed agent, which the request carries as described above.

The lines the plugin prints per batch go to your omp notifications, or to
standard error when omp has no UI. The setup skill changes only what you
choose in the plugin's dialogs: the global `provider` and `scope` settings and
a key.

## Your choices

Every plugin offers the choices in
[Your choices](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#your-choices).
Here, set `provider` in `/settings`, under Plugins. To route the `task` agent
only, the effective `scope` must stay `core`. A project's `scope` overrides
yours, as [The extended scope](#the-extended-scope) says. Remove the keys from
omp's credential store and from both variables. Disable the plugin and nothing
is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
