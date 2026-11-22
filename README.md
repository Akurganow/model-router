# model-router

[![Release](https://img.shields.io/github/v/release/Akurganow/model-router)](https://github.com/Akurganow/model-router/releases)
[![CI](https://github.com/Akurganow/model-router/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Akurganow/model-router/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Akurganow/model-router)](LICENSE)

![Gamayun, the prophetic bird of Slavic folklore](docs/banner.jpg)

model-router picks a model for subagents that your coding agent starts. It
sends a lookup to a small model, bounded work to a middle model and open-ended
work to a large one, each with a fitting effort. Where no model is set for one
of the three, the harness keeps its own. There is a plugin for Claude Code,
Oh My Pi, OpenClaw and Hermes Agent.

For each task it scores, the plugin asks a decision model two questions: how
much judgment the task needs and how much work it takes. The answers pick the
model and the effort. The decision model is [Jev](https://docs.typesafe.ai) from
TypeSafe by default, or OpenAI's or Google's, on the provider's own API or
through OpenRouter. The plugin routes subagents only. It never changes the
model of your main session.

| Harness | The plugin sets | Minimum version | Install | Guide |
| --- | --- | --- | --- | --- |
| Claude Code | `model` and `effort` | v2.1.308 | [Install for Claude Code](#claude-code) | [Claude Code guide](plugins/model-router/README.md) |
| Oh My Pi | the `smol`, `midl` or `slow` role and the thinking level | v18.12.6 | [Install for Oh My Pi](#oh-my-pi) | [Oh My Pi guide](plugins/model-router-omp/README.md) |
| OpenClaw | `model` and `thinking` | 2026.10.10 | [Install for OpenClaw](#openclaw) | [OpenClaw guide](plugins/model-router-openclaw/README.md) |
| Hermes Agent | the `model`, `provider` and `reasoning_effort` of the task's child | 0.22.6 | [Install for Hermes Agent](#hermes-agent) | [Hermes Agent guide](plugins/model-router-hermes/README.md) |

You need the API key of the provider you choose (TypeSafe, OpenAI or Google)
or an OpenRouter key. The OpenRouter key reaches any of them when the `gateway`
setting allows OpenRouter. Each task the plugin scores sends its condensed
text and short texts that describe it and its agent, with token-shaped strings
masked. They go to the provider's own API, to OpenRouter or to both, as the
`provider` and `gateway` settings allow.
[What leaves the machine](#what-leaves-the-machine) says more.

## Install

You need:

- A harness at or above the minimum version in the table.
- An API key for a path your settings allow.
  [Where to get each key](docs/providers.md#keys) lists the four and their
  variables.

Two settings decide who receives each task. `provider` says whose model
scores, and `gateway` says how OpenRouter is used to reach it.
[The page on both settings](docs/providers.md#the-provider-and-the-gateway)
gives their values, their defaults and what one key does.

<!-- install:start -->

### Claude Code

```sh
claude plugin marketplace add Akurganow/model-router
claude plugin install model-router@model-router
```

Source: Claude Code documentation, [Install and manage plugins](https://code.claude.com/docs/en/plugins/install#add-a-marketplace).

CI installs it on Ubuntu.

[Set up Claude Code](#set-up-claude-code) has the next steps.

### Oh My Pi

```sh
omp plugin marketplace add Akurganow/model-router
omp plugin install model-router@model-router
```

Source: Oh My Pi documentation, [marketplace.md, lines 20 to 25](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L20-L25).

CI installs it on Ubuntu.

[Set up Oh My Pi](#set-up-oh-my-pi) has the next steps.

### OpenClaw

```sh
openclaw plugins install npm:@akurganow/model-router --force --accept-capabilities
openclaw plugins enable model-router-openclaw
openclaw plugins inspect model-router-openclaw --runtime --json
```

Source: OpenClaw documentation, [Manage plugins](https://docs.openclaw.ai/plugins/manage-plugins).

Review the source of the package before you run these commands: they carry `--force` and `--accept-capabilities`.

CI installs the packed npm package on Ubuntu and checks that OpenClaw loads it.

[Set up OpenClaw](#set-up-openclaw) has the next steps.

### Hermes Agent

```sh
hermes plugins install Akurganow/model-router/plugins/model-router-hermes --enable
hermes config set delegation.backend model-router
```

Source: Hermes Agent documentation, [Plugins](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins).

CI installs it on Ubuntu.

[Set up Hermes Agent](#set-up-hermes-agent) has the next steps.

<!-- install:end -->

The Hermes command `hermes config set delegation.backend model-router` replaces `model_map` or any other delegation backend, because Hermes runs one backend at a time.

### Set up Claude Code

After the commands, follow the [Claude Code setup steps](plugins/model-router/README.md#set-up).
They cover the terminal, VS Code and the desktop app, and set the options and the keys.

### Set up Oh My Pi

After the commands, follow the [Oh My Pi setup steps](plugins/model-router-omp/README.md#set-up).
They cover the restart, the keys and the model roles.

### Set up OpenClaw

After the commands, check the install as the [OpenClaw install notes](plugins/model-router-openclaw/README.md#install) say.
Then follow the [OpenClaw setup steps](plugins/model-router-openclaw/README.md#set-up).

### Set up Hermes Agent

After the commands, read the [Hermes Agent install notes](plugins/model-router-hermes/README.md#install).
Then follow the [Hermes Agent setup steps](plugins/model-router-hermes/README.md#set-up).

### After an update

After an update, a line that ends in `not valid: run setup` means a stored setting holds a value the new version does not take. [A setting that is not valid](docs/providers.md#a-setting-that-is-not-valid) says what to do, and lists the retired values of `provider`. Claude Code shows no such line: [A stored value outside an option's list](plugins/model-router/README.md#a-stored-value-outside-an-options-list) says what it does in its place.

## How it works

The plugin scores a task before its subagent starts. The decision model reads
the task and a short text about the agent, and answers two questions:

- How much judgment the task needs. The answer is level 0 (lookup or
  transcription), 1 (bounded judgment) or 2 (open judgment). The level picks
  the small, middle or large model.
- How much work the task takes. The answer picks the effort from a fixed
  ladder. [model-choice.md](plugins/model-router/docs/model-choice.md) says why
  the levels and the ladder are what they are.

The `provider` setting names the decision model, and `typesafe`, which is Jev,
is the default. Each guide lists the subagents its plugin routes and the models
and efforts of yours that it keeps. The plugin
[fails open](docs/providers.md#fails-open): a task it cannot score runs as it
would without the plugin. In Oh My Pi, OpenClaw and Hermes Agent,
[a level with no model](docs/providers.md#a-slot-with-no-model) keeps the model
the harness gives it. It still gets the effort, unless you set one.

## What leaves the machine

> [!IMPORTANT]
> Each task the plugin scores sends a request. It holds the condensed task
> text, a text about the agent and, when there is one, a short description of
> the task, all with token-shaped strings masked. `provider` and `gateway` pick
> the host, and each host gets its own key:
>
> - The provider's own API gets the request under `direct`, and first under
>   `auto`. `provider` picks the host: `api.typesafe.ai`, `api.openai.com` or
>   `generativelanguage.googleapis.com`.
> - `openrouter.ai` gets it under `openrouter`, and first under
>   `openrouter-first`.
>
> With both keys, `auto` and `openrouter-first` send the same texts to the
> second host after [some failures of the first](docs/providers.md#the-provider-and-the-gateway).
> To keep each task with one company, leave `gateway` at `direct`, the
> default: it never contacts OpenRouter.
>
> To stop the requests, turn the plugin off as its guide says, or remove the
> key of every path `gateway` allows.

[The request](docs/providers.md#the-request) lists the address and the model
of each path. Each privacy policy says what its plugin sends:

- [Claude Code privacy policy](plugins/model-router/PRIVACY.md)
- [Oh My Pi privacy policy](plugins/model-router-omp/PRIVACY.md)
- [OpenClaw privacy policy](plugins/model-router-openclaw/PRIVACY.md)
- [Hermes Agent privacy policy](plugins/model-router-hermes/PRIVACY.md)

## Documentation

| Fact | The file that holds it |
| --- | --- |
| What the four plugins share: settings, keys, fallback, request, retries and what each company does with the text | [docs/providers.md](docs/providers.md) |
| Claude Code: set up, reach, routing, effort, update and troubleshooting | [plugins/model-router/README.md](plugins/model-router/README.md) |
| Oh My Pi: set up, roles, routing, effort, update and skip reasons | [plugins/model-router-omp/README.md](plugins/model-router-omp/README.md) |
| OpenClaw: set up, models, routing, effort, update and skip reasons | [plugins/model-router-openclaw/README.md](plugins/model-router-openclaw/README.md) |
| Hermes Agent: set up, models, routing, the Node step, update and skip reasons | [plugins/model-router-hermes/README.md](plugins/model-router-hermes/README.md) |
| What one plugin sends, stores and reads | The `PRIVACY.md` beside that plugin's guide |
| Why the model levels and the effort ladder are what they are | [plugins/model-router/docs/model-choice.md](plugins/model-router/docs/model-choice.md) |
| What each client reads from a package | [docs/clients.md](docs/clients.md) |
| The evidence of each client fact | [The wiki's evidence pages](https://github.com/Akurganow/model-router/wiki#evidence-pages) |

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers the repository layout, the build,
the checks, the commit rules and calibration against TypeSafe or OpenRouter, with
`node scripts/calibrate.ts <typesafe|openrouter> [model]`, and the offline rule
comparison with `node scripts/compare-rules.ts`.

## Support

Questions and bug reports go to
https://github.com/Akurganow/model-router/issues.

## License

MIT, as [LICENSE](LICENSE) states.

## To do

- Score with more decision models.
  Candidates not supported yet: Liquid D1, Microsoft Decision 1.1, Nace.AI Drex and Perplexity Decider.
