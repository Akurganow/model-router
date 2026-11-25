# Privacy policy

model-router is a Claude Code plugin published by Akurganow. This policy says
what the plugin sends, where it goes, and what the plugin keeps. Effective
2026-11-21.

## Where requests go

The plugin asks a decision model to score each Agent tool call it routes. Under
the default `core` scope, only the four built-in agents route. [The extended
scope](#the-extended-scope) adds the others. The model answers on one or two
paths:

- the direct path: the provider's own API, with the provider's key
- the gateway path: OpenRouter, with your OpenRouter key.

The `provider` option says whose model scores: `typesafe`, `openai`,
`google` or `perplexity`. OpenRouter is a gateway that passes the request to that provider's
model. These companies can receive the task text:

| Company | Host | It receives the text when | Key it takes |
| :-- | :-- | :-- | :-- |
| TypeSafe | `api.typesafe.ai` | `provider` is `typesafe` and `gateway` allows the direct path | the TypeSafe key, as a bearer token |
| OpenAI | `api.openai.com` | `provider` is `openai` and `gateway` allows the direct path | the OpenAI key, as a bearer token |
| Google | `generativelanguage.googleapis.com` | `provider` is `google` and `gateway` allows the direct path | the Google key, in the `x-goog-api-key` header |
| Perplexity | `api.perplexity.ai` | `provider` is `perplexity` and `gateway` allows the direct path | the Perplexity key, as a bearer token |
| OpenRouter | `openrouter.ai` | `gateway` allows its path, as the gateway to each of the four | the OpenRouter key, as a bearer token |

The `gateway` option decides which paths are open:

| `gateway` | First request | Second request, after a failure |
| :-- | :-- | :-- |
| `direct`, the default | the provider, with its key | none |
| `auto` | the provider, with its key | OpenRouter, with the OpenRouter key |
| `openrouter-first` | OpenRouter, with the OpenRouter key | the provider, with its key |
| `openrouter` | OpenRouter, with the OpenRouter key | none |

A path with no key is left out. With both keys under `auto` or `openrouter-first`, one call may reach both the provider and OpenRouter.

[The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway)
gives the fallback rules.

Claude Code hands the plugin an option's default in place of a stored value
outside the option's list. The plugin then sends by that default, as
[A stored value outside an option's list](README.md#a-stored-value-outside-an-options-list)
says.

Each key goes only to the host above of the company that issued it, as
[Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys)
explains.

The plugin options or an environment variable can supply a key, as [What the
plugin stores](#what-the-plugin-stores) says.

## What the plugin sends

An HTTPS POST goes to the company the table above names on every Agent tool
call the plugin routes. The JSON body holds:

- the subagent's task text, prepared as
  [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
  says
- the agent's role:
  - the built-in `general-purpose` and `claude` agents send one fixed text that
    ships with the plugin
  - every other routed agent sends its description, as Claude Code offers it.
    The plugin masks the token-shaped strings that
    [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
    lists, collapses whitespace and cuts it to 500 characters. Under the
    default scope these are the built-in `Explore` and `Plan`
  - a missing or blank description sends `An agent with no description.`
  - under `extended`, a `general-purpose` or `claude` agent you define sends its
    description once Claude Code has offered it. Before that offer it sends the
    fixed text
  - [The role of the default agent](docs/model-choice.md#the-role-of-the-default-agent)
    says why the text is fixed
- the caller's one-line description of the task, masked, collapsed and cut
  the same way
- the model of the endpoint and the two scoring questions, as
  [The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
  lists them

[The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
lists the headers the plugin sets.

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
[Retries and the second attempt](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-attempt)
explains.

One fixed 10 s limit covers the whole call, both attempts and all retries
included.
[The routing limit and billing](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-limit-and-billing)
says what a request in flight can cost.

## What each company does with the text

The companies' own pages are linked at
[What each company does with the text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-each-company-does-with-the-text).

## What the plugin stores

The plugin stores nothing on disk itself. With `--debug`, Claude Code writes
each request body to its debug log file. In memory the plugin holds the
configured keys while the hook is registered. It also holds the latest source
and description of each agent name Claude Code offers, such as `built-in`.
Claude Code keeps your API keys in your system's secure storage as sensitive
plugin options. The plugin reads a key only for a company that the `provider`
and `gateway` options allow, and only to send it to the company that issued
it. When a key option is empty, the plugin reads that key from its variable:
`TYPESAFE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY` or
`OPENROUTER_API_KEY`. It does not read `GOOGLE_API_KEY`. A key in a variable stays
wherever you set it, for example in plaintext in a settings file. It is
visible to every process Claude Code starts.

The plugin reads one more environment variable, `CLAUDE_CODE_EFFORT_LEVEL`, only
to see whether it is set. It never sends or logs the value. It reads no other
environment variable.
[The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool)
says what the `config` tool reports.

A project can set any of these variables in the `env` block of its Claude Code
project settings. When the matching key option is empty, the plugin then sends
the task text to the account that project key belongs to.

The provider, gateway, scope and models choices live in your Claude Code
settings, as the plugin options `provider`, `gateway`, `scope` and `models`.
The plugin writes them in three cases only. You pick a value in the dialog that
the `config` tool opens. Or you type `/model-router:provider`,
`/model-router:gateway` or `/model-router:scope` with a value at your own
prompt. Or the agent passes a `models` text to the `config` tool at your
request. A command from any other origin writes nothing. The plugin writes no other option and no file. Claude
Code ignores plugin options in project and local settings, so a project cannot
change any of these options.

After an update, a stored `openrouter` in `provider` reaches the plugin as
`typesafe`. Beside a TypeSafe key, the plugin then sends the task text to
TypeSafe's own API, as
[A stored value outside an option's list](README.md#a-stored-value-outside-an-options-list)
says.

The lines the plugin prints per call go to your own transcript and, with
`--debug`, to your debug log.

## Your choices

Every plugin offers the choices in
[Your choices](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#your-choices).
Here, keep `scope` at `core` to route the four built-in agents only. Remove the
keys from the plugin's configuration and from the five variables. Disable the plugin
and nothing is sent.

## Children

The plugin is a developer tool and is not intended for people under 18.

## Changes and contact

Changes to this policy appear in this repository's history. Questions go to
https://github.com/Akurganow/model-router/issues.
