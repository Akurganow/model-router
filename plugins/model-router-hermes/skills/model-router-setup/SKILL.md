---
name: model-router-setup
description: Use to set up model-router in Hermes Agent, to find why routing is off, to change the provider, the gateway, the scoring models or a model, or to check routing. It states what must be true and the facts to reach it.
---

# model-router setup for Hermes Agent

model-router is the `delegate_task` backend of Hermes Agent. It scores each delegated task with the decision model of the chosen provider, on the provider's own API or through OpenRouter. It sets the task's effort from a fixed ladder. It gives the task the person's `small_model` for lookup work, `middle_model` for bounded judgment or `large_model` for open judgment. It never routes the main turn.

## What set up means

Routing works when both of these hold:

- The delegation backend is `model-router`: `delegation.backend` holds that value.
- A scoring key exists for a path the `provider` and `gateway` settings allow.

The person's optional choices:

- `provider`: whose model scores tasks. It takes `typesafe`, `openai` or `google`.
- `gateway`: how OpenRouter is used to reach the provider.
- `models`: the scoring model of each provider. A provider with no entry uses its default model.
- `small_model`, `middle_model` and `large_model`: the model for each of the three levels. A level with no model keeps the model Hermes gives it. It still gets the effort for a task the plugin scores.

## Your job

Find out which of these already hold, with the `model_router_config` tool and Hermes's own means. Tell the person in one message what is set and what is missing. Do only what is missing or what the person asks to change, and do it yourself once the person agrees. Never ask the person to repeat a step that is done, and never ask for the install commands. Ask the person with the question tool Hermes gives you, never as plain text in your reply. If the session has no such tool, ask one question per message.

When a choice has more than four values, ask with three values and `more` at a time, the current value first; `more` on the last page goes back to the first.

When the person wants to choose the provider, follow these steps in order:

1. Call `model_router_config` with no input, and read the settings and the key lines.
2. Ask which provider's model scores, and give the labels from the provider and gateway facts.
3. Ask how OpenRouter is used, before any write.
4. On the person's word, ask them to type `/model-router-gateway <value>` and `/model-router-provider <value>` in a local session, one command at a time. Set `gateway` first. When the stored `gateway` is `openrouter`, set `provider` first.
   - Ask for the second command only after `model_router_config` shows the agreed value of the first setting. If it does not, stop and tell the person.
   - Between the two writes the plugin routes by the middle pair. This order uses no key that neither the old pair nor the new pair uses.
5. Name the key the choice needs, and say where it comes from and what it changes in Hermes, as the keys facts say.
6. Call `model_router_config` again, and confirm the lines.

When the `models` line ends with `(not valid: <entry>)`, repair it. Follow these steps in order:

1. Call `model_router_config` with no input, and read the `models` line.
2. Name the entry to the person, and ask for a corrected text.
3. On the person's word, run `hermes config set plugins.entries.model-router-hermes.settings.models '<corrected text>'`, with the text in the short form and the entries in the order the line shows them. When a kept name holds a comma, a quote or a brace, write the whole value as a JSON object.
4. Call `model_router_config` again, and confirm the `models` line.

When the person wants another scoring model for one provider, follow these steps in order:

1. Call `model_router_config` with no input, and read the `models` line and the lines under it.
2. Ask the person for the provider and the model name. Model names come from the provider's API documentation.
3. Take the text the line shows, keep every other entry, and set or replace that provider's entry. Write the short form, with the entries in the order the line shows them. When a kept name holds a comma, a quote or a brace, write the whole value as a JSON object.
4. On the person's word, run `hermes config set plugins.entries.model-router-hermes.settings.models '<whole text>'`.
5. Call `model_router_config` again, and confirm the `models` line.

## Facts

### The tool

- `model_router_config` only reads. It sits in the `model_router` toolset, which is on once the plugin is enabled.
- With no input it returns the `provider` line, the `gateway` line, the `models` lines, one line for each of the three slot models, then one key line for each path the `gateway` value allows. Hermes has no `scope` setting, so no scope line prints.
- The provider line reads `provider: typesafe`, `provider: openai` or `provider: google`. The gateway line reads `gateway: <value> (<who the plugin asks>)`, such as `gateway: auto (typesafe, then openrouter)`.
- A model line reads `<name>: <provider> <model>` or `<name>: unset`. The names are `small_model`, `middle_model` and `large_model`. Here `<provider>` is a Hermes provider id.
- A key line reads `typesafe key: set`, `openai key: unset` or `openrouter key: unset`, after the key's holder. It never shows a key, its length or any part of it.
- A setting that is not valid prints `<setting>: <stored text> (not valid: use one of <values>)`. Every valid setting then prints as `<setting>: <value>`, the gateway line names nobody, and no key line prints.
- A `models` value that is not valid prints as `models: <text> (not valid: <entry>)`, and no provider model line prints.
- A failure returns `error: <message>`.

### The backend

- The plugin never writes `delegation.backend`.
- The new backend replaces `model_map` or any other backend that was set.

### The provider and the gateway

- `provider` names whose model scores. It has three values, and `typesafe` is the default:
  - `typesafe - Jev from TypeSafe`
  - `openai - OpenAI's decision model`
  - `google - Google's decision model`
  - On a free-tier Google key, Google may use the text.
  - [What each company does with the text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-each-company-does-with-the-text) says more.
- `gateway` says how OpenRouter is used to reach the provider. OpenRouter is a gateway, never a provider. It has four values:
  - `direct` is the default and asks the provider's own API only.
  - `auto` asks the provider, then OpenRouter.
  - `openrouter-first` asks OpenRouter, then the provider.
  - `openrouter` asks OpenRouter only.
- The `gateway` setting is not Hermes's gateway, the process that owns a session.
- With `auto` or `openrouter-first` and one key, the path with that key scores alone.
- Only some failures reach the second path: [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) lists them.
- Each setting changes only with its command: `/model-router-provider <value>` and `/model-router-gateway <value>`. The plugin reads both at each task.
- With no value a command prints the current line, such as `gateway: auto (typesafe, then openrouter)`.
- With a valid value it writes the value and prints the new line. It replaces a stored value that is not valid.
- An invalid value prints `provider: use one of typesafe, openai, google` or `gateway: use one of direct, auto, openrouter-first, openrouter`.
- The value already stored prints `<setting> unchanged: already <value>`. A value over nothing stored is written, even when it is the default.
- A valid value from a session on a messaging platform prints `<setting> unchanged: only a local session can change it`, then the current line. Hermes CLI, TUI and Desktop sessions are local.
- A failed write prints `<setting> unchanged: <reason>`.
- A stored value outside a setting's values is not valid. Routing then skips every task with `<setting> not valid: run setup`, and the plugin sends no request.
- Hermes passes such a stored value on as stored. The Desktop settings form refuses to save a value outside the choices, and it leaves such a stored value alone when it saves another field. [Hermes registration and settings](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hermes-registration-and-settings) holds both facts.

### A retired provider value

- Earlier versions took `auto`, `openrouter-first` and `openrouter` as values of `provider`. A stored one is not valid. A stored `typesafe` needs no change.
- The tool shows a retired value as `provider: <stored text> (not valid: use one of typesafe, openai, google)`.
- The pairs that give the same requests as before:
  - stored `auto`: `gateway` `auto` and `provider` `typesafe`.
  - stored `openrouter-first`: `gateway` `openrouter-first` and `provider` `typesafe`.
  - stored `openrouter`: `gateway` `openrouter` and `provider` `typesafe`.
- Hermes gives you no way to write `provider` or `gateway`. The person types the commands.
- The order is `gateway` first, then `provider`. In that order no task takes a path they did not choose.

1. Read the stored values with `model_router_config`.
2. Propose the pair that matches the stored value.
3. After the person agrees, ask them to type `/model-router-gateway <value>` in a local session.
4. Call the tool again. Go on only when the `gateway` line shows the agreed value.
5. Ask them to type `/model-router-provider typesafe`.
6. Call the tool again and check both lines.

### The keys

- A key counts as set when its variable holds non-blank text. The plugin reads a key only for a key holder that the `provider` and `gateway` settings allow. The key of the chosen provider serves the direct path, and the OpenRouter key serves the gateway path.
- Each key is a variable in the `.env` file of the Hermes home:
  - TypeSafe: `TYPESAFE_API_KEY`, form secret `api_key`. Get a key at https://console.typesafe.ai/keys.
  - OpenAI: `OPENAI_API_KEY`, form secret `openai_api_key`. Get a key at https://platform.openai.com/api-keys.
  - Google: `GEMINI_API_KEY`, form secret `google_api_key`. Get a key at https://aistudio.google.com/docs/api-key. The plugin does not read `GOOGLE_API_KEY`.
  - OpenRouter: `OPENROUTER_API_KEY`, form secret `openrouter_api_key`. Get a key at https://openrouter.ai.
- The plugin's settings form in Hermes Desktop also sets each key, and Hermes stores it under that variable.
- Hermes's own OpenRouter, OpenAI and Gemini providers read the same keys, and a key saved for the plugin may serve the person's own Hermes session too. Setting `model.provider` keeps another provider. [Keys](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-hermes/README.md#keys) gives the facts, including the `GOOGLE_API_KEY` order and the `model.key_env` limit.
- No other credential of Hermes serves as a scoring key.
- A key in the environment is visible to every process Hermes starts.
- With no key for any path the `gateway` setting allows, every task without a `level` skips with `key unset`.

### The scoring models

- `models` takes the short form, such as `{typesafe:jev-latest, openai:gpt-6-luna}`, a JSON object, or a native object. [The `models` setting](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-models-setting) lists the forms, the defaults, the OpenRouter names and when a value is not valid.
- The person sets `models` in the settings form in Hermes Desktop, or with `hermes config set plugins.entries.model-router-hermes.settings.models '<text>'`. Run the command only on the person's word.
- The Python passes the stored value to the Node step, which decides whether it is valid. A value that is not valid stops routing. A task with a level skips with `models not valid: run setup` after the `<setting> not valid` gate. A task without one meets that check in its Node step after every gate, so it can skip with an earlier reason, such as `key unset`. [The gates](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-hermes/README.md#the-gates) give the order.
- A model name goes as written on the provider's own API, and that API's documentation lists the names. [The model name on each path](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-model-name-on-each-path) says what OpenRouter does with a name.
- The plugin writes no setting when it loads.

### The models

- Each model setting is a mapping with two fields. `provider` is a Hermes provider id, such as `openrouter`. `model` is a model id as Hermes lists it for that provider.
- A mapping with no `model` counts as unset.
- The three settings are the plugin's own settings in Hermes's config, under `plugins.entries.model-router-hermes.settings`. The person sets one in the settings form in Hermes Desktop, or with `hermes config set plugins.entries.model-router-hermes.settings.<slot> '{"provider": "<provider>", "model": "<model>"}'`.
- For a scored task, level 0 sets the `small_model`, level 1 the `middle_model` and level 2 the `large_model`. The task gets that slot's `model` and `provider`.
- A delegating model can pin `level` on a task. The task then gets that level's model with no scoring, and carries no `route.label` while the model is set.
- A pinned task whose slot has no model runs on Hermes's model, with the label `model-router L<level> <slot> model unset`.
- A level with no model keeps Hermes's model and still gets the effort for a scored task. It is the person's choice and needs no fix.
- Level 1 is the default unless the scoring model sees clearly more or less need for judgment.

### What outranks the plugin

- The `delegation` section outranks the plugin. A `model`, `provider`, `base_url` or `api_key` there makes every task skip with `subagent model set`. The person decides whether to clear it.
- A non-empty `delegation.reasoning_effort` keeps that effort. The plugin still routes the model, and the line shows `config effort`. That is no skip.
- A delegating model's own `reasoning_effort` on a task is kept in the same way, and the line shows `caller effort`.
- The plugin sets only `low`, `medium`, `high` or `xhigh`.

### The routing line

- The line is in the `route.label` field of each `delegate_task` result, in every plugin isolation mode.
- Hermes also logs the line at INFO in `agent.log`, once for each distinct line. Under `plugins.isolation: host` that log drops INFO lines, so only `route.label` shows it.
- A routed line reads `model-router L<level> <model or slot state> · <effort or kept label> · p=<tier>/<work>`.
- The slot state is `<slot> model unset`. The kept label is `config effort` or `caller effort`.
- Who answered follows, `typesafe`, `openai`, `google` or `openrouter`, then the model its reply names and the token counts, as in ` · typesafe jev-1.14.0 · 812/9 tok`. The model and the token counts are left out when the reply lacks them. Google's reply names no model, so its line reads ` · google · 430/0 tok`.
- After a fallback, the line ends with the attempt that failed and its reason, as in ` · openrouter openai/gpt-6-luna-decisions-20261006 · 488/0 tok · openai HTTP 429`.
- A skipped line reads `model-router skipped, <reason>`. The task then runs on Hermes's own route.

### The skip reasons

- `<setting> not valid: run setup`: a stored `provider` or `gateway` holds text outside its values, or `models` is not valid. The person sets valid values with the commands, as the provider and gateway facts say. For `models`, follow the steps above.
- `key unset`: no path the `provider` and `gateway` settings allow has a key. A task with a `level` meets no key check. The person sets one, as the keys facts say.
- `subagent model set`: the `delegation` section sets a model. The person decides whether to clear it.
- `node not found`: Hermes has no Node of its own. The plugin runs scoring in that Node and never uses a Node on `PATH`. The person adds a Node for Hermes.
- `timeout`: a first attempt got no answer in 5 s, or the routing limit of 10 s for a whole `delegate_task` call ran out.
- `HTTP <status>`, `network error`, `bad reply` or `failed`: the attempt gave no score, or the plugin failed. After both attempts the reason names each.
  - With `HTTP 400` the person can also check the model name in `models`: OpenRouter answers an unknown name with it.
  - With `HTTP 401` or `HTTP 403`, or `HTTP 400` from Google's own API, the person checks that holder's key first. Google's own API answers a bad key with `HTTP 400`, as [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) says.
  - For another status, `network error`, `bad reply` or `failed`, look at the company that failed and the network.
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
- Only a local Hermes session can run `/model-router-provider` and `/model-router-gateway` to change a setting.

## When you finish

Say what is set, what you changed and what still keeps routing off. Include no key and no home-directory path.
