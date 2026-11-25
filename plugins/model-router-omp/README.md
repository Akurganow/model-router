# model-router for Oh My Pi

An [Oh My Pi](https://github.com/can1357/oh-my-pi) (omp) plugin that picks a model role and an effort for the subagents it routes. It asks a decision model, on the provider's own API or through OpenRouter, how much judgment the task needs and how much work it takes. It then gives the agent the `smol`, `midl` or `slow` role for that spawn, and a thinking level from a fixed ladder.

## What it does

- It scores each eligible batch item through the decision model of the `provider` setting: [Jev](https://docs.typesafe.ai) from TypeSafe, OpenAI's, Google's or Perplexity's. One request asks two questions: how much judgment the task needs, and how much work it takes.
- At spawn, it returns `@smol` for level 0, `@midl` for level 1 and `@slow` for level 2. Each role carries the effort as a thinking suffix, such as `@smol:high`. Without a set role, the spawn keeps the agent's model and gets the effort alone, as [Models](#models) says.
- The [`scope` setting](#scope) picks the agents. Under `core`, the default, only omp's bundled `task` agent is routed. Under `extended`, every agent whose model you did not set is routed.
- It never overrides a model you set. It keeps the item's own `effort` and a thinking level on the role it picks. Without a set role, it keeps a thinking level on the spawn's model patterns. [Efforts the plugin keeps](#efforts-the-plugin-keeps) lists the rules, and [Effort](#effort) names the exception: a level that an agent sets gives way to the ladder. It never changes the tool input.
- The routed effort replaces the level of a bundled agent: `auto` for `task`, where omp picks the effort for each prompt, and `medium` for `sonic`.
- The plugin changes a setting only when you pick a value in its dialog, give it a command, or ask the agent to write `models`. [Change the options](#change-the-options) lists the three.
- An item is eligible when its `task` text is not empty. Under `core`, its `agent` must also be absent or `task`.

## Install

The install commands are under [Oh My Pi in the root README](https://github.com/Akurganow/model-router/blob/main/README.md#oh-my-pi).

Install [Oh My Pi v18.12.6 or later](https://github.com/can1357/oh-my-pi).

The catalog is `.omp-plugin/marketplace.json` at the repository root. It lists this plugin only.

omp also installs the plugin from npm, as `@akurganow/model-router`. The package serves omp and [OpenClaw](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md):

```bash
omp plugin install @akurganow/model-router
```

The git catalogue route stays. It installs `model-router-omp`. omp keys the plugin's settings by the package name it installed. The git route uses `model-router-omp`, and the npm route uses `@akurganow/model-router`. The plugin reads and writes its settings under the name it was installed with. Existing git installs keep their settings.

Installing both the git plugin and the npm package is not advised. omp keeps their settings under different names, so each copy needs its own `provider`, `gateway` and `scope` ([omp install names](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-install-names)). With both installed, change each in its own entry of `/settings` → Plugins.

## Set up

After the install commands:

1. Restart omp, because omp loads extension modules at startup.
2. Run `/login typesafe`, `/login openrouter` or both in omp to store your keys. For OpenAI, Google or Perplexity, set the variable that [Keys](#keys) names.
3. Ask omp to run the `model-router-setup` skill. It finds what is already set, tells you what is missing and changes a setting only when you agree. It asks the provider, the gateway and the scope with buttons and writes your choices itself. It also helps you set the `smol`, `midl` and `slow` roles. It ends with a routing check you can skip. [The skill](skills/model-router-setup/SKILL.md) holds the facts it works from.
4. Check the routing, as [Verify](#verify) says.

To change the provider, the gateway or the scope later, open `/settings` → Plugins, or run `/model-router:provider`, `/model-router:gateway` or `/model-router:scope`.

## Verify

Give omp any job that makes it spawn a `task` subagent. The plugin prints one line per batch. [The batch line](#the-batch-line) shows an example.

An entry such as `L1 middle model unset` is no error: the level ran on the agent's model, as [the rule of an unset slot](#models) says. [Gate reasons](#gate-reasons) and [Item reasons](#item-reasons) explain each `skipped` entry. No line prints when `task.batch` is off or the batch has no eligible item.

## Keys

For each key holder the [`provider` and `gateway` settings](#provider-and-gateway) allow, the plugin checks two places, in this order: omp's credential for the holder, then the holder's environment variable.

omp has no setting for a key. The plugin asks omp's credential lookup by the id `typesafe`, `openai`, `google`, `perplexity` or `openrouter`, and sends the credential omp returns for the id. [omp model roles](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-model-roles) has what omp does with such an id.

| Key holder | omp credential id | Variable |
| --- | --- | --- |
| TypeSafe | `typesafe`, which `/login typesafe` stores | `TYPESAFE_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Google | `google` | `GEMINI_API_KEY` |
| Perplexity | `perplexity` | `PERPLEXITY_API_KEY` |
| OpenRouter | `openrouter`, which `/login openrouter` stores | `OPENROUTER_API_KEY` |

[Where to get a key](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys) also says when a key counts as set and which Google variable the plugins do not read.

Add a key in one of two ways:

- Store the credential omp holds for the id: run `/login typesafe` or `/login openrouter`, or run `omp login typesafe` or `omp login openrouter` outside a session. For `openai`, `google` and `perplexity`, store it the way omp stores a credential for that provider.
- Set the environment variable where omp reads it. The variable is visible to every process omp starts. [What the plugin stores](PRIVACY.md#what-the-plugin-stores) says more.

To score with Perplexity, give an API key, as a credential or as the variable.
A stored Perplexity login takes its place: omp's lookup for `perplexity` then returns the login's session token, which `api.perplexity.ai` rejects with HTTP 401.

## Provider and gateway

The `provider` and `gateway` settings decide who receives each task. By default, `provider` is `typesafe` and `gateway` is `direct`. [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) lists the other values, says which of them cost more and tells where each sends the task. Who receives a batch item under each value: [PRIVACY.md](PRIVACY.md).

[The model of each request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request) also says when the `jev-latest` alias moves.

Switch them with `/model-router:provider` or `/model-router:gateway`, or in omp's `/settings` → Plugins, under the name omp installed it with: `model-router-omp` from the git catalogue, `@akurganow/model-router` from npm. The plugin reads both settings on every batch, so a change reaches the next batch with no reload.

[A setting that is not valid](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) says what a value outside a setting's list does, and lists the retired values of `provider`. omp passes such a stored value on as stored, as [omp manifest and settings](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-manifest-and-settings) says.

### What a project can change

A project's plugin settings never change the provider: the plugin ignores a valid project `provider` value. A project may only narrow `gateway`, from a global `auto` or `openrouter-first` to `direct` or `openrouter`. It drops one path and never adds one. The plugin ignores any other valid project `gateway` and uses the global one.

omp merges a project's override file, `<project>/.omp/plugin-overrides.json`, into the settings it hands the plugin. The plugin never opens that file. A project value outside its setting's list is not valid. So a project file that still sets `provider` to `auto`, `openrouter-first` or `openrouter` skips every task of that project with `provider not valid: run setup`. Delete a `provider` of `auto` or `openrouter-first`. Replace `provider: openrouter` with `gateway: openrouter`, which narrows only a global `auto` or `openrouter-first`.

Earlier versions let a project narrow with `provider`. A project's `provider: typesafe` kept OpenRouter out. It narrows nothing now, and the plugin prints no line about it. State it as `gateway: direct`. Check every project that has an override file.

### The scoring model of each provider

The `models` setting names the scoring model of each provider. [The `models` setting](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-models-setting) lists its forms, its defaults, the OpenRouter names, when a value is not valid and the lines of the config tool.

The plugin reads `models` from your global settings only. A project's value never applies.

The config tool takes a `models` string and writes the global setting at once, at your request. A text that is not valid is refused with `models unchanged: not valid: <entry>`. You can also set it in `/settings` → Plugins.

A `models` value that is not valid stops routing, as [the rule for a value that is not valid](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) says. An item the scope covers skips with `models not valid: run setup`, unless an earlier gate of [the gate list](#gate-reasons) skips it first.

The plugin writes no setting when it loads. The setup skill writes the migrated shape when you agree.

## Scope

The `scope` plugin setting picks which agents the plugin routes:

| Value | Agents routed |
| --- | --- |
| `core` (default) | The bundled `task` agent only |
| `extended` | Every agent whose model you did not set, bundled agents included |

A value outside the two is not valid, as [the rule for a value outside the list](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) says.

Under `extended`, the plugin judges each batch item on its own. Bundled agents route: `task`, `scout`, `sonic`, `reviewer` and `security-reviewer`, on omp 18.12.6 and 18.18.9. A bundled agent's default model is not your choice. The bundled `seance` agent is the exception: omp gives it no spawn hook, so the plugin skips it.

The plugin skips an item, with the reason in [the line of the batch](#the-batch-line), when any of these holds:

- The item sets its own `model`.
- You set the agent's model: `task.agentModelOverrides` has an entry for it, or the `task` model role is set and the agent is `task`.
- `task.disabledAgents` lists the agent.
- The agent is not bundled and declares its own model.
- The agent is not in omp's agent list.
- omp's agent discovery failed.

Every routed agent gets the roles that [the role table](#models) lists, each while omp has a model for it: `@smol` at level 0, `@midl` at level 1 and `@slow` at level 2. A set role replaces a bundled agent's own role at every level. Each level also sets the effort, as [the effort ladder](#effort) says.

A project's plugin settings may set `scope` to either value. A project value overrides your global one in both directions. `gateway` differs: a project may only narrow it. [The extended scope](PRIVACY.md#the-extended-scope) says what a project that sets `extended` changes.

## Change the options

Three commands show or change an option:

- `/model-router:provider [typesafe|openai|google|perplexity]`
- `/model-router:gateway [direct|auto|openrouter-first|openrouter]`
- `/model-router:scope [core|extended]`

[The option commands](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-option-commands) say what a command prints. A command with a valid value writes it to your global plugin settings. When a project value wins over the new global one, the output says `A project value for <setting> overrides it.` Without a UI, a command prints to standard error.

omp keys the plugin's settings by the name in the installed `package.json`. When the plugin cannot read that name, a change prints `<setting> unchanged: settings unreadable` and writes nothing, while showing a value still works.

The `model_router_config` tool takes two optional inputs: `setting`, which is `provider`, `gateway` or `scope`, and `models`. The tool loads as essential and omp treats it as a write tool.

- **No input:** the tool returns the `provider` line, the `gateway` line, the `scope` line, the `models` lines and the key lines. [The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool) shows a sample output. It also says what the key lines show and what the tool prints while a setting is not valid.
- **`provider`, `gateway` or `scope`:** the plugin asks you in its own dialog. The current value comes first while it is valid, and each choice carries a one-line consequence. The plugin writes only the value you pick.
- **`models`, a string:** the plugin writes the text to the global setting at once, with no dialog, at your request. It checks the text first.

For `provider`, `gateway` and `scope`, the tool asks the person. It never takes a value from the model for them. Nothing is written when:

- the dialog is dismissed or you answer with free text;
- your global setting already holds the value;
- omp has no UI.

The tool writes the global plugin settings only. It checks the value first, because omp does not. Its result text equals the commands' text for the same outcome.

## Models

Each level takes its model from a slot, and each slot is an omp model role:

| Level | Slot | Role |
| --- | --- | --- |
| 0 | `small` | `smol` |
| 1 | `middle` | `midl` |
| 2 | `large` | `slow` |

The line names the role while omp has a model for it, such as `L1 @midl`, and the slot while it has none, such as `L1 middle model unset`.

omp ships the `smol` and `slow` roles and finds a model for each with no setting: your `default` model when you set one, and otherwise a model from its built-in list. So with a `default` model and no `smol` or `slow` role, levels 0 and 2 run on your `default` model. Set the roles to give each level its own model. omp ships no `midl` role. `modelRoles` accepts any role name, so a `midl` role you add is used. [omp default roles](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-model-roles) has the sources.

You set a role in omp, not in the plugin. The Roles view of `/models` names `smol` Fast and `slow` Thinking, and its `+ New role…` row adds `midl`. The roles also live under `modelRoles` in omp's `config.yml`. A value is a model selector such as `provider/modelId`, and may end in a thinking level such as `:low`.

The plugin asks omp whether it has a model for the level's role. When omp has one, the role is set and the spawn gets it. When omp has none, the role is unset: the level keeps the agent's model, and the line names the slot. The plugin still sets the effort, except where [a rule for a kept effort](#efforts-the-plugin-keeps) says otherwise. [A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) has the rule the omp, OpenClaw and Hermes plugins share.

The plugin does not check that a model runs. omp answers from the models it can use, so a role whose model omp cannot use reads as a role with no model.

With the `task` role set, the plugin skips every `task` item with `task model role set`. Under `core` it then routes nothing.

What the line does not show:

- omp picks a child's retry fallback chain by the spawn's own model role, then `default`. The role the plugin returns does not change it, so `retry.fallbackChains.midl` does not reach the spawn. [omp retry fallback chains](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-model-roles) has the source.

## Routing

| Level | Judgment the task needs | Model the spawn gets |
| --- | --- | --- |
| 0 | Lookup or transcription | `@smol:<effort>` |
| 1 | Bounded judgment | `@midl:<effort>` |
| 2 | Open judgment | `@slow:<effort>` |

A level whose role is unset gives the agent's own model patterns, each with `:<effort>`.

The plugin stays at level 1 unless an end is clearly more likely. Level 0 needs more than 1.19 times the probability of level 1, and level 2 needs more than 1.41 times. When both ends pass, the likelier end wins. [model-choice.md](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/docs/model-choice.md#the-default-level) explains the factors.

At spawn, the plugin checks the item again and every batch-wide gate except the tool call timeout, as [the batch-wide gates](#gate-reasons) and [the item checks](#item-reasons) list them. It also reads the effort rules again, now with the spawn's model patterns. omp gives the spawn hook its own fixed 30 s. A stored decision binds only to the agent it was made for. The plugin returns the model for the item's level, as [the effort section](#effort) says. It returns nothing when:

- A gate or the item check fails at spawn time. For example, you added a model override after the batch.
- The spawn names a model role that differs from the agent's own role. The agent's own role is the first model it declares that starts with `@`, without the `@`.
- The agent declares no such role and the spawn carries any model role.
- No decision matches the spawn.
- The level has no set role, and the plugin keeps the effort.

In the first three cases the plugin also prints `model-router task <n>: skipped, <reason>`, a second line for the same item, as [the format of the second line](#the-batch-line) says. A spawn that matches no decision prints nothing.

## Effort

The work question picks the effort from the ladder in [Effort of the Claude Code plugin](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/README.md#effort). Level 0 takes the Haiku column, and levels 1 and 2 take the Sonnet column: `medium`, `high` or `xhigh` at level 0, and `low`, `medium` or `high` at levels 1 and 2. The plugin never sets `max`, `auto`, `off`, `minimal` or `inherit`.

The plugin returns the effort as omp's thinking suffix. With the level's role set, it returns the role with the suffix, such as `@slow:medium`. Without a set role, it returns the spawn's own model patterns, each with the suffix. The model then stays, and only the thinking level changes. omp clamps the level to the range the model supports. [omp thinking levels](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-thinking-levels) has the sources and the runs.

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

## Which items are routed

The plugin checks the gates of the batch first, then each item alone.

### Gate reasons

A closed gate skips every item the scope covers with the same reason. The gates run in this order:

1. `tool call timeout <n> ms leaves <m> ms to route`: omp's tool call timeout leaves less than 1 s to score, as [Limits](#limits) says. The plugin reads no key and sends nothing.
2. `settings unreadable`: the `provider`, `gateway` and `scope` settings or the plugins lockfile cannot be read. The plugin then cannot read `scope`, so it reports `task` items only.
3. `<setting> not valid: run setup`: a stored `provider`, `gateway` or `scope` holds a value outside its list. The reason covers the items of the stored `scope`, or `task` items only when `scope` itself is not valid. [The rule for a stored value](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) says which setting the reason names.
4. `key unset`: no path the `gateway` setting allows has a key.
5. `settings unreadable`: omp's model roles, task model overrides or disabled agents cannot be read.

### Item reasons

After the gates pass, the plugin judges each item alone. The first reason that holds skips the item:

- `task model role set`: the `task` model role is set. omp's own routing decides. Only a `task` item gets this reason.
- `<agent> model override set`: `task.agentModelOverrides` has an entry for the agent, such as `task model override set`.
- `<agent> agent disabled`: `task.disabledAgents` lists the agent.
- `seance spawns without the hook omp gives plugins, so its model cannot change`: under `extended`, omp sends the bundled `seance` agent no `before_subagent_spawn` event (checked on omp 18.12.6 and 18.18.9), so the plugin cannot set its model.
- `the item sets its own model`: the item carries `model`. The plugin leaves the item's model alone and sends nothing for it. [omp per-call model](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-per-call-model) has the source.
- `custom task agent`: under `core`, the `task` agent is not omp's bundled one, or omp's agent discovery fails.
- `<agent> agent discovery failed`: under `extended`, omp's agent discovery fails.
- `<agent> agent unknown`: under `extended`, omp's agent list does not hold the agent.
- `<agent> sets its own model`: under `extended`, the agent is not bundled and declares a model.

One reason appears only at spawn time:

- `<agent> is outside the core scope`: the decision was made under `extended`, and the scope is `core` when the agent spawns.

After the item check, a scored item can still skip:

- `timeout`: the first of two attempts got no answer in 5 s, or the scoring limit ran out: 10 s, or less under a short tool call timeout. When the limit runs out, items still waiting skip too.
- `HTTP <status>`, `network error`, `bad reply` or `failed`: the attempt gave no score. [A failed attempt](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-failed-attempt) explains each. [The fallback rule of the line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says how the line names two of them.

### Agent discovery

The plugin calls `pi.pi.discoverAgents`, a typed omp API at omp 18.12.6 and 18.18.9 that the docs prose does not name. For each agent it reads the name, the source, the declared models and the description.

- The source tells omp's bundled agents from a user, project or plugin agent with the same name.
- The declared models decide whether a non-bundled agent keeps its own model under `extended`, and what the agent's own role is.
- The description goes to the scoring model as the agent text (the request's `role` field). The bundled `task` agent sends a fixed text instead, as [What leaves the machine](#what-leaves-the-machine) says.

## The batch line

The plugin prints one line per batch. The line starts with `model-router`. It goes to omp's notice area, or to standard error when omp has no UI. Each routed or skipped item adds one entry, numbered by its position in the call. Under `core`, an item for another agent adds none. The label stays `task <n>`. Agent names appear only inside skip reasons.

```text
model-router task 1: L0 @smol · high · p=0.91/0.84 · typesafe jev-1.14.0 · 812/9 tok | task 2: L1 @midl · medium · p=0.66/0.72 · typesafe jev-1.14.0 · 734/9 tok | task 3: L1 middle model unset · caller effort · p=0.62/0.70 · typesafe jev-1.14.0 · 640/9 tok | task 4: skipped, timeout
```

A routed entry reads `L<level> <role or slot state> · <effort or kept label> · p=<tier>/<work>`. The slot state is `<slot> model unset`, as [the slot table](#models) says. The probabilities belong to the chosen level and the chosen work index. [The rules for kept efforts](#efforts-the-plugin-keeps) list the labels. [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says what else an entry holds and how it ends after a fallback.

omp's task view shows the same decision as the spawn's routing note, without the item number.

A skipped entry reads `task <n>: skipped, <reason>`. The item then runs as omp would run it without the plugin.

A routed item can still skip at spawn time, or get another line there. The batch knows no model patterns, and a setting or a role can change before the spawn. The plugin then prints one more line for that item alone, in the same format, after the batch line. For that item, the later line is the one that holds:

```text
model-router task 2: skipped, task model override set
model-router task 3: L2 large model unset · config effort · p=0.88/0.71 · typesafe jev-1.14.0 · 905/9 tok
```

## Limits

- One limit covers a batch from the moment omp calls the plugin: the reads before scoring, the scoring, retries and second attempts included. It is 10 s, or the tool call timeout less 2 s when that is shorter. At most four items are scored at once.
- [Retries and the second attempt](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-attempt) gives the attempts on each path.
- Inside one batch, a path whose first attempt for an item failed and fell back is passed over: items that start later in that batch go straight to the other path. The next batch tries both again.
- omp blocks the whole `task` call when a `tool_call` handler passes `extensionHandlers.toolCallTimeoutMs`, 30 s by default. The plugin reads the setting on every batch and keeps 2 s of it back as a margin. Under 3 s nothing is left to score: every item skips with `tool call timeout <n> ms leaves <m> ms to route`. Set it to 3000 ms or more, or keep the default.
- The plugin registers a `tool_call` handler, because only that hook gives a plugin the `task` input before omp runs it. While any extension has such a handler, omp starts no work early. `task.speculativeLaunch`, on by default, then no longer starts each subagent while the `task` call streams: the subagents start once the whole call has arrived. The experimental early reads of `tools.speculativeExecution.enabled` stop too. omp 18.12.6 and 18.18.9 both do this ([omp tool_call cost and timeout](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-tool_call-cost-and-timeout)).

Repeated task names, or same-name items in parallel calls in sync mode, may run unrouted, never misrouted. The plugin matches a spawn to its decision by name or by child id. When two decisions share a name, neither matches.

The plugin prints no line when the call has no eligible item. A call with `task.batch` off has no `tasks` list. The plugin then routes nothing and prints no line.

## Update

Run these lines in a shell for the git catalogue route:

```sh
omp plugin marketplace update
omp plugin upgrade model-router@model-router
```

For the npm route, run this line:

```sh
omp plugin upgrade @akurganow/model-router
```

Then restart omp.

## Turn it off

To turn routing off, run this line in a shell for the git catalogue route:

```sh
omp plugin disable model-router@model-router
```

For the npm route, run this line:

```sh
omp plugin disable @akurganow/model-router
```

Then restart omp. The plugin sends nothing while it is disabled. To remove the git catalogue route's plugin, run this line:

```sh
omp plugin uninstall model-router@model-router
```

To remove the npm route's plugin, run this line:

```sh
omp plugin uninstall @akurganow/model-router
```

[The facts on omp's plugin commands](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-install-and-update) have the sources.

Removing the key of every path the `gateway` setting allows also stops routing. Every batch then reports `key unset`.

## What leaves the machine

For each routed item, the plugin sends an HTTPS POST to the first path of the `gateway` setting that has a key:

- The provider's own API, on the direct path: `api.typesafe.ai`, `api.openai.com`, `generativelanguage.googleapis.com` or `api.perplexity.ai`, with the key of the provider you chose.
- OpenRouter, on the gateway path: `openrouter.ai`, with your OpenRouter key.

[The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request) lists the address and the model of each path and the header that carries the key. The second attempt sends a request only after the first fails, as [the batch limit](#limits) says. No environment variable changes an endpoint.

The request body holds:

- The item's task text and the batch `context`. Together they stay within 12,000 characters, and the context takes at most 3,000 of them.
- The item's name, masked like the task text and sent as the description.
- The agent text: the bundled `task` agent sends one fixed text, and every other agent sends its description, masked and cut to 500 characters. [The privacy policy](PRIVACY.md) has the details, and [the role of the default agent](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/docs/model-choice.md#the-role-of-the-default-agent) says why.
- The model of the endpoint and two fixed questions: one about judgment and one about work.

Before sending, the plugin condenses the task text. It replaces each fenced code block with a line count, and it masks token-shaped strings, as [The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text) lists.

Under `extended`, the descriptions and task text of your user, project and plugin agents leave too. The request leaves when omp prepares the `task` call, before omp's approval gate runs. [The rest of the privacy policy](PRIVACY.md) has the full list, the project scope risks and the key handling.

A failed request leaves the call unchanged. The item skips with its reason, and omp runs it without a model from the plugin.

### What the plugin reads and writes

The plugin reads:

- omp's settings: `modelRoles`, `task.agentModelOverrides`, `task.disabledAgents`, `task.maxEffort`, `task.enableEffort` and `extensionHandlers.toolCallTimeoutMs`.
- The model patterns and the model role omp sends with each spawn, and the `effort` of each item.
- Its own `provider`, `gateway` and `scope` plugin settings, through omp's plugin settings loader, and the plugins lockfile that holds your global values. A project value may only narrow `gateway`, and may set `scope` both ways, as [Provider and gateway](#provider-and-gateway) and [Scope](#scope) say.
- Whether omp has a model for the `smol`, `midl` and `slow` roles.
- The agent list, with each agent's source, models and description, through `pi.pi.discoverAgents`.
- The items and the batch `context` of each `task` call.
- The key of each holder the `provider` and `gateway` settings allow, from the places [the key table](#keys) names. The plugin reads no other environment variable.

The plugin writes:

- The global `provider`, `gateway` or `scope` plugin setting, when you pick a value in its dialog or give a command.

The plugin writes nothing else and starts no program.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
