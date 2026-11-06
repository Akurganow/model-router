# model-router for Hermes Agent

A [Hermes Agent](https://github.com/NousResearch/hermes-agent) plugin that picks a model and an effort for each `delegate_task` task. [Jev](https://docs.typesafe.ai), on TypeSafe or OpenRouter, scores the task. The plugin then gives the task's child that model and effort.

## What it does

- It is a delegation backend named `model-router`. It scores each `delegate_task` task for judgment and work through Jev. [The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request) lists the two questions.
- It routes the tasks of `delegate_task` only. The main turn is never routed.
- Level 0 gives the task your `small_model`. Level 2 gives it your `large_model`. Level 1 leaves the model alone.
- It sets the effort from a fixed ladder, as [Routing](#routing) says.
- It sets only a model you assigned and never proposes one. It skips a model that Hermes cannot resolve offline with a credential that needs no network refresh.
- It never overrides a model you chose, nor an effort the `delegation` section sets. [Which tasks are routed](#which-tasks-are-routed) lists the model rules, and [Routing](#routing) lists the effort rules.
- It starts Hermes's own Node once per task to run the scoring step. [Node](#node) says how.
- It fails open. [Fails open](PRIVACY.md#fails-open) says what that means and what Hermes can still do.
- The plugin changes a setting only when you type `/model-router-provider`. It never writes `delegation.backend`.

## Install

The install commands are under [Hermes Agent](../../README.md#hermes-agent) in the root README. The notes below explain them.

Hermes 0.22.6 or later is required, because the offline slot check uses a function that 0.22.6 added. The manifest declares `requires_hermes: ">=0.22.6"`, and Hermes refuses an older version before it loads the plugin. A Hermes core that does not check that field and has no delegation providers loads the plugin, logs a warning and leaves it off.

The install command takes the repository's subfolder, `Akurganow/model-router/plugins/model-router-hermes`. `--enable` enables the plugin without Hermes's prompt. The root README's install block also sets `delegation.backend` to `model-router`, so the plugin and its backend are both on after install.

Update with `hermes plugins update model-router-hermes`. Pin an install to one commit by adding `--ref <commit>` with the full 40-character commit hash to the install command. Hermes refuses to update a pinned plugin. To move the pin, run the install again with `--force --ref <new-commit>`.

Hermes scans a plugin before it activates it, on install and on update. The verdict for this plugin is `safe`. The scan reports one informational finding of medium severity, `python_subprocess`, for the line that starts Node.

A gateway keeps a loaded plugin between turns. After a plugin update, or after a change of `plugins.isolation`, run `hermes gateway stop`. Hermes then loads the new code on its next start.

[Facts behind this section](../../docs/clients.md#hermes-install-and-update), [the scan and validate facts](../../docs/clients.md#hermes-install-scan-and-validate)

## Set up

Routing needs the plugin enabled, the backend on, a key and a model in a slot. The [setup skill](skills/model-router-setup/SKILL.md) walks through them. Ask Hermes to load `model-router-hermes:model-router-setup`.

1. Know what the backend replaces. Hermes runs one delegation backend at a time, so `delegation.backend: model-router` replaces `model_map` or any other backend. A backend change applies from the next session. In a running session, type `/delegation model-router --now`.
2. Add a [key](#keys).
3. Assign `small_model` and `large_model`, as [Models](#models) says.
4. Pick the [provider](#provider) if the default does not fit.
5. Delegate one small task, and read its [label](#the-label-and-the-log).

[Facts behind this section](../../docs/clients.md#hermes-registration-and-settings)

## Keys

The plugin reads a key only for a provider the [`provider` setting](#provider) allows. It reads each key through Hermes's own secret reader, from one variable:

- TypeSafe: `TYPESAFE_API_KEY`.
- OpenRouter: `OPENROUTER_API_KEY`.

The TypeSafe key has three forms: the tool argument `typesafe_key`, the settings secret `typesafe_api_key` and the environment variable `TYPESAFE_API_KEY`. A key counts as set when the variable holds non-blank text. [Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys) says where to get one and where it goes. With no key for any allowed provider, every task reports `key unset`. The plugin never uses Hermes's own provider credentials as a Jev key.

Add a key in one of two ways:

- Write the variable into `~/.hermes/.env`, the env file of the Hermes home.
- For the TypeSafe key, fill the secret field in the plugin's settings form in Hermes Desktop. Hermes stores it as `TYPESAFE_API_KEY` in the same file. The OpenRouter key has no settings field.

Hermes holds a key in the gateway's environment, so the programs Hermes starts can read it. [What the plugin stores](PRIVACY.md#what-the-plugin-stores) says so. Never type a key into the chat.

[Facts behind this section](../../docs/clients.md#hermes-registration-and-settings)

## Provider

The `provider` setting picks which providers judge each task, and in which order:

| Value | Providers |
| --- | --- |
| `typesafe` (default) | TypeSafe only |
| `openrouter` | OpenRouter only |
| `auto` | TypeSafe, then OpenRouter |
| `openrouter-first` | OpenRouter, then TypeSafe |

Fallback rules: [Which provider gets a task](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#which-provider-gets-a-task). Who receives a task under each value: [PRIVACY.md](PRIVACY.md).

Switch it with `/model-router-provider <value>`. The plugin reads the setting at each task.

## Change the options

`/model-router-provider [auto|openrouter-first|typesafe|openrouter]` shows or changes the provider. [The option commands](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-option-commands) say what a bare command, an invalid value and a failed write print. The command writes only from a local session: a Hermes CLI, TUI or Desktop session. From any other session, such as a messaging platform, it prints `provider unchanged: only a local session can change it` and the current value.

The read-only `model_router_config` tool returns the `provider` line, the two model lines and the key lines. [The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool) says what the key lines show. The tool sits in the `model_router` toolset, which is on once the plugin is enabled.

```text
provider: auto (typesafe, then openrouter)
small_model: openrouter <model>
large_model: unset
typesafe key: set
openrouter key: unset
```

Given a setting name, the tool returns how to change that setting. It writes nothing. The names are `provider`, `typesafe_key`, `openrouter_key`, `small_model` and `large_model`.

[Facts behind this section](../../docs/clients.md#hermes-registration-and-settings)

## Models

Each slot is a mapping with two fields. `provider` is a Hermes provider id. `model` is a model id as Hermes lists it for that provider. Assign the slots in the plugin's settings form in Hermes Desktop, in `config.yaml` under `plugins.entries.model-router-hermes.settings`, or with:

```bash
hermes config set plugins.entries.model-router-hermes.settings.small_model '{"provider": "<provider>", "model": "<model>"}'
hermes config set plugins.entries.model-router-hermes.settings.large_model '{"provider": "<provider>", "model": "<model>"}'
```

A slot with no `model` counts as unset. You can fill one slot. A level whose slot is empty skips with `small model unset` or `large model unset`.

Before it sets a slot, the plugin checks it offline. The slot must pass all of these:

- The slot names a `provider` and a `model`.
- The provider keeps its credentials offline. That means one of two cases. The provider's credentials do not refresh over the network, and Hermes either lists the provider with the auth type `api_key` or resolves it outside its provider registry, as it does `openrouter`. Or the provider is `anthropic`, `ANTHROPIC_API_KEY` is set, and neither `ANTHROPIC_TOKEN` nor `CLAUDE_CODE_OAUTH_TOKEN` is.
- Hermes resolves the provider with credentials and installs no plugin to do it.
- Hermes's offline catalogue lists the model for that provider.

A slot that fails any check skips with `small model unresolved` or `large model unresolved`. A provider that signs in with OAuth reads as unresolved, and so does an `anthropic` slot that would use Claude Code's credentials. Custom and local providers read as unresolved too, because the catalogue lists no models for them. The check makes no network request.

The plugin does not check a model that the catalogue lists and the provider rejects at run time. The child then fails on the model. [Fails open](PRIVACY.md#fails-open) says so.

[Facts behind this section](../../docs/clients.md#hermes-model-and-credential-checks)

## Routing

| Level | Judgment the task needs | Model the plugin sets |
| --- | --- | --- |
| 0 | Lookup or transcription | `small_model` |
| 1 | Bounded judgment | none, no change |
| 2 | Open judgment | `large_model` |

The plugin stays at level 1 unless an end is clearly more likely, as [model-choice.md](../model-router/docs/model-choice.md#the-default-level) explains. At level 1 the child runs on the route Hermes would give it.

The work question picks the effort. The ladder is the one in the [Effort section](../model-router/README.md#effort), and the plugin sets `reasoning_effort` to one of `low`, `medium`, `high` or `xhigh`. It never sets `max`, `ultra`, `minimal` or `none`. The small model's row starts at `medium`. [model-choice.md](../model-router/docs/model-choice.md#the-work-question-and-the-arch) says why. Hermes maps an effort that the child's model does not take to the nearest weaker one it takes.

The routed effort replaces the effort of the calling session. Hermes ranks a route's effort above the parent's level.

The plugin keeps two kinds of setting:

- **An effort.** A non-empty `delegation.reasoning_effort` is your own effort for subagents. The plugin routes the model and sets no effort. The line shows `config effort`.
- **A model.** A `delegation` section that sets `model`, `provider`, `base_url` or `api_key` names a route of its own. The plugin leaves every task on it, and the line shows `subagent model set`.

The route starts as the whole `delegation` section, as Hermes's default backend returns it. Two settings of that section, `api_mode` and `request_overrides`, therefore apply at every level. They also apply when the plugin changes the provider. That is a known limit: an `api_mode` set for one provider reaches a child on another.

[Facts behind this section](../../docs/clients.md#hermes-routing-and-refusals)

## Which tasks are routed

### The gates

Every task meets these gates in order. The first that fails skips the task with its reason, and Hermes runs the task on its own route, the one the default backend gives.

1. `key unset`: no provider the `provider` setting allows has a key.
2. `no small or large model`: neither slot is set.
3. `subagent model set`: the `delegation` section sets `model`, `provider`, `base_url` or `api_key`. Hermes's own choice decides.
4. `node not found`: Hermes has no Node. [Node](#node) says why.
5. `timeout`: the routing limit was used up before this task started. [Sequential routing and the shared budget](#sequential-routing-and-the-shared-budget) says when.

### After the gates

A scored task can still skip:

- `small model unset` or `large model unset`: the level picked a slot you left empty.
- `small model unresolved` or `large model unresolved`: the slot fails the [offline checks](#models).
- `timeout`: Jev did not answer within the budget, or the offline checks did not finish within the time left.
- `HTTP <status>`, `network error`, `rejected request`, `bad reply` or `failed`: Jev did not answer at all, or the Node step failed. `failed` also covers any error in the plugin. After two providers, the reason names each, as [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says.

[Facts behind this section](../../docs/clients.md#hermes-routing-and-refusals)

## Sequential routing and the shared budget

Hermes routes the tasks of one `delegate_task` call one after another, before any child starts. The wait is the sum over the tasks.

One routing limit of 8 s covers a whole call. It holds the scoring of every task, both providers and all retries included. The first task of a call opens a budget, and each later task gets what is left. A task that starts with no time left runs unrouted and reports `skipped, timeout`. The plugin ends a Node run 1 s after its share, as a guard for a stuck process.

The budget record lives in the process that holds the plugin: the gateway, or the plugin host under `plugins.isolation: host`. It is not kept per call or per session. Concurrent sessions on one gateway share one record. Under host isolation the plugin host, one per profile, holds it. A call's first task, or a task that starts more than the limit after the last one ended, restarts it. Two calls that route at the same time can therefore shorten each other's share.

[Requests and billing](PRIVACY.md#requests-and-billing) says what a call of many tasks costs.

[Facts behind this section](../../docs/clients.md#hermes-routing-and-refusals), [the host facts](../../docs/clients.md#hermes-runtime-logs-and-environment)

## Node

The plugin runs the scoring step in Node. It uses only Hermes's own Node. It never uses a Node on `PATH`, and it reports `node not found` when Hermes has none. It starts the program `route.mjs` once per task. It writes the request to the program's standard input and reads one line of JSON back. Keys travel on standard input only.

The program sees a short list of environment variables. [The program the plugin starts](PRIVACY.md#the-program-the-plugin-starts) lists them. The list holds the proxy variables. Node's `fetch` reads `HTTPS_PROXY` and `HTTP_PROXY` only when `NODE_USE_ENV_PROXY=1` is set. When a proxy variable is present, the plugin sets that switch, unless the environment sets it already. `NO_PROXY` alone turns nothing on.

Node reads the switch from 22.21.0 on the 22 line, and from 24.0.0. An older Node ignores the switch and connects directly.

[Facts behind this section](../../docs/clients.md#hermes-runtime-logs-and-environment)

## The label and the log

The plugin puts one line per routed or skipped task in the task's `route.label`. Hermes shows the label with the child's progress and with the child's result, in every plugin isolation mode. The plugin also writes the line to `~/.hermes/logs/agent.log` at INFO, once for each distinct line. The line starts with `model-router`.

```text
model-router L0 <model> · medium · p=0.91/0.84 · jev jev-1.14.0 · 812/9 tok
model-router L1 no change · config effort · p=0.62/0.70
model-router skipped, key unset
```

A routed line follows [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line). The model is the `model` field of the slot.

A skipped line reads `skipped, <reason>`. [Which tasks are routed](#which-tasks-are-routed) lists the reasons.

Under `plugins.isolation: host`, the plugin host drops INFO lines by default, so `agent.log` shows no routing line. The `route.label` still carries it.

[Facts behind this section](../../docs/clients.md#hermes-runtime-logs-and-environment)

## What the plugin reads and writes

[What the plugin stores](PRIVACY.md#what-the-plugin-stores) lists what the plugin reads and writes.

## What leaves the machine

[PRIVACY.md](PRIVACY.md) lists the request, the providers, the retries and the Node program.

[How the plugins use the providers](https://github.com/Akurganow/model-router/blob/main/docs/providers.md) holds what the four plugins share.

## Turn it off

[Turn off and uninstall](../../README.md#turn-off-and-uninstall) has the commands. Set the backend back to `default` before you disable the plugin.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
