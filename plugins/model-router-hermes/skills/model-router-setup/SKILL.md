---
name: model-router-setup
description: Use to set up model-router in Hermes Agent, to find why routing is off, to change the provider or a model, or to check routing. It states what must be true and the facts to reach it.
---

# model-router setup for Hermes Agent

model-router is the `delegate_task` backend of Hermes Agent. It scores each delegated task with Jev, on TypeSafe or OpenRouter. It sets the task's effort from a fixed ladder. It gives the task the person's `small_model` for lookup work, `middle_model` for bounded judgment or `large_model` for open judgment. It never routes the main turn.

## What set up means

Routing works when both of these hold:

- The delegation backend is `model-router`: `delegation.backend` holds that value.
- A scoring key exists for a provider the `provider` setting allows.

The person's optional choices:

- `provider`: which providers score tasks, and in which order.
- `small_model`, `middle_model` and `large_model`: the model for each of the three levels. A level with no model keeps the model Hermes gives it. It still gets the effort for a task the plugin scores.

## Your job

Find out which of these already hold, with the `model_router_config` tool and Hermes's own means. Tell the person in one message what is set and what is missing. Do only what is missing or what the person asks to change, and do it yourself once the person agrees. Never ask the person to repeat a step that is done, and never ask for the install commands. Ask the person with the question tool Hermes gives you, never as plain text in your reply. If the session has no such tool, ask one question per message.

## Facts

### The tool

- `model_router_config` only reads. It sits in the `model_router` toolset, which is on once the plugin is enabled.
- With no input it returns the `provider` line, one line for each of the three models, and one key line for each provider the `provider` value allows.
- A model line reads `<name>: <provider> <model>` or `<name>: unset`. The names are `small_model`, `middle_model` and `large_model`.
- A key line reads `<provider> key: set` or `<provider> key: unset`. It never shows a key, its length or any part of it.
- With a setting name it returns how the person changes that setting, and changes nothing. The names are `provider`, `typesafe_key`, `openrouter_key`, `small_model`, `middle_model` and `large_model`.
- Any other name returns `Unknown setting.` with the list of names. A failure returns `error: <message>`.

### The backend

- The plugin never writes `delegation.backend`.
- The new backend replaces `model_map` or any other backend that was set.

### The provider

- `typesafe` is the default and scores with TypeSafe only. `openrouter` scores with OpenRouter only.
- `auto` tries TypeSafe, then OpenRouter. `openrouter-first` tries OpenRouter, then TypeSafe.
- With `auto` or `openrouter-first` and one key, the provider with that key scores alone.
- The setting changes only with `/model-router-provider <value>`. The plugin reads it at each task.
- With no value the command prints the current line, such as `provider: auto (typesafe, then openrouter)`.
- With a value it writes the value and prints the new line. An invalid value prints `provider: use one of auto, openrouter-first, typesafe, openrouter`.
- The same value prints `provider unchanged: already <value>`.
- A session on a messaging platform prints `provider unchanged: only a local session can change it`, then the current line. Hermes CLI, TUI and Desktop sessions are local.
- A failed write prints `provider unchanged: <reason>`.
- With the setting name `provider`, the tool returns the command and the allowed values.

### The keys

- A key counts as set when its variable holds non-blank text. The plugin reads a key only for a provider the `provider` setting allows.
- The TypeSafe key is the variable `TYPESAFE_API_KEY`. The plugin's settings form in Hermes Desktop also sets it.
- The OpenRouter key is the variable `OPENROUTER_API_KEY`. No settings form sets it.
- The tool with `typesafe_key` or `openrouter_key` returns where the person sets that key, and never a key.
- Hermes's own provider credentials never serve as a Jev key.
- A key in the environment is visible to every process Hermes starts.
- With no key for any allowed provider, every task skips with `key unset`.

### The models

- Each model setting is a mapping with two fields. `provider` is a Hermes provider id, such as `openrouter`. `model` is a model id as Hermes lists it for that provider.
- A mapping with no `model` counts as unset.
- The three settings are the plugin's own settings in Hermes's config, under the plugin id `model-router-hermes`.
- For a scored task, level 0 sets the `small_model`, level 1 the `middle_model` and level 2 the `large_model`. The task gets that slot's `model` and `provider`.
- A delegating model can pin `level` on a task. The task then gets that level's model with no scoring, and carries no `route.label` while the model is set.
- A pinned task whose slot has no model runs on Hermes's model, with the label `model-router L<level> <slot> model unset`.
- A level with no model keeps Hermes's model and still gets the effort for a scored task. It is the person's choice and needs no fix.
- Level 1 is the default unless Jev sees clearly more or less need for judgment.

### What outranks the plugin

- The `delegation` section outranks the plugin. A `model`, `provider`, `base_url` or `api_key` there makes every task skip with `subagent model set`. The person decides whether to clear it.
- A non-empty `delegation.reasoning_effort` keeps that effort. The plugin still routes the model, and the line shows `config effort`. That is no skip.
- A delegating model's own `reasoning_effort` on a task is kept in the same way, and the line shows `caller effort`.
- The plugin sets only `low`, `medium`, `high` or `xhigh`.

### The routing line

- The line is in the `route.label` field of each `delegate_task` result, in every plugin isolation mode.
- Hermes also logs the line at INFO in `agent.log`, once for each distinct line. Under `plugins.isolation: host` that log drops INFO lines, so only `route.label` shows it.
- A routed line reads `model-router L<level> <model or slot state> · <effort or kept label> · p=<tier>/<work>`. A Jev model and token counts can follow.
- The slot state is `<slot> model unset`. The kept label is `config effort` or `caller effort`.
- After a fallback the line ends with the provider that answered and why the first failed, as in ` · via openrouter (typesafe HTTP 503)`.
- A skipped line reads `model-router skipped, <reason>`. The task then runs on Hermes's own route.

### The skip reasons

- `key unset`: no allowed provider has a key. The person sets one, as the keys facts say.
- `subagent model set`: the `delegation` section sets a model. The person decides whether to clear it.
- `node not found`: Hermes has no Node of its own. The plugin runs scoring in that Node and never uses a Node on `PATH`. The person adds a Node for Hermes.
- `timeout`: the routing limit of 8 s for a whole `delegate_task` call ran out. No setting fixes it.
- `HTTP <status>`, `network error`, `rejected request`, `bad reply` or `failed`: the provider gave no answer, or the plugin failed. No setting fixes it. After two providers the reason names each.
- Check every reason that holds, not only the first.

### The routing check

- A routing check is one `delegate_task` call with one task, such as "Reply with the single word ok." It passes no `model`, `provider` or `reasoning_effort`.
- The `route.label` of the result shows the outcome. A good line names a level, a model or a slot with no model, and an effort.
- A label with no `model-router` line means the backend is not on. A label that names a skip reason shows what keeps routing off.

For the person: the plugin's README in the model-router repository holds the full reference.

## Limits

- Never take, show or repeat a key. If a key arrives in chat, do not store it, and tell the person to rotate it.
- Change a setting only when the person asked for it or agreed.
- A routing check spawns one small task and spends a little usage, so ask before it.
- Only a local Hermes session can run `/model-router-provider` to change the provider.

## When you finish

Say what is set, what you changed and what still keeps routing off. Include no key and no home-directory path.
