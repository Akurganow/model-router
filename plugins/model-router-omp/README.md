# model-router for Oh My Pi

An [Oh My Pi](https://github.com/can1357/oh-my-pi) (omp) plugin that picks a model role for each subagent. It asks [Jev](https://docs.typesafe.ai), on TypeSafe or OpenRouter, how much judgment the task needs. It then gives the agent the `smol` or `slow` role for that spawn.

## What it does

- It scores each eligible batch item through Jev, using the `jev-latest` alias. Jev answers one question: how much judgment the task needs. Jev does not score effort.
- At spawn, it returns `@smol` for level 0 and `@slow` for level 2. Level 1 changes nothing.
- The [`scope` setting](#scope) picks the agents. Under `core`, the default, only omp's bundled `task` agent is routed. Under `extended`, every agent whose model you did not set is routed.
- It never overrides a model you set. It never changes the tool input.
- The plugin sets no effort. The bundled `task` agent runs with thinking set to `auto`, so omp picks the effort for each prompt.
- The plugin changes a setting only when you pick a value in its dialog or give it a command. [Change the options](#change-the-options) lists both.
- An item is eligible when its `task` text is not empty. Under `core`, its `agent` must also be absent or `task`.

## Install

The [repository README](../../README.md#oh-my-pi) gives the install steps.

The catalog is `.omp-plugin/marketplace.json` at the repository root. It lists this plugin only.

## Key

The plugin reads a key only for a provider the [`provider` setting](#provider) allows. For each one it checks two places, in this order:

- TypeSafe: omp's stored `typesafe` credential, which `/login typesafe` stores, then the `TYPESAFE_API_KEY` environment variable.
- OpenRouter: omp's stored `openrouter` credential, then the `OPENROUTER_API_KEY` environment variable.

A key counts as set when either place holds a non-empty value. Get a key from [TypeSafe](https://console.typesafe.ai/keys) or from [OpenRouter](https://openrouter.ai). Each key goes only to its own provider. With no key for any allowed provider, every batch reports `key unset`.

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

With `auto` or `openrouter-first` and only one key, that key's provider judges alone. A value outside the four counts as `typesafe`. [PRIVACY.md](PRIVACY.md) says which company receives the task under each value.

Switch it with `/model-router:provider`, or in omp's `/settings` → Plugins, under `model-router-omp`. The plugin reads the setting on every batch, so a change reaches the next batch with no reload.

A project's plugin settings may only narrow your global `provider` value: from `auto` or `openrouter-first` to `typesafe` or `openrouter`. The plugin ignores any other project value and uses the global one.

Both providers get the `jev-latest` alias. OpenRouter routes it to its own alias for the newest Jev release.

## Scope

The `scope` plugin setting picks which agents the plugin routes:

| Value | Agents routed |
| --- | --- |
| `core` (default) | The bundled `task` agent only |
| `extended` | Every agent whose model you did not set, bundled agents included |

A value outside the two counts as `core`.

Under `extended`, the plugin judges each batch item on its own. Bundled agents route: `task`, `scout`, `sonic`, `reviewer` and `security-reviewer`. A bundled agent's default model is not your choice. The bundled `seance` agent is the exception: omp gives it no spawn hook, so the plugin skips it.

The plugin skips an item, with the reason in the [batch line](#the-batch-line), when any of these holds:

- You set the agent's model: `task.agentModelOverrides` has an entry for it, or the `task` model role is set and the agent is `task`.
- `task.disabledAgents` lists the agent.
- The agent is not bundled and declares its own model.
- The agent is not in omp's agent list.
- omp's agent discovery failed.

A routed agent gets the same levels as before: 0 gives `@smol`, 1 leaves the agent's own model, and 2 gives `@slow`.

A project's plugin settings may set `scope` to either value. A project value overrides your global one in both directions. `provider` differs: a project may only narrow it. [PRIVACY.md](PRIVACY.md#the-extended-scope) says what a project that sets `extended` changes.

## Change the options

Two commands show or change an option:

- `/model-router:provider [auto|openrouter-first|typesafe|openrouter]`
- `/model-router:scope [core|extended]`

A bare command prints the current value. A command with a valid value writes it to your global plugin settings and prints the new value. An invalid value lists the allowed ones. A refused or failed write prints `<setting> unchanged: <reason>`. When a project value wins over the new global one, the output says `A project value for <setting> overrides it.` Without a UI, a command prints to standard error.

The `model_router_config` tool takes one optional input, `setting`: `provider`, `scope`, `typesafe_key` or `openrouter_key`. The tool loads as essential and omp treats it as a write tool.

- **No setting:** the tool returns the `provider` line, the `scope` line, and `<provider> key: set` or `<provider> key: unset` for each provider the `provider` value allows. It never returns a key, its length or any part of it.

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

## Routing

| Level | Judgment the task needs | Role given to the spawn |
| --- | --- | --- |
| 0 | Lookup or transcription | `@smol` |
| 1 | Bounded judgment | none, no change |
| 2 | Open judgment | `@slow` |

The plugin picks the level with the highest probability. A higher level within 0.10 of the best probability wins.

At spawn, the plugin checks the batch-wide gates and the item again, as [Gate reasons](#gate-reasons) and [Item reasons](#item-reasons) list them. A stored decision binds only to the agent it was made for. The plugin returns the role for the item's level. It returns nothing when:

- A gate or the item check fails at spawn time. For example, you added a model override after the batch.
- The spawn names a model role that differs from the agent's own role. The agent's own role is the first model it declares that starts with `@`, without the `@`.
- The agent declares no such role and the spawn carries any model role.
- The role does not resolve.
- No decision matches the spawn.

## The batch line

The plugin prints one line per batch. The line starts with `model-router`. It goes to omp's notice area, or to standard error when omp has no UI. Each routed or skipped item adds one entry, numbered by its position in the call. Under `core`, an item for another agent adds none. The label stays `task <n>`. Agent names appear only inside skip reasons.

```text
model-router task 1: L0 @smol · p=0.91 | task 2: L1 no change · p=0.62 | task 3: skipped, timeout
```

A routed entry reads `L<level> <role or no change> · p=<probability>`. The probability belongs to the chosen level. When the reply carries them, the entry also names the Jev model and the token counts. After a fallback, the entry ends with the provider that answered and why the first one failed, for example ` · via openrouter (typesafe HTTP 503)`.

omp's task view shows the same decision as the spawn's routing note, without the item number.

A skipped entry reads `task <n>: skipped, <reason>`. After two attempts, the reason names each provider with its own reason, in attempt order, for example `skipped, typesafe HTTP 503, openrouter timeout`. The item then runs as omp would run it without the plugin.

### Gate reasons

A closed gate skips every item the scope covers with the same reason. The gates run in this order:

1. `settings unreadable`: the `provider` and `scope` settings or the plugins lockfile cannot be read. The plugin then cannot read `scope`, so it reports `task` items only.
2. `key unset`: no provider the `provider` setting allows has a key.
3. `settings unreadable`: omp's model roles, task model overrides or disabled agents cannot be read.

### Item reasons

After the gates pass, the plugin judges each item alone. The first reason that holds skips the item:

- `task model role set`: the `task` model role is set. omp's own routing decides. Only a `task` item gets this reason.
- `<agent> model override set`: `task.agentModelOverrides` has an entry for the agent, such as `task model override set`.
- `<agent> agent disabled`: `task.disabledAgents` lists the agent.
- `seance spawns without the hook omp gives plugins, so its model cannot change`: under `extended`, omp sends the bundled `seance` agent no `before_subagent_spawn` event (checked on omp 18.12.6), so the plugin cannot set its model.
- `custom task agent`: under `core`, the `task` agent is not omp's bundled one, or omp's agent discovery fails.
- `<agent> agent discovery failed`: under `extended`, omp's agent discovery fails.
- `<agent> agent unknown`: under `extended`, omp's agent list does not hold the agent.
- `<agent> sets its own model`: under `extended`, the agent is not bundled and declares a model.
- `no @smol or @slow model`: neither role resolves. Every item that passed the checks above gets this reason.

After the item check, a scored item can still skip:

- `timeout`: a first attempt got no answer in 2 s, or the 8 s scoring limit ran out. When the limit runs out, items still waiting skip too.
- `HTTP <status>`: the provider returned an error status, after any retries. For example, `HTTP 401` means the provider refused the key.
- `network error`: the request could not connect, after any retries.
- `rejected request`: the SDK raised a TypeSafe error that is neither an HTTP error nor a network error.
- `bad reply`: the reply holds no valid score for the question.
- `failed`: any other error.

## Agent discovery

The plugin calls `pi.pi.discoverAgents`, a typed omp API that the docs prose does not name. For each agent it reads the name, the source, the declared models and the description.

- The source tells omp's bundled agents from a user, project or plugin agent with the same name.
- The declared models decide whether a non-bundled agent keeps its own model under `extended`, and what the agent's own role is.
- The description goes to Jev as the `role`, as [What leaves the machine](#what-leaves-the-machine) says.

## Limits and retries

- One fixed limit of 8 s covers the scoring of a batch, retries and second providers included. At most four items are scored at once.
- With one provider, the SDK retries HTTP 408, 429 and 5xx responses, connection errors and timeouts. It makes up to three attempts in all.
- With two providers, an item's first attempt gets 2 s and no retries. The plugin moves to the second provider after a connection error, a timeout, or HTTP 401, 402, 403, 404, 408, 429 or 5xx. It never moves after HTTP 400 or 422, the 8 s limit or a bad reply. The second provider gets the rest of the limit and the SDK's retries. An item therefore sends at most four requests.
- Inside one batch, a provider whose first attempt for an item failed and fell back is passed over: items that start later in that batch go straight to the other provider. The next batch tries both again.
- The SDK honours a `Retry-After` of up to 60 s. The batch limit still stops the wait at 8 s. A 429 with a long `Retry-After` can hold a batch up to 8 s.
- Keep `extensionHandlers.toolCallTimeoutMs` at its default of 30 s. omp fails closed when a `tool_call` handler passes that timeout. A value below 8 s can block a task.

Repeated task names, or same-name items in parallel calls in sync mode, may run unrouted, never misrouted. The plugin matches a spawn to its decision by name or by child id. When two decisions share a name, neither matches.

The plugin prints no line when the call has no eligible item. A call with `task.batch` off has no `tasks` list. The plugin then routes nothing and prints no line.

## What the plugin reads

- omp's settings: `modelRoles`, `task.agentModelOverrides` and `task.disabledAgents`.
- Its own `provider` and `scope` plugin settings, through omp's plugin settings loader, and the plugins lockfile that holds your global values. The project value may only narrow `provider` and may set `scope` both ways, as [Provider](#provider) and [Scope](#scope) say.
- Whether `@smol` and `@slow` resolve, through omp's model resolution.
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
- The item's name, sent as the description.
- The role: the description of the item's agent, as omp discovers it. The plugin masks secrets by shape, collapses whitespace and cuts it to 500 characters. A missing or blank description sends `An agent with no description.`
- The `jev-latest` alias and one fixed question about judgment.

Before sending, the plugin condenses the task text. It replaces each fenced code block with a line count. It masks Bearer tokens, `sk-` keys, and values assigned to names that end in KEY, TOKEN, SECRET or PASSWORD.

Under `extended`, the descriptions and task text of your user, project and plugin agents leave too. The request leaves when omp prepares the `task` call, before omp's approval gate runs. [PRIVACY.md](PRIVACY.md) has the full list, the project scope risks and the key handling.

A failed request leaves the call unchanged. The item skips with its reason, and omp runs it without a model from the plugin.

## Turn it off

[Turn off and uninstall](../../README.md#turn-off-and-uninstall) in the repository README gives the steps.

Removing the key of every provider the `provider` setting allows also stops routing. Every batch then reports `key unset`.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
