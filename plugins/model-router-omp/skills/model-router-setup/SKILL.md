---
name: model-router-setup
description: >
  Use when the user wants to set up or check model-router in Oh My Pi (omp): to
  choose its provider, scope or level models, to add a TypeSafe or OpenRouter
  key, to find out why routing is off, or to check that routing works.
---

# model-router setup for Oh My Pi

model-router scores each routed `task` spawn with Jev, on TypeSafe or OpenRouter. It gives the spawn the `smol` role for lookup work, the `midl` role for bounded judgment, or the `slow` role for open judgment. It also sets the effort.

## What set up means

Routing works when all of these hold:

- The plugin is enabled in omp.
- The omp setting `task.batch` is on, so each `task` call carries a `tasks` list.
- A scoring key exists for a provider that the `provider` setting allows.

The person may also choose:

- The `provider` setting, which picks the scoring providers.
- The `scope` setting, which picks the routed agents.
- A model for each of the three levels, as an omp model role. A level with no model keeps the agent's model. It still gets the effort for a task the plugin scores.

## Your job

Find out which of these already hold, with the `model_router_config` tool and omp's own means. Tell the person in one message what is set and what is missing. Do only what is missing or what the person asks to change, and do it yourself once the person agrees. Never ask the person to repeat a step that is done, and never ask for the install commands. Ask the person with the question tool omp gives you, never as plain text in your reply. If the session has no such tool, ask one question per message.

## Facts

### The tool

- Called with no input, `model_router_config` prints the `provider` line, the `scope` line, and one key line for each provider the `provider` value allows.
- A key line reads `<provider> key: set` or `<provider> key: unset`.
- An unknown `provider` value counts as `typesafe`. An unknown `scope` value counts as `core`.
- The tool takes one optional input, `setting`: `provider`, `scope`, `typesafe_key` or `openrouter_key`.
- With `provider` or `scope`, the plugin asks the person in its own dialog and writes the value the person picks. The tool takes no value from the agent.
- With `typesafe_key` or `openrouter_key`, the plugin asks for the key in a text dialog and stores it in omp's credential store, as `/login` does. The typed key shows in clear in that dialog.
- A saved key returns `<provider> key: saved, checking`. The save counts only when a call with no input then reports `<provider> key: set`.
- A failed key save returns `<provider> key not saved`.
- A call that picks the current value returns `<setting> unchanged: already <value>`.
- A call with no dialog answer returns `<setting> unchanged: no answer from the dialog`. It appears when omp has no UI too. The person can type `/model-router:provider <value>` or `/model-router:scope <value>` instead.
- The tool writes the global plugin settings only. When a project value wins, the output adds `A project value for <setting> overrides it.`
- A project's settings may only narrow `provider`, from `auto` or `openrouter-first` to `typesafe` or `openrouter`. A project may set `scope` to either value, and it overrides the global one.
- The plugin reads both settings on every batch, so a change reaches the next batch with no reload.

### Provider

- `typesafe` is the default and uses TypeSafe only.
- `openrouter` uses OpenRouter only.
- `auto` uses TypeSafe, then OpenRouter if TypeSafe fails.
- `openrouter-first` uses OpenRouter, then TypeSafe if OpenRouter fails.
- With `auto` or `openrouter-first` and one key, the provider with the key scores alone.

### Scope

- `core` is the default and routes the bundled `task` agent only.
- `extended` routes every agent whose model the person did not set, bundled agents included.

### Keys

- TypeSafe: omp's stored `typesafe` credential, which `/login typesafe` stores, then the `TYPESAFE_API_KEY` environment variable.
- OpenRouter: omp's stored `openrouter` credential, which `/login openrouter` stores, then the `OPENROUTER_API_KEY` environment variable.
- A key counts as set when either place holds a non-empty value.
- A key variable reaches the environment of every process omp starts.
- With no key for any allowed provider, every call skips with `key unset`.

### Models

- Level 0 takes the `smol` role, level 1 the `midl` role and level 2 the `slow` role.
- omp ships `smol` and `slow`. `midl` is the plugin's name, and omp has no such role until the person adds it.
- The plugin asks omp whether it has a model for the role. If omp has one, the spawn gets that role with the effort, such as `@midl:medium`.
- If omp has none, the level keeps the agent's model. The plugin still sets the effort, except where a kept label below says otherwise.
- With the omp `task` model role set, every `task` item skips with `task model role set`, so `core` routes nothing.

### The routed line

- Each batch prints one line that starts with `model-router`. Entries are numbered by position in the call and joined with ` | `.
- A routed entry reads `L<level> <role or slot state> · <effort or kept label> · p=<tier>/<work>`, such as `L1 @midl · medium · p=0.66/0.72`.
- A level with no model shows the slot, as `L0 small model unset`, `L1 middle model unset` or `L2 large model unset`.
- A kept label replaces the effort: `caller effort` when the item's own `effort` applies, `config effort` when a thinking level comes from omp's settings or the role, and `no model patterns` when the spawn has none.
- After a fallback, the entry ends with ` · via <provider> (<first provider> <reason>)`.
- A skipped entry reads `task <n>: skipped, <reason>`. After both providers fail, the reason names each provider, as in `skipped, typesafe HTTP 503, openrouter timeout`.
- A spawn can print a second line for the same item. That later line holds.
- With `task.batch` off, or with the plugin disabled, no line appears.
- If omp records the model a subagent ran on, it matches the role the entry names.

### Reasons routing is off

A closed gate skips every item with the same reason:

- `tool call timeout <n> ms leaves <m> ms to route`: omp's tool call timeout leaves under 1 s to score. Set `extensionHandlers.toolCallTimeoutMs` to 3000 or more.
- `settings unreadable`: the plugin cannot read its settings, omp's model roles, task model overrides or disabled agents.
- `key unset`: no allowed provider has a key.

An item check skips one item:

- `task model role set`: the `task` model role is set, and omp's own routing decides.
- `<agent> model override set`: `task.agentModelOverrides` has an entry for the agent.
- `<agent> agent disabled`: `task.disabledAgents` lists the agent.
- `the item sets its own model`: the item carries `model`.
- `custom task agent`: under `core`, the `task` agent is not omp's bundled one, or agent discovery failed.
- `<agent> is outside the core scope`: the scope changed to `core` after the batch.
- `<agent> agent discovery failed`, `<agent> agent unknown` and `<agent> sets its own model`: under `extended`, omp's agent list fails, lacks the agent, or the agent declares its own model.
- `seance spawns without the hook omp gives plugins, so its model cannot change`: omp gives the `seance` agent no spawn hook.
- `<agent> spawns with another model role`: the spawn names a role other than the agent's own.

A scored item can skip for these reasons:

- `timeout`: the provider gave no answer in time. Scoring has 8 s per batch.
- `HTTP <status>`: the provider returned an error. `HTTP 401` means it refused the key.
- `network error`: the request could not connect.
- `rejected request`: the TypeSafe SDK refused the request.
- `bad reply`: the reply held no valid score.
- `failed`: any other error.

These last reasons point to the provider or the network, not to a setting.

### Routing check

- A check spawns one `task` item with no `agent` and the text "Reply with the single word ok."
- A good result is a routed entry with a level, a role or slot state, and an effort or kept label. The entry names no skip reason.

## Limits

- Never take, show or repeat a key. If a key reaches the chat, do not store it, and tell the person to rotate it.
- Change a setting only when the person asked for it or agreed.
- A routing check spawns one small task and spends a little usage, so ask before it.

## When you finish

Say what is set, what you changed and what still keeps routing off. Include no key and no home-directory path.
