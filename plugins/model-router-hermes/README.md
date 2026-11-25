# model-router for Hermes Agent

A [Hermes Agent](https://github.com/NousResearch/hermes-agent) plugin that picks a model and an effort for each `delegate_task` task. It asks a decision model, on the provider's own API or through OpenRouter, how much judgment the task needs and how much work it takes. It then gives the task's child that model and effort.

## What it does

- It is a delegation backend named `model-router`. It scores each `delegate_task` task through the decision model of the `provider` setting: [Jev](https://docs.typesafe.ai) from TypeSafe, OpenAI's, Google's or Perplexity's. One request asks two questions: how much judgment the task needs, and how much work it takes.
- It routes the tasks of `delegate_task` only. The main turn is never routed.
- Level 0 gives the task your `small_model`, level 1 your `middle_model` and level 2 your `large_model`. A slot can be unset. Its level then keeps Hermes's model and gets the effort alone, as [Models](#models) says.
- It sets the effort from a fixed ladder, as [Effort](#effort) says.
- It sets only a model you assigned.
- It never overrides a model you chose, nor an effort the `delegation` section sets. [Precedence](#precedence) gives the whole order for the model and the effort.
- The delegating model can describe each task, and can set a task's effort or level to escalate it. [Parameters of `delegate_task`](#parameters-of-delegate_task) lists them.
- It starts Hermes's own Node once for each task it scores, and once for a task that sets a `level`, to check `models`. [Node](#node) says how.
- It fails open. [Fails open](PRIVACY.md#fails-open) says what that means and what Hermes can still do.
- The plugin changes a setting only when you type `/model-router-provider` or `/model-router-gateway`. It never writes `models` or `delegation.backend`.

## Install

The install commands are under [Hermes Agent in the root README](https://github.com/Akurganow/model-router/blob/main/README.md#hermes-agent). The notes below explain them.

Hermes 0.22.6 or later is required. The manifest declares `requires_hermes: ">=0.22.6"`, and Hermes refuses an older version before it loads the plugin. A Hermes core that does not check that field and has no delegation providers loads the plugin, logs a warning and leaves it off.

The install command takes the repository's subfolder, `Akurganow/model-router/plugins/model-router-hermes`. `--enable` enables the plugin without Hermes's prompt. The root README's install block also sets `delegation.backend` to `model-router`, so the plugin and its backend are both on after install. [The note under those commands](https://github.com/Akurganow/model-router/blob/main/README.md#hermes-agent) says what that setting replaces.

Pin an install to one commit by adding `--ref <commit>` with the full 40-character commit hash to the install command. Hermes refuses to update a pinned plugin. To move the pin, run the install again with `--force --ref <new-commit>`.

Hermes scans a plugin before it activates it, on install and on update. The verdict for this plugin is `safe`. The scan reports one informational finding of medium severity, `python_subprocess`, for the line that starts Node.

[Facts behind the install](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-install-and-update), [the scan and validate facts](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-install-scan-and-validate)

## Set up

Routing needs the plugin enabled, the backend on and a key. The models in the slots decide what each level runs on. The [setup skill](skills/model-router-setup/SKILL.md) walks through them. Ask Hermes to load `model-router-hermes:model-router-setup`.

1. A backend change applies from the next session. In a running session, type `/delegation model-router --now`.
2. Add a [key](#keys).
3. Assign any of `small_model`, `middle_model` and `large_model`, as [the format of a slot](#models) says. Each slot is optional: a slot you leave unset runs its level on Hermes's model.
4. Pick the [scoring provider and its gateway](#provider-and-gateway) if the defaults do not fit.
5. Check the routing, as [Verify](#verify) says.

[Facts behind the setup steps](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-registration-and-settings)

## Verify

Ask Hermes to delegate one small task, such as listing the files in the current folder. The plugin puts its line in the task's `route.label`, and Hermes shows the label with the child's progress and result. [The label and the log](#the-label-and-the-log) shows an example, explains the line and says where else it goes. [The gates and what follows them](#which-tasks-are-routed) list the `skipped` reasons.

## Keys

The plugin reads a key only for a key holder that the [`provider` and `gateway` settings](#provider-and-gateway) allow. It reads each key through Hermes's own secret reader, from one variable.

| Key holder | Settings secret | Variable |
| --- | --- | --- |
| TypeSafe | `api_key` | `TYPESAFE_API_KEY` |
| OpenAI | `openai_api_key` | `OPENAI_API_KEY` |
| Google | `google_api_key` | `GEMINI_API_KEY` |
| Perplexity | `perplexity_api_key` | `PERPLEXITY_API_KEY` |
| OpenRouter | `openrouter_api_key` | `OPENROUTER_API_KEY` |

[Where to get a key](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys) also says when a key counts as set and which Google variable the plugins do not read.

Set a key in the `.env` file of the Hermes home or in the plugin's settings form in Hermes Desktop. Hermes stores a key from the form under its variable in that `.env` file.

Some of Hermes's own providers and tools read these variables too, so a key you save in the form can change Hermes itself:

- Hermes's own OpenRouter provider reads `OPENROUTER_API_KEY`. A key you save in the form becomes that provider's key: Hermes writes the variable and the copies of the old value in `config.yaml`. A key already in that variable scores tasks when the `gateway` setting allows OpenRouter.
- A key you save in the form for OpenAI is also the key of Hermes's own OpenAI provider. A key already in `OPENAI_API_KEY` scores tasks when the plugin's settings allow OpenAI's own API.
- Hermes's own Perplexity web search reads `PERPLEXITY_API_KEY`. A key you save in the form for Perplexity also gives that web search its key.
- The plugin's Google secret writes `GEMINI_API_KEY`. Hermes's own Gemini provider reads `GOOGLE_API_KEY` before `GEMINI_API_KEY`, unless `model.key_env` names a variable for it. So a Google key you set for Hermes under `GOOGLE_API_KEY` is not used for scoring. Hermes's own Gemini provider prefers it over the key saved in the form, with the same `model.key_env` limit.

Hermes picks the provider of your own session in this order, with the provider `auto` or none requested. The first rung that applies decides:

1. A key or a base URL given on the command line.
2. `model.provider` in `config.yaml`.
3. A `model.base_url` on a loopback host, when `model` names no provider.
4. A usable `OPENROUTER_API_KEY`.
5. The OpenRouter credential pool.
6. Another provider's key in the environment: the first provider in Hermes's own order whose variable holds a usable value. OpenAI's stands before Gemini's.
7. An OAuth login.

So Hermes's own OpenRouter, OpenAI or Gemini provider may become the provider of your own session. Set `model.provider` to keep another provider.

No other credential of Hermes serves as a scoring key.

Hermes holds a key in the gateway's environment, so the programs Hermes starts can read it. [Stored data](PRIVACY.md#what-the-plugin-stores) says so. Never type a key into the chat.

[Facts behind the keys](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-registration-and-settings)

## Provider and gateway

The `provider` and `gateway` settings decide who receives each task. By default, `provider` is `typesafe` and `gateway` is `direct`. [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) lists the other values, says which of them cost more and tells where each sends the task.

The `gateway` setting is not Hermes's gateway, the process that owns a session.

Who receives a task under each value: [the privacy policy](PRIVACY.md). [The model of each request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request) also says when the `jev-latest` alias moves.

Switch them with `/model-router-provider <value>` and `/model-router-gateway <value>`. The plugin reads both settings at each task.

[A setting that is not valid](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) says what a value outside a setting's list does, and lists the retired values of `provider`. Hermes passes such a stored value on as stored. The Desktop settings form refuses to save a value outside the choices, and it leaves such a stored value alone when it saves another field.

### The scoring model of each provider

The `models` setting names the scoring model of each provider. [The `models` setting](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-models-setting) lists its forms, its defaults, the OpenRouter names, when a value is not valid and the lines of the config tool. Hermes also takes a native object.

`plugin.yaml` declares `models` as `str`, because the settings form edits it as text, as the Claude Code and omp forms do. A mapping set in `config.yaml` still reads.

The tool is read-only, so you, or the agent on your word, set `models`. Use the plugin's settings form in Hermes Desktop, `config.yaml` under `plugins.entries.model-router-hermes.settings`, or run:

```bash
hermes config set plugins.entries.model-router-hermes.settings.models '<text>'
```

The plugin reads `models` at each task. The Python passes the stored value to the Node step, which decides whether it is valid and answers with its verdict. The Python reads the verdict and nothing else about the value. The plugin sends only the entry of the provider in force, so one value serves every `provider` setting.

A `models` value that is not valid stops routing, as [the rule for a value that is not valid](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) says. [The gates](#the-gates) say where each task meets that check, so a task without a `level` can skip with an earlier reason, such as `key unset`.

The plugin writes no setting when it loads. The setup skill writes a migrated shape when you agree.

[Facts behind the settings](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-registration-and-settings)

## Scope

Hermes Agent has no `scope` setting. The plugin considers every task of `delegate_task` and never the main turn. [Which tasks are routed](#which-tasks-are-routed) lists the tasks it skips.

## Change the options

`/model-router-provider [typesafe|openai|google|perplexity]` shows or changes the provider, and `/model-router-gateway [direct|auto|openrouter-first|openrouter]` shows or changes the gateway. [The option commands](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-option-commands) say what a bare command, an invalid value and a failed write print. Each command writes only from a local session: a Hermes CLI, TUI or Desktop session. From any other session, such as a messaging platform, a valid value prints `<setting> unchanged: only a local session can change it` and the current line.

The read-only `model_router_config` tool returns the `provider` line, the `gateway` line, the `models` lines, the three slot lines and the key lines. The `models` lines come from the plugin's Node step, which reads the stored value. When Hermes has no Node or the step fails, they are the one line `models: unavailable, no answer from node`. While the `models` value is not valid, the tool prints no key lines, as it prints none while a setting is not valid. The example shows the model line of one provider, and [The report lines](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-report-lines) show one for each. A slot line shows the slot's provider and model as you set them, or `unset`. [The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool) says what the key lines show and what the tool prints while a setting is not valid. The tool sits in the `model_router` toolset, which is on once the plugin is enabled.

```text
provider: typesafe
gateway: auto (typesafe, then openrouter)
models: unset
typesafe model: jev-latest (OpenRouter: jev-latest)
small_model: openrouter <model>
middle_model: unset
large_model: unset
typesafe key: set
openrouter key: unset
```

[Facts behind the commands](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-registration-and-settings)

## Models

Each slot is a mapping with two fields. `provider` is a Hermes provider id. `model` is a model id as Hermes lists it for that provider. Assign the slots in the plugin's settings form in Hermes Desktop, in `config.yaml` under `plugins.entries.model-router-hermes.settings`, or with:

```bash
hermes config set plugins.entries.model-router-hermes.settings.small_model '{"provider": "<provider>", "model": "<model>"}'
hermes config set plugins.entries.model-router-hermes.settings.middle_model '{"provider": "<provider>", "model": "<model>"}'
hermes config set plugins.entries.model-router-hermes.settings.large_model '{"provider": "<provider>", "model": "<model>"}'
```

A slot with no `model` counts as unset. You can fill any of the slots.

A slot that has a `model` gets that `model` and its `provider` set on the task, for a scored task and for a pinned `level`.

An unset slot keeps the route Hermes would give the task, and the line names the slot: `L1 middle model unset`. For a task it scores, the plugin still sets the effort, except where [the order of precedence](#precedence) says otherwise. [A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) has the rule the omp, OpenClaw and Hermes plugins share.

## Routing

The judgment question picks the level, and the level picks the slot, as [the table under A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) lists.

The plugin stays at level 1 unless an end is clearly more likely. [model-choice.md](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/docs/model-choice.md#the-default-level) explains the factors. A level whose slot is unset runs the child on the route Hermes would give it, as [the rule of an unset slot](#models) says.

### Precedence

Your `delegation` section outranks the delegating model, and both outrank the scoring model. For each of the model and the effort, the first row that applies decides:

| Rank | Model | Effort |
| --- | --- | --- |
| 1 | `model`, `provider`, `base_url` or `api_key` set in the `delegation` section. The plugin changes no model, and the line shows `subagent model set`. | A non-empty `delegation.reasoning_effort`. The plugin sets no effort, and the line shows `config effort`. |
| 2 | The task's `level`. The task takes that level's model, unscored, and carries no line while that model is set. | The task's `reasoning_effort`. Every route of the task carries it, a skipped one too, and a routed line shows `caller effort`. |
| 3 | The level the scoring model picks. | The ladder's effort for that level. |
| 4 | | None, for a task with a `level` and no effort above. Hermes gives it the parent's level. |

The route starts as the whole `delegation` section, as Hermes's default backend returns it. Two settings of that section, `api_mode` and `request_overrides`, therefore apply at every level. They also apply when the plugin changes the provider. That is a known limit: an `api_mode` set for one provider reaches a child on another.

A routed model gets the fallback chain in `delegation.fallback_providers`, and none when that is unset.

[Facts behind the precedence](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-routing-and-refusals)

### Parameters of `delegate_task`

The plugin adds three parameters to each task of `delegate_task`. Hermes shows them to the delegating model with their descriptions, and adds one line to the tool's description. That line asks for a description on every task, and names the escalation skill.

| Parameter | Values | What the plugin does with it |
| --- | --- | --- |
| `description` | One line of text | Masks token-shaped strings as in the task text, turns each run of whitespace into one space, cuts it to 500 characters and sends it to the scoring model as the request's description. A missing, blank or non-text value sends an empty description. |
| `reasoning_effort` | `low`, `medium`, `high`, `xhigh` | Keeps this effort, as rank 2 of [the precedence table](#precedence) says. |
| `level` | `0`, `1`, `2` | Asks the scoring model nothing. Level 0 sets your `small_model`, level 1 your `middle_model` and level 2 your `large_model`. [The ranks above it](#precedence) say what outranks it. |

Hermes refuses a task whose `reasoning_effort` or `level` is off these lists, before the plugin sees it. The plugin reads a `level` of `true` or `false` as unset.

A task that sets `level`:

- Meets three gates: `<setting> not valid: run setup`, then `models not valid: run setup`, then `subagent model set`. It needs no key. Node answers the `models` verdict only, and scores nothing.
- Gets its slot's model, as [the two fields of a slot](#models) give it. An unset slot runs the task on Hermes's own route, with the label `model-router L<level> <slot> model unset`.
- Carries no `route.label` and writes no log line when it passes both gates and its model is set. The task's result still names the model and provider it ran on.

The delegating model should leave `reasoning_effort` and `level` unset on a first dispatch. The escalation skill, `model-router-hermes:model-router`, says when to set them. [The skill](skills/model-router/SKILL.md) follows the escalation steps of the other plugins.

The parameters are part of the session's tool list. After an install or an update, they apply from the next session, or at once after `/delegation model-router --now`. The parameters' schema, with the `level` text, is part of Hermes's cached prompt. An update that changes it makes the prompt cache miss once.

[Facts behind the parameters](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-task-parameters)

### Node

The plugin runs the scoring step in Node. It uses only Hermes's own Node. It never uses a Node on `PATH`, and it reports `node not found` when Hermes has none. It starts the program `route.mjs` once for each task it scores, and once for the `models` verdict of a task that sets a `level`, which is not scored. When Hermes has no Node or that run fails, the plugin has no verdict and the task with a `level` is routed. It writes the request to the program's standard input and reads one line of JSON back. Keys travel on standard input only.

The program sees a short list of environment variables. [The program the plugin starts](PRIVACY.md#the-program-the-plugin-starts) lists them. The list holds the proxy variables. Node's `fetch` reads `HTTPS_PROXY` and `HTTP_PROXY` only when `NODE_USE_ENV_PROXY=1` is set. When `HTTPS_PROXY` or `HTTP_PROXY` is present, in either case, the plugin sets that switch, unless the environment sets it already. `NO_PROXY` alone turns nothing on.

Node reads the switch from 22.21.0 on the 22 line, and from 24.0.0. An older Node ignores the switch and connects directly.

[Facts behind the Node step](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-runtime-logs-and-environment)

## Effort

The work question picks the effort. The ladder is the one in the [Effort section of the Claude Code guide](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/README.md#effort), and the plugin sets `reasoning_effort` to one of `low`, `medium`, `high` or `xhigh`. It never sets `max`, `ultra`, `minimal` or `none`. The small model's row starts at `medium`. [model-choice.md on the work question](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/docs/model-choice.md#the-work-question-and-the-arch) gives the reasons. Hermes maps an effort that the child's model does not take to the nearest weaker one it takes.

The routed effort replaces the effort of the calling session. Hermes ranks a route's effort above the parent's level.

## Which tasks are routed

### The gates

Every task without a `level` meets these gates in order. The first that fails skips the task with its reason, and Hermes runs the task on its own route, the one the default backend gives. A task with a `level` meets gate 1, then `models not valid: run setup`, then gate 3. For that task Node answers a verdict on `models` and scores nothing; with no Node, or when that run fails, the task goes on.

1. `<setting> not valid: run setup`: a stored `provider` or `gateway` holds a value outside its list. [Not valid: run setup](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) says which setting the reason names.
2. `key unset`: no path the `gateway` setting allows has a key.
3. `subagent model set`: the `delegation` section sets `model`, `provider`, `base_url` or `api_key`. Hermes's own choice decides.
4. `node not found`: Hermes has no Node. [The Node step](#node) says why.
5. `timeout`: the routing limit was used up before this task started. [Sequential routing and the shared budget](#sequential-routing-and-the-shared-budget) says when.

### After the gates

A scored task can still skip:

- `models not valid: run setup`: the stored `models` value is not valid. Only Node reads that value, so the scored task's own Node run skips it, after gates 2 to 5 have passed.
- `timeout`: a first attempt got no answer in 5 s, or the budget ran out.
- `HTTP <status>`, `network error`, `bad reply` or `failed`: the attempt gave no score, or the Node step failed. [A failed attempt](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-failed-attempt) explains each. [The fallback rule of the line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says how the line names two of them. `failed` also covers any error in the plugin.

[Facts behind the gates](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-routing-and-refusals)

## The label and the log

The plugin puts one line per routed or skipped task in the task's `route.label`. A task that sets `level` and gets its model carries no line, as [the rules of a task with a level](#parameters-of-delegate_task) say. Hermes shows the label with the child's progress and with the child's result, in every plugin isolation mode. The plugin also writes the line to `~/.hermes/logs/agent.log` at INFO, once for each distinct line. The line starts with `model-router`.

```text
model-router L0 <model> · medium · p=0.91/0.84 · typesafe jev-1.14.0 · 812/9 tok
model-router L1 middle model unset · config effort · p=0.62/0.70 · typesafe jev-1.14.0 · 640/9 tok
model-router skipped, key unset
```

A routed line reads `L<level> <model or slot state> · <effort or kept label> · p=<tier>/<work>`. The kept label is `config effort` or `caller effort`. The model is the `model` field of the slot. The slot state is `<slot> model unset`, as [the state of an unset slot](#models) says. [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says what else it holds.

A skipped line reads `skipped, <reason>`. [The reasons of a skip](#which-tasks-are-routed) come from the gates and from what follows them.

Under `plugins.isolation: host`, the plugin host drops INFO lines by default, so `agent.log` shows no routing line. The `route.label` still carries it.

[Facts behind the label and the log](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-runtime-logs-and-environment)

## Limits

Hermes passes this backend a task's `goal`, `context` and index, and the parameters the plugin declares. It never passes `images` or `output_schema`. The scoring model reads a task's text alone, so a level-0 task gets your `small_model` even when that model takes no images. If your tasks carry images, assign a `small_model` that accepts them, or pin such a task with `level`. Hermes still checks a child's answer against its `output_schema`; the plugin cannot see it.

[Facts behind the limits](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-task-parameters)

### Sequential routing and the shared budget

Hermes routes the tasks of one `delegate_task` call one after another, before any child starts. The wait is the sum over the tasks.

One routing limit of 10 s covers a whole call. It holds the scoring of every task, both attempts and all retries included. The first task of a call opens a budget, and each later task gets what is left. A task that starts with no time left runs unrouted and reports `skipped, timeout`. The plugin ends a Node run 1 s after its share, as a guard for a stuck process.

The budget record lives in the process that holds the plugin: the gateway, or the plugin host under `plugins.isolation: host`. It is not kept per call or per session. Concurrent sessions on one gateway share one record. Under host isolation the plugin host, one per profile, holds it. A call's first task, or a task that starts more than the limit after the last one ended, restarts it. Two calls that route at the same time can therefore shorten each other's share.

[Requests and billing](PRIVACY.md#requests-and-billing) says what a call of many tasks costs.

[Facts behind the shared budget](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-routing-and-refusals), [the host facts](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-runtime-logs-and-environment)

## Update

Run these lines in a shell:

```sh
hermes plugins update model-router-hermes
hermes gateway stop
```

A gateway keeps a loaded plugin between turns, so Hermes loads the new code on its next start. Run `hermes gateway stop` after a change of `plugins.isolation` too.

[Install](#install) says how to pin a commit and how to update a pinned plugin.

## Turn it off

To turn routing off, set the delegation backend back to `default`. Run this line in a shell:

```sh
hermes config set delegation.backend default
```

In a running session, type `/delegation default --now`. The plugin sends nothing while the backend is `default`. To disable or remove the plugin, run one of these lines after that:

```sh
hermes plugins disable model-router-hermes
hermes plugins remove model-router-hermes
```

Never disable or remove the plugin while `delegation.backend` is still `model-router`. Hermes then fails delegation closed, and every `delegate_task` call returns an error. Removing the key of every path the `gateway` setting allows also stops routing, and every task without a `level` then reports `key unset`.

## What leaves the machine

[PRIVACY.md](PRIVACY.md) lists the request, the companies that receive it, the retries and the Node program.

[How the plugins use the providers](https://github.com/Akurganow/model-router/blob/main/docs/providers.md) holds what the four plugins share.

### What the plugin reads and writes

[What the plugin stores](PRIVACY.md#what-the-plugin-stores) lists what the plugin reads and writes.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
