# Privacy policy

model-router is a Claude Code plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-11-06.

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

With both keys under `auto` or `openrouter-first`, one call may reach both companies.

[Which provider gets a task](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#which-provider-gets-a-task)
gives the fallback rules.

Each key goes only to its own provider's address above, as
[Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys)
explains.

The plugin options or an environment variable can supply a key, as [What the
plugin stores](#what-the-plugin-stores) says.

## What the plugin sends

An HTTPS POST goes to the provider the table above names on every Agent tool
call the plugin routes. The JSON body holds:

- the subagent's task text, prepared as
  [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
  says
- the agent's role:
  - the built-in `general-purpose` and `claude` agents send one fixed text that
    ships with the plugin
  - every other routed agent sends its description, as Claude Code offers it,
    condensed and with token-shaped strings masked, capped at 500 characters.
    Under the default scope these are the built-in `Explore` and `Plan`
  - a missing or blank description sends `An agent with no description.`
  - under `extended`, a `general-purpose` or `claude` agent you define sends its
    description once Claude Code has offered it. Before that offer it sends the
    fixed text
  - [The role of the default agent](docs/model-choice.md#the-role-of-the-default-agent)
    says why the text is fixed
- the caller's one-line description of the task
- the Jev alias and the two scoring questions, as
  [The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
  lists them

The `x-typesafe-runtime` header reads `unknown` under Claude Code.
[The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
lists the other headers, which the bundled SDK builds. Claude Code adds the
transport headers, such as `host` and `content-length`.

The task text holds whatever the caller put in it, which can include code. The
request is sent when the subagent spawns, after Claude Code decides that the
Agent call may run. A call that your rules or the auto-mode classifier deny
never spawns, so the plugin sends no request. A rule on the model the plugin
picks applies after the request left. That list is the whole request, and
[the plugin sends no telemetry](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#no-telemetry).
With Claude Code's `--debug` flag, the plugin writes each request body to your
debug log, in numbered pieces when it is long. No key is ever written.

## The extended scope

Under `extended`, the plugin routes every Agent call that passes no model and
no name, except a fork. That includes your user, project and plugin agents.

- Each such agent's role and task text leave your machine, as
  What the plugin sends describes.
- [Descriptions can hold private names](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#descriptions-and-private-names).
  Read them before you set `extended`.
- The plugin replaces the model and effort that an agent's definition sets,
  because Claude Code does not expose them.

## Requests and billing

One call sends at most four requests, as
[Retries and the second provider](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-provider)
explains.

One fixed 8 s limit covers the whole call, both providers and all retries
included.
[The routing limit and billing](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-limit-and-billing)
says what a request in flight can cost.

## What the providers do with it

The providers' privacy policies are linked at
[What the providers do with it](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-the-providers-do-with-it).

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

The plugin reads one more environment variable, `CLAUDE_CODE_EFFORT_LEVEL`, only
to see whether it is set. It never sends or logs the value. It reads no other
environment variable.
[The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool)
says what the `config` tool reports.

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

Every plugin offers the choices in
[Your choices](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#your-choices).
Here, keep `scope` at `core` to route the four built-in agents only. Remove the
keys from the plugin's configuration and from both variables. Disable the plugin
and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
