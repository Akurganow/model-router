# Privacy policy

model-router for Oh My Pi is a plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-11-26.

## Where requests go

The plugin asks a decision model to score each routed batch item. Only `task`
items route under the default `core` scope, and [the extended
scope](#the-extended-scope) adds the others. The model answers on one or two
paths:

- the direct path: the provider's own API, with the provider's key
- the gateway path: OpenRouter, with your OpenRouter key.

The `provider` setting says whose model scores: `typesafe`, `openai`, `google` or
`perplexity`. OpenRouter is a gateway that passes the request to that
provider's model. These companies can receive the task text:

| Company | Host | It receives the text when | Key it takes |
| :-- | :-- | :-- | :-- |
| TypeSafe | `api.typesafe.ai` | `provider` is `typesafe` and `gateway` allows the direct path | the credential omp holds for `typesafe`, as a bearer token |
| OpenAI | `api.openai.com` | `provider` is `openai` and `gateway` allows the direct path | the credential omp holds for `openai`, as a bearer token |
| Google | `generativelanguage.googleapis.com` | `provider` is `google` and `gateway` allows the direct path | the credential omp holds for `google`, in the `x-goog-api-key` header |
| Perplexity | `api.perplexity.ai` | `provider` is `perplexity` and `gateway` allows the direct path | the credential omp holds for `perplexity`, as a bearer token |
| OpenRouter | `openrouter.ai` | `gateway` allows its path, as the gateway to each provider | the credential omp holds for `openrouter`, as a bearer token |

The `gateway` setting decides which paths are open:

| `gateway` | First request | Second request, after a failure |
| :-- | :-- | :-- |
| `direct`, the default | the provider, with its key | none |
| `auto` | the provider, with its key | OpenRouter, with the OpenRouter key |
| `openrouter-first` | OpenRouter, with the OpenRouter key | the provider, with its key |
| `openrouter` | OpenRouter, with the OpenRouter key | none |

A path with no key is left out. With both keys under `auto` or `openrouter-first`, one item may reach both the provider and OpenRouter.

A setting that is not valid sends nothing, as
[A setting that is not valid](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid)
explains.

A model role does not decide whether a request leaves: with a key set and no
role set, each routed item is still sent for scoring, as
[A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) says.

[The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway)
gives the fallback rules.

A project can set the plugin settings `gateway` and `scope`. For `gateway`, its
value may only narrow `auto` or `openrouter-first` to `direct` or `openrouter`.
It cannot add a path, swap one or change the order. A project never changes the
provider, as [What a project can change](README.md#what-a-project-can-change)
says. Earlier versions let a project's `provider: typesafe` keep OpenRouter out.
It narrows nothing now. Set `gateway: direct` in that project to keep
OpenRouter out when your global `gateway` is `auto` or `openrouter-first`. For
`scope`, its value overrides yours in both directions. A project can also
supply a key through its `.env` file, as
[What the plugin stores](#what-the-plugin-stores) says.

Each key goes only to the host above of the company that issued it, as
[Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys)
explains.

omp's credential store or an environment variable can supply a key, as [What the
plugin stores](#what-the-plugin-stores) says.

## What the plugin sends

Each routed batch item sends an HTTPS POST to the company the table above
names for each request. The JSON body holds:

- the item's task text, prepared as
  [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
  says
- the item's `solutionSpace`, when it is text that is not blank, placed after
  the task text under the label `Solution space:` and prepared with it
- a capped part of the batch `context`, at most 3000 characters, prepared the
  same way and placed after the task text. Task text, solution space and
  context together stay within 12,000 characters
- the agent text, the request's `role` field:
  - for the bundled `task` agent, one fixed text that ships with the plugin
  - for every other routed agent, its description as omp discovers it, a
    `task` agent you define included. The plugin masks the token-shaped
    strings that
    [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
    lists, collapses whitespace and cuts it to 500 characters
  - a missing or blank description sends `An agent with no description.`
  - under the default scope only the bundled `task` agent is routed
  - [model-choice.md](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/docs/model-choice.md#the-role-of-the-default-agent)
    says why the text is fixed
- the item's `name` as the description, masked, collapsed and cut like the
  agent's description, or an empty description when it has none
- the model of the endpoint and two scoring questions, `tier` and `work`, as
  [The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
  lists them

[The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
lists the headers the plugin sets. The task text, the solution space and the
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
  your agents to the provider you chose or to OpenRouter, as your `gateway` setting allows,
  without your choice, and it can raise spend,
  because routed agents may run on the `smol`, `midl` and `slow` model roles
  you set.

## Requests and billing

The plugin scores each routed item on its own. An item a closed gate stops is
not routed and sends nothing. An item that starts after the batch's scoring
limit has passed sends nothing either, so a batch can send fewer requests than it
has routed items.

One item sends at most four requests.
[Retries and the second attempt](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-attempt)
gives the attempts on each path. Once an item falls back, items that start
later in the same batch skip the failed path.

[The routing limit and billing](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-limit-and-billing)
says what a request in flight can cost. One limit covers the scoring of a
whole batch, both attempts and all retries included: 10 s, or less under a
short omp tool call timeout, as the
[README](README.md#limits) says. The plugin sends no
other request.

## What each company does with the text

The companies' own pages are linked at
[What each company does with the text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-each-company-does-with-the-text).

## What the plugin stores

The plugin keeps no file of its own. In memory it holds up to 64 routing
decisions, each a level, an effort and its log line. A decision leaves when its
subagent spawns, when its task call ends before omp reports the subagent's id,
or when newer decisions push it out.

It holds a key in memory only while it checks whether to route and while it
sends a request. It reads a key only for a company that the `provider` and
`gateway` settings allow. It reads the credential omp holds for that company's
id, `typesafe`, `openai`, `google`, `perplexity` or `openrouter`. When that is
empty or, from omp 18.13.2, a stored login, it reads the environment variable
`TYPESAFE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY` or
`OPENROUTER_API_KEY`. It sends each key only to its own company's host above.
It does not read `GOOGLE_API_KEY`. It reads no other environment variable, and
it runs no program.

When you choose a value in the plugin's dialog or give a command, the plugin
writes your global `provider`, `gateway` or `scope` plugin setting through omp.
When the agent passes a `models` text to the config tool at your request, the
plugin writes your global `models` setting. It writes no project setting.

A key you set as an environment variable is visible to every process omp
starts.

A project can set any of these variables in its `.env` file. When omp's
credential for that company is empty, the plugin then sends the task text to
the account that project key belongs to. With the narrowing above, a project
can also pick which of your allowed paths receives it.

When a batch arrives, and again as each routed subagent starts, the plugin
reads its `provider`, `gateway` and `scope` settings through omp's plugin settings, which
include the project's value. It also reads omp's plugins lockfile for your
global values of them, and reads a missing lockfile as empty. The lockfile is the only
file the plugin reads itself. When either read fails, the plugin skips routing
and sends nothing. At the same
points it reads omp's settings `modelRoles`, `task.agentModelOverrides`,
`task.disabledAgents`, `task.maxEffort` and `task.enableEffort`, and the
source, declared models and description of each agent omp discovers, to see
whether your own agent replaced a bundled one or sets its own model.
`modelRoles`, `task.maxEffort` and `task.enableEffort` also decide whether it
keeps your effort or caps its own. As each routed subagent starts, it reads the
model patterns and the model role omp sends with the spawn, and the item's
`effort`. It also checks whether the `smol`, `midl` and `slow` roles
resolve to a model. For each batch it also reads omp's
`extensionHandlers.toolCallTimeoutMs` setting, to fit its scoring time into
it. Nothing from these leaves your machine, except the
agent text of each routed agent, which the request carries as described above.

The lines the plugin prints per batch go to your omp notifications, or to
standard error when omp has no UI. The setup skill changes only what you
choose: the global `provider`, `gateway` and `scope` settings through the
plugin's dialogs, and the global `models` setting through the config tool.

## Your choices

Every plugin offers the choices in
[Your choices](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#your-choices).
Here, set `provider`, `gateway` or `scope` in `/settings`, under Plugins. To route the `task` agent
only, the effective `scope` must stay `core`. A project's `scope` overrides
yours, as [The extended scope](#the-extended-scope) says. Remove the keys from
omp's credential store and from these variables. Disable the plugin and nothing
is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
