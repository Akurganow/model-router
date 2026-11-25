---
name: model-router-setup
description: >
  Use when the user wants to set up or check model-router in Oh My Pi (omp): to
  choose its provider, gateway, scope, scoring models or level models, to add a TypeSafe,
  OpenAI, Google or OpenRouter key, to find out why routing is off, or to check that routing works.
---

# model-router setup for Oh My Pi

model-router scores each routed `task` spawn with the decision model of the chosen provider, on the provider's own API or through OpenRouter. It gives the spawn the `smol` role for lookup work, the `midl` role for bounded judgment, or the `slow` role for open judgment. It also sets the effort.

## What set up means

Routing works when all of these hold:

- The plugin is enabled in omp.
- The omp setting `task.batch` is on, so each `task` call carries a `tasks` list.
- A scoring key exists for a path that the `provider` and `gateway` settings allow.

The person may also choose:

- The `provider` setting, which says whose model scores. It takes `typesafe`, `openai` or `google`.
- The `gateway` setting, which says how OpenRouter is used to reach the provider.
- The `scope` setting, which picks the routed agents.
- The `models` setting, which names the scoring model of each provider. A provider with no entry uses its default model.
- A model for each of the three levels, as an omp model role. A level with no model keeps the agent's model. It still gets the effort for a task the plugin scores.

## Your job

Find out which of these already hold, with the `model_router_config` tool and omp's own means. Tell the person in one message what is set and what is missing. Do only what is missing or what the person asks to change, and do it yourself once the person agrees. Never ask the person to repeat a step that is done, and never ask for the install commands. Ask the person with the question tool omp gives you, never as plain text in your reply. If the session has no such tool, ask one question per message.

When the person wants to choose the provider, follow these steps in order:

1. Call `model_router_config` with no setting, and read the settings and the key lines.
2. Ask which provider's model scores, and give the three labels from the Provider and gateway facts.
3. Ask how OpenRouter is used, before any write.
4. On the person's word, call `model_router_config` once with `setting` set to `gateway` and once with `provider`. Set `gateway` first. When the stored `gateway` is `openrouter`, set `provider` first.
   - Make the second call only after the first setting's line shows the agreed value. If it does not, stop and tell the person.
   - Between the two writes the plugin routes by the middle pair. This order uses no key that neither the old pair nor the new pair uses.
5. Name the key the choice needs, and say where it comes from, as the Keys facts say.
6. Call `model_router_config` with no setting, and confirm the lines.

When the `models` line ends with `(not stored yet: run setup)`, migrate it. Follow these steps in order:

1. Call `model_router_config` with no input, and read the `models` line and the lines under it.
2. Tell the person that the line shows the migrated text, and that nothing is stored yet.
3. Ask the person whether to write it. On the person's word, call `model_router_config` with `models` set to the text shown before the note.
4. Read the reply, call `model_router_config` with no input, and confirm the `models` line.

When the `models` line ends with `(not valid: <entry>)`, repair it. Follow these steps in order:

1. Name the entry to the person, and ask for a corrected text.
2. On the person's word, call `model_router_config` with `models` set to the corrected text, in the short form, with the entries in the order the line shows them. When a kept name holds a comma, a quote or a brace, write the whole value as a JSON object.
3. Read the reply. `models unchanged: not valid: <entry>` means nothing was written. Name the entry to the person, and ask again.
4. Call `model_router_config` with no input, and confirm the `models` line.

When the person wants another scoring model for one provider, follow these steps in order:

1. Call `model_router_config` with no input, and read the `models` line and the lines under it.
2. Ask the person for the provider and the model name. Model names come from the provider's API documentation.
3. Take the text the line shows, keep every other entry, and set or replace that provider's entry. Write the short form, with the entries in the order the line shows them. When a kept name holds a comma, a quote or a brace, write the whole value as a JSON object.
4. On the person's word, call `model_router_config` with `models` set to the whole new text.
5. Read the reply. `models unchanged: not valid: <entry>` means nothing was written. Name the entry to the person.
6. Call `model_router_config` with no input, and confirm the `models` line.

## Facts

### The tool

- Called with no input, `model_router_config` prints the `provider` line, the `gateway` line, the `scope` line, the `models` lines, and one key line for each path the `gateway` value allows, in order:

  ```text
  provider: typesafe
  gateway: auto (typesafe, then openrouter)
  scope: core
  models: unset
  typesafe model: jev-latest (OpenRouter: jev-latest)
  typesafe key: set
  openrouter key: unset
  ```

  The example holds the model line of one provider. [The report lines](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-report-lines) show one for each.
- A key line reads `<holder> key: set` or `<holder> key: unset`. For the direct path the holder is the provider's name, `typesafe`, `openai` or `google`, and for the gateway path it is `openrouter`.
- The `gateway` line names the paths of its value, with the provider's name for the direct path: `gateway: direct (openai)`, `gateway: auto (openai, then openrouter)`, `gateway: openrouter-first (openrouter, then openai)` or `gateway: openrouter (openrouter)`.
- A stored value outside its setting's list is not valid. The plugin then routes no task, and each task skips with `<setting> not valid: run setup`.
- The tool prints `<setting>: <stored text> (not valid: use one of <values>)` for that setting, and each valid setting as `<setting>: <value>`, in the usual order. The gateway line names nobody, and no key line prints.
- omp passes a stored value on as stored, so the skip line shows in omp, as [omp manifest and settings](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#omp-manifest-and-settings) says.
- The tool takes two optional inputs: `setting`, which is `provider`, `gateway` or `scope`, and `models`.
- With `provider`, `gateway` or `scope`, the plugin asks the person in its own dialog and writes the value the person picks. The tool takes no value from the agent for these.
- With `models` set to a string, the plugin writes that text to the global setting at once, with no dialog. Do this only at the person's request.
- A `models` text that is not valid is refused with `models unchanged: not valid: <entry>`, and nothing is written.
- A call that picks a value the global setting already holds, with no project value in the way, returns `<setting> unchanged: already <value>`.
- A call with no dialog answer returns `<setting> unchanged: no answer from the dialog`. It appears when omp has no UI too. The person can type `/model-router:provider <value>`, `/model-router:gateway <value>` or `/model-router:scope <value>` instead.
- The tool writes the global plugin settings only. When a project value wins, the output adds `A project value for <setting> overrides it.`
- A project never changes `provider`: the plugin ignores a valid project value. A project may only narrow `gateway`, from `auto` or `openrouter-first` to `direct` or `openrouter`. A project may set `scope` to either value, and it overrides the global one. A project value outside its list is not valid, and its tasks skip with `<setting> not valid: run setup`.
- The plugin reads the settings on every batch, so a change reaches the next batch with no reload.

### Provider and gateway

- `provider` has three values. `typesafe` is the default.
  - `typesafe`: Jev from TypeSafe, the model the plugin's questions are fitted to.
  - `openai`: OpenAI's decision model; costs more than Jev and its answers are not fitted.
  - `google`: Google's decision model; costs more than Jev and its answers are not fitted; on a free-tier key Google may use the text.
  - [What each company does with the text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-each-company-does-with-the-text) says more.
- `gateway` has four values. `direct` is the default.
  - `direct` uses the provider's own API only.
  - `auto` uses the provider's own API, then OpenRouter if that fails.
  - `openrouter-first` uses OpenRouter, then the provider's own API if that fails.
  - `openrouter` uses OpenRouter only.
- With `auto` or `openrouter-first` and one key, the path with that key scores alone.
- Only some failures reach the second path: [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) lists them.

### A retired provider value

- `auto`, `openrouter-first` and `openrouter` are values of `gateway` now. A stored `provider` with one of them is not valid.
- Each pair gives the same requests as before:
  - `provider: auto` is `provider: typesafe` with `gateway: auto`.
  - `provider: openrouter-first` is `provider: typesafe` with `gateway: openrouter-first`.
  - `provider: openrouter` is `provider: typesafe` with `gateway: openrouter`.
- A stored `provider: typesafe` needs no change.

To move a retired value, follow these steps in order:

1. Call `model_router_config` with no setting, and read the `provider` and `gateway` lines.
   - A retired value shows as `provider: <stored text> (not valid: use one of <values>)`.
2. Check the current project's override file before any write.
   - A project's override file can hold a `provider` value too. omp merges that file into the settings it hands the plugin, and the plugin never opens it.
   - The check comes first, because after the global pair is set, a project's `provider: typesafe` no longer keeps OpenRouter out.
   1. Look for `<project>/.omp/plugin-overrides.json` in the current project, and read it if it exists.
   2. If it sets `provider`, tell the person that this `provider` narrows nothing, and what to do with that line:
      - `typesafe`: replace the line with `gateway: direct`. It kept OpenRouter out, and no line shows that it stopped. The new line narrows only a global `auto` or `openrouter-first`.
      - `openrouter`: replace the line with `gateway: openrouter`. It narrows only a global `auto` or `openrouter-first`.
      - `auto` or `openrouter-first`: delete the line. It changed nothing before, and now it skips every task of that project with `provider not valid: run setup`.
   3. Tell the person to check the other projects' override files before setting the global pair.
      - The plugin reads none of them.
   4. Edit the file only when the person asks.
3. Propose the pair above that matches the global `provider`.
   - The `provider` line of step 1 shows the global text, unless the project's override file sets a `provider` outside the list. Then it shows the project's text.
   - If step 2 found such a line, take no pair from the line of step 1. Call `model_router_config` again once the person has changed the file, and read the `provider` line.
   - While the file keeps that line, propose no pair: this project does not show the global text.
   - If the new line still shows the file's old text, ask the person for the global value before you propose a pair.
4. On the person's word, call `model_router_config` with `setting` set to `gateway`.
   - The person picks the value in the dialog. Where no dialog answers, the person types `/model-router:gateway <value>`.
   - Set `gateway` first and `provider` second. While `provider` is not valid, no task routes, so no task takes a path the person did not choose.
5. When the `gateway` line shows the agreed value, call `model_router_config` with `setting` set to `provider`.
   - If the `gateway` line shows another value, stop and tell the person.
   - The person picks `typesafe` in the dialog. Where no dialog answers, the person types `/model-router:provider typesafe`.
6. Call `model_router_config` with no setting, and check the `provider` and `gateway` lines.

### Scoring models

- `models` takes the short form, such as `{typesafe:jev-latest, openai:gpt-6-luna}`, or a JSON object. [The `models` setting](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-models-setting) lists the forms, the defaults, the OpenRouter names and when a value is not valid.
- A `models` value that is not valid prints as `models: <text> (not valid: <entry>)`, and every task skips with `models not valid: run setup`.
- The plugin reads `models` from the global settings only. A project's value never applies.
- A model name goes as written on the provider's own API, and that API's documentation lists the names. [The model name on each path](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-model-name-on-each-path) says what OpenRouter does with a name.
- The plugin writes no setting when it loads. The `models` line ends with `(not stored yet: run setup)` when the migration changed a stored value, and then it shows the migrated text.

### Scope

- `core` is the default and routes the bundled `task` agent only.
- `extended` routes every agent whose model the person did not set, bundled agents included.

### Keys

- omp has no setting for a key. The plugin asks omp's credential lookup by an id, sends the credential omp returns, and then tries the variable.
  - TypeSafe: the id `typesafe`, which `/login typesafe` stores, then `TYPESAFE_API_KEY`. Get a key at https://console.typesafe.ai/keys.
  - OpenAI: the id `openai`, then `OPENAI_API_KEY`. Get a key at https://platform.openai.com/api-keys.
  - Google: the id `google`, then `GEMINI_API_KEY`. Get a key at https://aistudio.google.com/docs/api-key. The plugin does not read `GOOGLE_API_KEY`.
  - OpenRouter: the id `openrouter`, which `/login openrouter` stores, then `OPENROUTER_API_KEY`. Get a key at https://openrouter.ai.
- The key of the chosen provider serves the direct path, and the OpenRouter key serves the gateway path.
- A key counts as set when either place holds a non-blank value.
- A key variable reaches the environment of every process omp starts.
- The person adds a key with `/login typesafe` or `/login openrouter`, or with `omp login <provider>` outside a session. For OpenAI or Google, the person stores the credential the way omp stores one for that provider, or sets the variable. The plugin never asks for a key.
- With no key for any path the `provider` and `gateway` settings allow, every call skips with `key unset`.

### Models

- Level 0 takes the `smol` role, level 1 the `midl` role and level 2 the `slow` role.
- omp ships `smol` and `slow`. `midl` is the plugin's name, and omp has no such role until the person adds it.
- The plugin asks omp whether it has a model for the role. If omp has one, the spawn gets that role with the effort, such as `@midl:medium`.
- If omp has none, the level keeps the agent's model. The plugin still sets the effort, except where a kept label below says otherwise.
- The person reads and sets a role in the Roles view of `/models`, or under `modelRoles` in omp's `config.yml`.
- With the omp `task` model role set, every `task` item skips with `task model role set`, so `core` routes nothing.

### The routed line

- Each batch prints one line that starts with `model-router`. Entries are numbered by position in the call and joined with ` | `.
- A routed entry reads `L<level> <role or slot state> · <effort or kept label> · p=<tier>/<work>`, such as `L1 @midl · medium · p=0.66/0.72`.
- A level with no model shows the slot, as `L0 small model unset`, `L1 middle model unset` or `L2 large model unset`.
- A kept label replaces the effort: `caller effort` when the item's own `effort` applies, `config effort` when a thinking level comes from omp's settings or the role, and `no model patterns` when the spawn has none.
- Who answered follows: `typesafe`, `openai` or `google` on the direct path, or `openrouter` on the gateway path. Then the model its reply names and the token counts, as in ` · typesafe jev-1.14.0 · 812/9 tok`. The model and the token counts are left out when the reply lacks them. Google's reply names no model, so its entry reads ` · google · 430/0 tok`.
- After a fallback, the entry ends with the attempt that failed and its reason, as in ` · openrouter openai/gpt-6-luna-decisions-20261006 · 488/0 tok · openai HTTP 429`.
- A skipped entry reads `task <n>: skipped, <reason>`. After both attempts fail, the reason names each one with its own reason, as in `skipped, openai HTTP 503, openrouter timeout`.
- A spawn can print a second line for the same item. That later line holds.
- With `task.batch` off, or with the plugin disabled, no line appears.

### Reasons routing is off

A closed gate skips every item the scope covers with the same reason:

- `tool call timeout <n> ms leaves <m> ms to route`: omp's tool call timeout leaves under 1 s to score. Set `extensionHandlers.toolCallTimeoutMs` to 3000 or more.
- `settings unreadable`: the plugin cannot read its settings, omp's model roles, task model overrides or disabled agents.
- `<setting> not valid: run setup`: a stored `provider`, `gateway` or `scope` holds a value outside its list. Set it again with the tool or its command.
- `models not valid: run setup`: the stored `models` is not valid. Write a valid text with the tool's `models` input.
- `key unset`: no path the `provider` and `gateway` settings allow has a key.

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

- `timeout`: the company gave no answer in time. Scoring has 10 s per batch.
- `HTTP <status>`: the company returned an error. `HTTP 400` can mean that OpenRouter does not know the model name in `models`. `HTTP 401` means it refused the key. Google's own API answers a bad key with `HTTP 400`, as [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) says.
- `network error`: the request could not connect.
- `bad reply`: the reply held no valid score.
- `failed`: any other error.

These last reasons point to the company, its key or the network.

### Routing check

- A check spawns one `task` item with no `agent` and the text "Reply with the single word ok."
- A good result is a routed entry with a level, a role or slot state, and an effort or kept label. The entry names no skip reason.

## Limits

- Never take, show or repeat a key. If a key reaches the chat, do not store it, and tell the person to rotate it.
- Change a setting only when the person asked for it or agreed.
- A routing check spawns one small task and spends a little usage, so ask before it.
- Pass `models` only at the person's request, with every entry the person keeps.

## When you finish

Say what is set, what you changed and what still keeps routing off. Include no key and no home-directory path.
