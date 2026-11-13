# model-router for Oh My Pi

An [Oh My Pi](https://github.com/can1357/oh-my-pi) (omp) plugin that picks a model role and an effort for each subagent. It asks [Jev](https://docs.typesafe.ai), on TypeSafe or OpenRouter, how much judgment the task needs and how much work it takes. It then gives the agent the `smol`, `middle` or `slow` role for that spawn, and a thinking level from a fixed ladder.

## What it does

- It scores each eligible batch item through Jev, using the `jev-latest` alias. One request asks two questions: how much judgment the task needs, and how much work it takes.
- At spawn, it returns `@smol` for level 0, `@middle` for level 1 and `@slow` for level 2. Each role carries the effort as a thinking suffix, such as `@smol:high`. Without a set role, the spawn keeps the agent's model and gets the effort alone, as [Models](#models) says.
- The [`scope` setting](#scope) picks the agents. Under `core`, the default, only omp's bundled `task` agent is routed. Under `extended`, every agent whose model you did not set is routed.
- It never overrides a model you set. It keeps the item's own `effort` and a thinking level on the role it picks. Without a set role, it keeps a thinking level on the spawn's model patterns. [Efforts the plugin keeps](#efforts-the-plugin-keeps) lists the rules, and [Effort](#effort) names the exception: a level that an agent sets gives way to the ladder. It never changes the tool input.
- The routed effort replaces the level of a bundled agent: `auto` for `task`, where omp picks the effort for each prompt, and `medium` for `sonic`.
- The plugin changes a setting only when you pick a value in its dialog or give it a command. [Change the options](#change-the-options) lists both.
- An item is eligible when its `task` text is not empty. Under `core`, its `agent` must also be absent or `task`.

## Install

The [repository README](../../README.md#oh-my-pi) gives the install steps.

The catalog is `.omp-plugin/marketplace.json` at the repository root. It lists this plugin only.

omp also installs the plugin from npm, as `@akurganow/model-router`. The package serves omp and [OpenClaw](../model-router-openclaw/README.md):

```bash
omp plugin install @akurganow/model-router
omp plugin upgrade @akurganow/model-router
```

The git catalogue route stays. It installs `model-router-omp`, and `omp plugin upgrade model-router@model-router` upgrades it. omp keys the plugin's settings by the package name it installed. The git route uses `model-router-omp`, and the npm route uses `@akurganow/model-router`. The plugin reads and writes its settings under the name it was installed with. Existing git installs keep their settings.

Installing both the git plugin and the npm package is not advised. omp keeps their settings under different names, so each copy needs its own `provider` and `scope` ([omp install names](../../docs/clients.md#omp-install-names)). With both installed, change each in its own entry of `/settings` → Plugins.

## Key

For each provider the [`provider` setting](#provider) allows, the plugin checks two places, in this order:

- TypeSafe: omp's stored `typesafe` credential, which `/login typesafe` stores, then the `TYPESAFE_API_KEY` environment variable.
- OpenRouter: omp's stored `openrouter` credential, then the `OPENROUTER_API_KEY` environment variable.

A key counts as set when either place holds a non-empty value. [Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys) says where to get a key.

Add a key in one of three ways:

- Run `/login typesafe` or `/login openrouter`.
- Set the environment variable where omp reads it. The variable is visible to every process omp starts. [PRIVACY.md](PRIVACY.md#what-the-plugin-stores) says more.
- Let the `model_router_config` tool ask for the key in a text dialog, as [Change the options](#change-the-options) says.

## Provider

The `provider` plugin setting picks which providers judge each task, and in which order:

| Value | Providers |
| --- | --- |
| `typesafe` (default) | TypeSafe only |
| `openrouter` | OpenRouter only |
| `auto` | TypeSafe, then OpenRouter |
| `openrouter-first` | OpenRouter, then TypeSafe |

Fallback rules: [Which provider gets a task](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#which-provider-gets-a-task). Who receives a batch item under each value: [PRIVACY.md](PRIVACY.md).

Switch it with `/model-router:provider`, or in omp's `/settings` → Plugins, under the name omp installed it with: `model-router-omp` from the git catalogue, `@akurganow/model-router` from npm. The plugin reads the setting on every batch, so a change reaches the next batch with no reload.

A project's plugin settings may only narrow your global `provider` value: from `auto` or `openrouter-first` to `typesafe` or `openrouter`. The plugin ignores any other project value and uses the global one.

Both providers get the `jev-latest` alias. OpenRouter routes it to its own alias for the newest Jev release.

## Scope

The `scope` plugin setting picks which agents the plugin routes:

| Value | Agents routed |
| --- | --- |
| `core` (default) | The bundled `task` agent only |
| `extended` | Every agent whose model you did not set, bundled agents included |

A value outside the two counts as `core`.

Under `extended`, the plugin judges each batch item on its own. Bundled agents route: `task`, `scout`, `sonic`, `reviewer` and `security-reviewer`, on omp 18.12.6 and 18.18.9. A bundled agent's default model is not your choice. The bundled `seance` agent is the exception: omp gives it no spawn hook, so the plugin skips it.

The plugin skips an item, with the reason in the [batch line](#the-batch-line), when any of these holds:

- The item sets its own `model`.
- You set the agent's model: `task.agentModelOverrides` has an entry for it, or the `task` model role is set and the agent is `task`.
- `task.disabledAgents` lists the agent.
- The agent is not bundled and declares its own model.
- The agent is not in omp's agent list.
- omp's agent discovery failed.

Every routed agent gets the roles of [Models](#models), each while it is set: `@smol` at level 0, `@middle` at level 1 and `@slow` at level 2. A set role replaces a bundled agent's own role at every level. Each level also sets the effort, as [Effort](#effort) says.

A project's plugin settings may set `scope` to either value. A project value overrides your global one in both directions. `provider` differs: a project may only narrow it. [PRIVACY.md](PRIVACY.md#the-extended-scope) says what a project that sets `extended` changes.

## Change the options

Two commands show or change an option:

- `/model-router:provider [auto|openrouter-first|typesafe|openrouter]`
- `/model-router:scope [core|extended]`

[The option commands](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-option-commands) say what a command prints. A command with a valid value writes it to your global plugin settings. When a project value wins over the new global one, the output says `A project value for <setting> overrides it.` Without a UI, a command prints to standard error.

The `model_router_config` tool takes one optional input, `setting`: `provider`, `scope`, `typesafe_key` or `openrouter_key`. The tool loads as essential and omp treats it as a write tool.

- **No setting:** the tool returns the `provider` line, the `scope` line and the key lines. [The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool) says what the key lines show.

  ```text
  provider: auto (typesafe, then openrouter)
  scope: core
  typesafe key: set
  openrouter key: unset
  ```

- **`provider` or `scope`:** the plugin asks you in its own dialog. The current value comes first, and each choice carries a one-line consequence. The plugin writes only the value you pick.
- **`typesafe_key` or `openrouter_key`:** the plugin asks for the key in a text dialog. It names the provider and says when the new key replaces a set one. It stores the key in omp's credential store, as `/login` does, and returns `<provider> key: saved, checking`. Run the tool with no setting afterwards: the save counts only when it reports `key: set`.

The tool asks the person. It never takes a value or a key from the model. Nothing is written when:

- the dialog is dismissed or you answer with free text;
- the value is unchanged;
- omp has no UI.

A key dialog also saves nothing for an empty, blank or multi-line answer, an answer over 512 characters, or a Yes or No label. A failed key save returns `<provider> key not saved` and nothing else. The typed key shows in clear in the dialog.

The tool writes the global plugin settings only. It checks the value first, because omp does not. Its result text equals the commands' text for the same outcome.

## Set up

Ask omp to run the `model-router-setup` skill. It walks through the provider, the keys and the scope, lists each reason routing is off, and ends with a routing check you can skip. It writes only through the `model_router_config` tool, so you pick every value in a plugin dialog. [The skill](skills/model-router-setup/SKILL.md) holds the steps.

## Models

Each level takes its model from a slot, and each slot is an omp model role in `modelRoles`:

| Level | Slot | Role |
| --- | --- | --- |
| 0 | `small` | `smol` |
| 1 | `middle` | `middle` |
| 2 | `large` | `slow` |

The line names the role while it is set, such as `L1 @middle`, and the slot while it is not, such as `L1 middle model unset`.

omp ships no `middle` role. `modelRoles` accepts any role name, so a `middle` role you add is used. [omp model roles](../../docs/clients.md#omp-model-roles) has the sources.

You set a role in omp, not in the plugin. The Roles view of `/models` names `smol` Fast and `slow` Thinking, and its `+ New role…` row adds `middle`. The roles also live under `modelRoles` in omp's `config.yml`. A value is a model selector such as `provider/modelId`, and may end in a thinking level such as `:low`. [omp model roles](../../docs/clients.md#omp-model-roles) has the sources.

A role is set when `modelRoles` names it. A role that `modelRoles` does not name is unset, even when omp falls back to your `default` model or its built-in list. So levels 0 and 2 keep the agent's model until you set the `smol` and `slow` roles.

The plugin sets the model role you named and does not check that it runs.

An unset role gives no model. Its level keeps the agent's model, and the line names the slot. The plugin still sets the effort, except where [Efforts the plugin keeps](#efforts-the-plugin-keeps) says otherwise. [A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) has the rule the omp, OpenClaw and Hermes plugins share.

With the `task` role set, the plugin skips every `task` item with `task model role set`. Under `core` it then routes nothing.

What the line does not show:

- omp picks a child's retry fallback chain by the spawn's own model role, then `default`. The role the plugin returns does not change it, so `retry.fallbackChains.middle` does not reach the spawn. [omp model roles](../../docs/clients.md#omp-model-roles) has the source.

## Routing

| Level | Judgment the task needs | Model the spawn gets |
| --- | --- | --- |
| 0 | Lookup or transcription | `@smol:<effort>` |
| 1 | Bounded judgment | `@middle:<effort>` |
| 2 | Open judgment | `@slow:<effort>` |

A level whose role is unset gives the agent's own model patterns, each with `:<effort>`.

The plugin stays at level 1 unless an end is clearly more likely. Level 0 needs more than 1.19 times the probability of level 1, and level 2 needs more than 1.41 times. When both ends pass, the likelier end wins. [model-choice.md](../model-router/docs/model-choice.md#the-default-level) explains the factors.

At spawn, the plugin checks the item again and every batch-wide gate except the tool call timeout, as [Gate reasons](#gate-reasons) and [Item reasons](#item-reasons) list them. It also reads the effort rules again, now with the spawn's model patterns. omp gives the spawn hook its own fixed 30 s. A stored decision binds only to the agent it was made for. The plugin returns the model for the item's level, as [Effort](#effort) says. It returns nothing when:

- A gate or the item check fails at spawn time. For example, you added a model override after the batch.
- The spawn names a model role that differs from the agent's own role. The agent's own role is the first model it declares that starts with `@`, without the `@`.
- The agent declares no such role and the spawn carries any model role.
- No decision matches the spawn.
- The level has no set role, and the plugin keeps the effort.

In the first three cases the plugin also prints `model-router task <n>: skipped, <reason>`, a second line for the same item, as [The batch line](#the-batch-line) says. A spawn that matches no decision prints nothing.

## Effort

The work question picks the effort from the ladder in [Effort](../model-router/README.md#effort) of the Claude Code plugin. Level 0 takes the Haiku column, and levels 1 and 2 take the Sonnet column: `medium`, `high` or `xhigh` at level 0, and `low`, `medium` or `high` at levels 1 and 2. The plugin never sets `max`, `auto`, `off`, `minimal` or `inherit`.

The plugin returns the effort as omp's thinking suffix. With the level's role set, it returns the role with the suffix, such as `@slow:medium`. Without a set role, it returns the spawn's own model patterns, each with the suffix. The model then stays, and only the thinking level changes. omp clamps the level to the range the model supports. [omp thinking levels](../../docs/clients.md#omp-thinking-levels) has the sources and the runs.

The routed effort replaces a level that omp's bundled agents set, such as `auto` for `task`. Under `extended` it also replaces a `thinking-level` that a user or project agent sets, as it replaces the bundled ones.

### Efforts the plugin keeps

The first rule that matches decides. The plugin then sets the model alone, and the line shows the label in place of the effort.

1. The item carries `effort` and `task.enableEffort` is on, so omp applies it. The line shows `caller effort`. While the setting is off or unreadable, omp ignores the item's `effort`, and the plugin sets its own.
2. The set role for the routed level carries a thinking level, such as `modelRoles.smol: provider/model:low`, directly or through a role it names. The line shows `config effort`.
3. The routed level has no set role, and a model pattern of the spawn carries a thinking level. The line shows `config effort`. A set role replaces the patterns, so their thinking levels do not count.
4. `task.maxEffort` is below `low`, or holds a value omp does not define. The plugin then sets no level, and the child runs at omp's own level, which omp does not hold under that ceiling. The line shows `config effort`.
5. The routed level has no set role, and the spawn has no model patterns, so there is no model to put the thinking level on. The line shows `no model patterns`.
6. Otherwise the plugin sets the ladder effort, capped at `task.maxEffort`. omp does not apply that ceiling to a level the spawn hook sets, so the plugin applies it itself.

A level counts as carried when the text after the pattern's last colon is one omp reads as a level: a full name, `auto`, or a prefix of two letters or more that names one level only, such as `hi` or `med`. A colon that belongs to a model id, as in `:free` or `:8b`, carries no level.

With no set role and a kept effort, there is nothing to set. The plugin returns nothing.

## The batch line

The plugin prints one line per batch. The line starts with `model-router`. It goes to omp's notice area, or to standard error when omp has no UI. Each routed or skipped item adds one entry, numbered by its position in the call. Under `core`, an item for another agent adds none. The label stays `task <n>`. Agent names appear only inside skip reasons.

```text
model-router task 1: L0 @smol · high · p=0.91/0.84 | task 2: L1 @middle · medium · p=0.66/0.72 | task 3: L1 middle model unset · caller effort · p=0.62/0.70 | task 4: skipped, timeout
```

A routed entry reads `L<level> <role or slot state> · <effort or kept label> · p=<tier>/<work>`. The slot state is `<slot> model unset`, as [Models](#models) says. The probabilities belong to the chosen level and the chosen work index. [Efforts the plugin keeps](#efforts-the-plugin-keeps) lists the labels. [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says what else an entry holds and how it ends after a fallback.

omp's task view shows the same decision as the spawn's routing note, without the item number.

A skipped entry reads `task <n>: skipped, <reason>`. After both providers fail, the reason names each provider, as [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says. The item then runs as omp would run it without the plugin.

A routed item can still skip at spawn time, or get another line there. The batch knows no model patterns, and a setting or a role can change before the spawn. The plugin then prints one more line for that item alone, in the same format, after the batch line. For that item, the later line is the one that holds:

```text
model-router task 2: skipped, task model override set
model-router task 3: L2 large model unset · config effort · p=0.88/0.71
```

### Gate reasons

A closed gate skips every item the scope covers with the same reason. The gates run in this order:

1. `tool call timeout <n> ms leaves <m> ms to route`: omp's tool call timeout leaves less than 1 s to score, as [Limits and retries](#limits-and-retries) says. The plugin reads no key and sends nothing.
2. `settings unreadable`: the `provider` and `scope` settings or the plugins lockfile cannot be read. The plugin then cannot read `scope`, so it reports `task` items only.
3. `key unset`: no provider the `provider` setting allows has a key.
4. `settings unreadable`: omp's model roles, task model overrides or disabled agents cannot be read.

### Item reasons

After the gates pass, the plugin judges each item alone. The first reason that holds skips the item:

- `task model role set`: the `task` model role is set. omp's own routing decides. Only a `task` item gets this reason.
- `<agent> model override set`: `task.agentModelOverrides` has an entry for the agent, such as `task model override set`.
- `<agent> agent disabled`: `task.disabledAgents` lists the agent.
- `seance spawns without the hook omp gives plugins, so its model cannot change`: under `extended`, omp sends the bundled `seance` agent no `before_subagent_spawn` event (checked on omp 18.12.6 and 18.18.9), so the plugin cannot set its model.
- `the item sets its own model`: the item carries `model`. The plugin leaves the item's model alone and sends nothing for it. [omp per-call model](../../docs/clients.md#omp-per-call-model) has the source.
- `custom task agent`: under `core`, the `task` agent is not omp's bundled one, or omp's agent discovery fails.
- `<agent> agent discovery failed`: under `extended`, omp's agent discovery fails.
- `<agent> agent unknown`: under `extended`, omp's agent list does not hold the agent.
- `<agent> sets its own model`: under `extended`, the agent is not bundled and declares a model.

One reason appears only at spawn time:

- `<agent> is outside the core scope`: the decision was made under `extended`, and the scope is `core` when the agent spawns.

After the item check, a scored item can still skip:

- `timeout`: a first attempt got no answer in 2 s, or the scoring limit ran out: 8 s, or less under a short tool call timeout. When the limit runs out, items still waiting skip too.
- `HTTP <status>`: the provider returned an error status, after any retries. For example, `HTTP 401` means the provider refused the key.
- `network error`: the request could not connect, after any retries.
- `rejected request`: the SDK raised a TypeSafe error that is neither an HTTP error nor a network error.
- `bad reply`: the reply holds no valid score for the question.
- `failed`: any other error.

## Agent discovery

The plugin calls `pi.pi.discoverAgents`, a typed omp API at omp 18.12.6 and 18.18.9 that the docs prose does not name. For each agent it reads the name, the source, the declared models and the description.

- The source tells omp's bundled agents from a user, project or plugin agent with the same name.
- The declared models decide whether a non-bundled agent keeps its own model under `extended`, and what the agent's own role is.
- The description goes to Jev as the agent text (the request's `role` field). The bundled `task` agent sends a fixed text instead, as [What leaves the machine](#what-leaves-the-machine) says.

## Limits and retries

- One limit covers a batch from the moment omp calls the plugin: the reads before scoring, the scoring, retries and second providers included. It is 8 s, or the tool call timeout less 2 s when that is shorter. At most four items are scored at once.
- [Retries and the second provider](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-provider) gives the attempts at each provider.
- Inside one batch, a provider whose first attempt for an item failed and fell back is passed over: items that start later in that batch go straight to the other provider. The next batch tries both again.
- omp blocks the whole `task` call when a `tool_call` handler passes `extensionHandlers.toolCallTimeoutMs`, 30 s by default. The plugin reads the setting on every batch and keeps 2 s of it back as a margin. Under 3 s nothing is left to score: every item skips with `tool call timeout <n> ms leaves <m> ms to route`. Set it to 3000 ms or more, or keep the default.
- The plugin registers a `tool_call` handler, because only that hook gives a plugin the `task` input before omp runs it. While any extension has such a handler, omp starts no work early. `task.speculativeLaunch`, on by default, then no longer starts each subagent while the `task` call streams: the subagents start once the whole call has arrived. The experimental early reads of `tools.speculativeExecution.enabled` stop too. omp 18.12.6 and 18.18.9 both do this ([omp tool_call cost and timeout](../../docs/clients.md#omp-tool_call-cost-and-timeout)).

Repeated task names, or same-name items in parallel calls in sync mode, may run unrouted, never misrouted. The plugin matches a spawn to its decision by name or by child id. When two decisions share a name, neither matches.

The plugin prints no line when the call has no eligible item. A call with `task.batch` off has no `tasks` list. The plugin then routes nothing and prints no line.

## What the plugin reads

- omp's settings: `modelRoles`, `task.agentModelOverrides`, `task.disabledAgents`, `task.maxEffort`, `task.enableEffort` and `extensionHandlers.toolCallTimeoutMs`.
- The model patterns and the model role omp sends with each spawn, and the `effort` of each item.
- Its own `provider` and `scope` plugin settings, through omp's plugin settings loader, and the plugins lockfile that holds your global values. The project value may only narrow `provider` and may set `scope` both ways, as [Provider](#provider) and [Scope](#scope) say.
- Whether `modelRoles` names the `smol`, `middle` and `slow` roles.
- The agent list, with each agent's source, models and description, through `pi.pi.discoverAgents`.
- The items and the batch `context` of each `task` call.
- The key of each provider the `provider` setting allows, from omp's stored credential first and then `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`. The plugin reads no other environment variable.

## What the plugin writes

- The global `provider` or `scope` plugin setting, when you pick a value in its dialog or give a command.
- A key, in omp's credential store, when you type it in the plugin's key dialog.

The plugin writes nothing else and starts no program.

## What leaves the machine

For each routed item, the plugin sends an HTTPS POST to the first provider in the `provider` order:

- TypeSafe: `https://api.typesafe.ai/v1/systemone`, with your TypeSafe key as a bearer token.
- OpenRouter: `https://openrouter.ai/api/v1/systemone`, with your OpenRouter key as a bearer token.

The second provider gets a request only after the first fails, as [Limits and retries](#limits-and-retries) says. No environment variable changes either endpoint.

The request body holds:

- The item's task text and the batch `context`. Together they stay within 12,000 characters, and the context takes at most 3,000 of them.
- The item's name, masked like the task text and sent as the description.
- The agent text: the bundled `task` agent sends one fixed text, and every other agent sends its description, masked and cut to 500 characters. [PRIVACY.md](PRIVACY.md) has the details, and [model-choice.md](../model-router/docs/model-choice.md#the-role-of-the-default-agent) says why.
- The `jev-latest` alias and two fixed questions: one about judgment and one about work.

Before sending, the plugin condenses the task text. It replaces each fenced code block with a line count, and it masks token-shaped strings, as [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text) lists.

Under `extended`, the descriptions and task text of your user, project and plugin agents leave too. The request leaves when omp prepares the `task` call, before omp's approval gate runs. [PRIVACY.md](PRIVACY.md) has the full list, the project scope risks and the key handling.

A failed request leaves the call unchanged. The item skips with its reason, and omp runs it without a model from the plugin.

## Turn it off

[Turn off and uninstall](../../README.md#turn-off-and-uninstall) in the repository README gives the steps.

Removing the key of every provider the `provider` setting allows also stops routing. Every batch then reports `key unset`.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
