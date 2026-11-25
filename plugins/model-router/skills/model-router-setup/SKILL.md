---
name: model-router-setup
description: >
  Use when the user wants to set up or configure model-router in Claude Code,
  to choose its provider, gateway, scope or scoring models, to add a TypeSafe, OpenAI, Google, Perplexity or OpenRouter key, to find
  out why routing is off, or to check that routing works. It finds what already
  holds and does only what is missing.
---

# model-router setup for Claude Code

model-router scores each routed Agent call with the decision model of the chosen provider, on the provider's own API or through OpenRouter. It sets the subagent's model, one of haiku, sonnet or opus, and its effort.

## What set up means

Routing works when all of these hold:

- The plugin is enabled.
- A scoring key exists for a path the `provider` and `gateway` settings allow.

The person may also choose:

- `provider`: whose model scores a call. It takes `typesafe`, `openai`, `google` or `perplexity`.
- `gateway`: how OpenRouter is used to reach the provider.
- `scope`: which Agent calls the plugin routes.
- `models`: the scoring model of each provider. A provider with no entry uses its default model.

## Your job

Find out which of these already hold, with the `mcp__model-router__config` tool and Claude Code's own means. Tell the person in one message what is set and what is missing. Do only what is missing or what the person asks to change, and do it yourself once the person agrees. Never ask the person to repeat a step that is done, and never ask for the install commands. Ask the person with the question tool Claude Code gives you, never as plain text in your reply. If the session has no such tool, ask one question per message.

When you find what already holds, also check the stored field names. Follow these steps in order:

1. Read only the field names stored under `pluginConfigs["model-router@<marketplace>"].options` in the user `settings.json`.
2. Compare them with the fields the plugin declares: `provider`, `gateway`, `scope`, `models`, `api_key`, `openai_api_key`, `google_api_key`, `perplexity_api_key` and `openrouter_api_key`.
3. Tell the person each stored field that the plugin does not declare.
4. Never print the value of a key field, or of an unknown field named like a key or a secret.
5. Say only that such a field holds a value.
6. When an unknown field's name resembles a declared one and holds a value, propose the move.
7. Name the declared field and the text it would write, for example `model` against `models`.
8. For a key field, name the declared field and ask the person to enter the key there.
9. On the person's word, write the declared field, then remove the old field.
10. Write `models` with `mcp__model-router__config`, and any other field in `settings.json`.
11. On the person's word, remove only an unknown field that resembles no declared one.
12. Write nothing else in the file.

When a choice has more than four values, ask with three values and `more` at a time, the current value first; `more` on the last page goes back to the first.

When the person wants to choose the provider, follow these steps in order:

1. Call the tool with no setting, and read the settings and the key lines.
2. Ask which provider's model scores, and give the labels from the Settings facts.
3. Ask how OpenRouter is used, before any write, and give the labels from the Settings facts.
4. On the person's word, call the tool once with `setting` set to `gateway` and once with `provider`. Set `gateway` first. When the stored `gateway` is `openrouter`, set `provider` first.
   - Make the second call only after the first setting's line shows the agreed value. If it does not, stop and tell the person.
   - Between the two writes the plugin routes by the middle pair. This order uses no key that neither the old pair nor the new pair uses.
5. Name the key the choice needs, and say where it comes from, as the Keys facts say.
6. Call the tool with no setting, and confirm the lines.

When the `models` line ends with `(not valid: <entry>)`, repair it. Follow these steps in order:

1. Name the entry to the person, and ask for a corrected text.
2. On the person's word, call the tool with `models` set to the corrected text, in the short form, with the entries in the order the line shows them. When a kept name holds a comma, a quote or a brace, write the whole value as a JSON object.
3. Read the reply. `models unchanged: not valid: <entry>` means nothing was written. Name the entry to the person, and ask again.
4. Call the tool with no input, and confirm the `models` line.

When the person wants another scoring model for one provider, follow these steps in order:

1. Call the tool with no input, and read the `models` line and the lines under it.
2. Ask the person for the provider and the model name. Model names come from the provider's API documentation.
3. Take the text the line shows, keep every other entry, and set or replace that provider's entry. Write the short form, with the entries in the order the line shows them. When a kept name holds a comma, a quote or a brace, write the whole value as a JSON object.
4. On the person's word, call the tool with `models` set to the whole new text.
5. Read the reply. `models unchanged: not valid: <entry>` means nothing was written. Name the entry to the person.
6. Call the tool with no input, and confirm the `models` line.
7. When an entry is `jev-preview` and `gateway` is `openrouter` or `openrouter-first`, tell the person what [The model name on each path](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-model-name-on-each-path) says about that name.

## Facts

### The config tool

- The tool is `mcp__model-router__config`. It takes two optional inputs, `setting` and `models`.
- With no input it prints a `provider` line, a `gateway` line, a `scope` line, the `models` lines, and one key line for each path the `gateway` value allows, in order, as in `typesafe key: set`, `openai key: unset` or `openrouter key: unset`.
- A provider line looks like `provider: typesafe`. A gateway line looks like `gateway: auto (typesafe, then openrouter)`. A scope line looks like `scope: core`.
- A key counts as set when its plugin option or its environment variable holds a non-blank value.
- The tool never returns a key, its length or any part of it.
- With `setting` set to `provider`, `gateway` or `scope`, the plugin opens its own dialog. The person picks a value, and the plugin writes it. The reply is the new setting line.
- Pass no value with `setting`. The person chooses in the dialog.
- With `models` set to a string, the plugin writes that text at once, with no dialog. Do this only at the person's request.
- The dialog writes nothing for the current value, a dismissed dialog or free text. It also writes nothing where no dialog can open, such as `claude -p`.
- Reply `models unchanged: not valid: <entry>` means the text is not valid, and nothing was written.
- Reply `<setting> unchanged: already <value>` means the person kept the current value.
- Reply `<setting> unchanged: no answer from the dialog` means no dialog answered. The person can type `/model-router:provider <value>`, `/model-router:gateway <value>` or `/model-router:scope <value>` at their own prompt. A command writes only when typed there.
- Reply `<setting> unchanged: the answer was not one of the offered values` means the dialog returned something else. Nothing was written.
- Reply `Permission rules deny this tool, so nothing was read or changed.` means the person's permission rules deny the tool.
- All three commands print the current value when run with no value. A value outside the list prints the allowed ones.

### Settings

- `provider` takes `typesafe` (the default), `openai`, `google` or `perplexity`.
  - `typesafe - Jev from TypeSafe`
  - `openai - OpenAI's decision model`
  - `google - Google's decision model`
  - `perplexity - Perplexity's decision model`
  - [What each company does with the text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-each-company-does-with-the-text) says more.
- `gateway` takes `direct` (the default), `auto`, `openrouter-first` or `openrouter`.
  - `direct - the provider's own API only`
  - `auto - the provider's own API, then OpenRouter if it fails`
  - `openrouter-first - OpenRouter, then the provider's own API if it fails`
  - `openrouter - OpenRouter only`
  - With `auto` or `openrouter-first` and only one key set, that key's path scores alone.
  - Only some failures reach the second path: [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) lists them.
- Claude Code hands the plugin an option's default in place of a stored value outside the option's list. So the tool then prints the default, and no setup line shows.
- `scope` takes `core` (the default) or `extended`.
  - `core - the default agents only`
  - `extended - also other agents, as the README lists`
  - Under `core`, the plugin routes a call to the built-in agents `general-purpose`, `claude`, `Explore` and `Plan`. A call with no `subagent_type` counts as `general-purpose`.
  - Under `extended`, it routes every Agent call that passes no `model` and no `name`, a fork excepted. That includes user, project and plugin agents.
  - Under `extended`, the routed model and effort replace the ones an agent's definition sets, and the agent's description and task text go to the company that scores.
- `models` takes the short form, such as `{typesafe:jev-latest, openai:gpt-6-luna}`, or a JSON object. [The `models` setting](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-models-setting) lists the forms, the defaults, the OpenRouter names and when a value is not valid.
- A `models` value that is not valid prints as `models: <text> (not valid: <entry>)`, and it stops routing. A call the scope routes skips with `models not valid: run setup`. A call that passes through, as [Which calls are routed](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/README.md#which-calls-are-routed) lists, shows no line.
- A model name goes as written on the provider's own API, and that API's documentation lists the names. [The model name on each path](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-model-name-on-each-path) says what OpenRouter does with a name.
- Claude Code has no per-level model setting. The plugin picks haiku for level 0, sonnet for level 1 and opus for level 2.
- Claude Code ignores plugin options in project and local settings. Only the user's own settings and commands change `provider`, `gateway` and `scope`.

### Keys

- Each key is a plugin option or a variable. The option wins when both exist.
  - The TypeSafe key: the option `api_key` or the variable `TYPESAFE_API_KEY`. Get it at https://console.typesafe.ai/keys.
  - The OpenAI key: the option `openai_api_key` or the variable `OPENAI_API_KEY`. Get it at https://platform.openai.com/api-keys.
  - The Google key: the option `google_api_key` or the variable `GEMINI_API_KEY`. Get it at https://aistudio.google.com/docs/api-key. The plugin does not read `GOOGLE_API_KEY`.
  - The Perplexity key: the option `perplexity_api_key` or the variable `PERPLEXITY_API_KEY`. Get it at https://console.perplexity.ai.
  - The OpenRouter key: the option `openrouter_api_key` or the variable `OPENROUTER_API_KEY`. Get it at https://openrouter.ai.
- The key of the chosen provider serves the direct path, and the OpenRouter key serves the gateway path.
- The plugin reads a key only for a holder the `provider` and `gateway` values allow. Each key goes only to the company that issued it.
- The desktop app cannot set a plugin's key yet, and a saved key can read back as empty after a restart. The workaround is the variable in the `env` block of the user settings file, `~/.claude/settings.json`.
- A variable in that file reaches the environment of every process Claude Code starts, and the key sits there in plain text. Say so when the person chooses it.
- The plugin reads a key when it loads, so a key change reaches it after the plugin reloads or in a new session.
- The tool takes no key. The person adds it themselves.
- With only an OpenRouter key and `gateway` still `direct`, every call skips with `key unset`. The person sets `gateway` to `openrouter`, `auto` or `openrouter-first`.
- A key of a provider other than the chosen one opens no path. With no key for an allowed path, every call skips with `key unset`. The person then sets the provider that holds the key, or adds a key for an allowed path.

### Reasons routing is off

More than one can hold. Report every one that holds.

- The plugin is disabled. No line appears.
- The person's permission rules deny the Agent call. No line appears.
- The call passes through under the chosen scope: it names a `model` or a `name`, it is a fork, or it is an agent the scope does not route. A user, project or plugin agent passes through under `core`, even when it takes a built-in's name. A workflow script's agents, teammates, resumed agents and agents another plugin spawns also pass through. No line appears.
- The environment variable `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is set. Claude Code ignores the model the plugin picks. Only the person unsets it.
- The environment variable `CLAUDE_CODE_EFFORT_LEVEL` is set. It outranks the plugin's effort, and the line shows `env effort`.
- The person's organization `availableModels` list can replace the pick with another model.
- The call passes `effort`. The plugin keeps it, and the line shows `caller effort`.
- `models` is not valid. A call the scope routes skips with `models not valid: run setup`.
- A routed call skips and logs `skipped, <reason>`. The reasons are below.

### The routed line

- Each routed call logs one dim line that starts with `model-router`, for example `model-router L0 haiku · medium · p=0.91/0.62 · typesafe jev-1.14.0 · 812/9 tok`.
- It holds the level (`L0`, `L1` or `L2`), the model, the effort and the probability of each chosen level.
- `caller effort` or `env effort` takes the place of the effort when a kept effort applies.
- A call that Claude Code then refuses adds a second line, `denied`.
- Who answered follows, `typesafe`, `openai`, `google`, `perplexity` or `openrouter`, then the model its reply names and the token counts, as in ` · typesafe jev-1.14.0 · 812/9 tok`. The model and the token counts are left out when the reply lacks them. Google's reply names no model, so its line reads ` · google · 430/0 tok`.
- After a fallback, the line ends with the attempt that failed and its reason, as in ` · openrouter openai/gpt-6-luna-decisions-20261006 · 488/0 tok · openai HTTP 429`.
- After both attempts fail, the line names each, for example `skipped, openai HTTP 503, openrouter timeout`.
- A skipped call runs unchanged.

### Skip reasons

- `key unset`: no path the `gateway` value allows has a key. Add one as the Keys facts say.
- `models not valid: run setup`: the stored `models` is not valid. Write a valid text, as the steps above say.
- `bad reply`: the company answered without a valid score for one of the two questions.
- `timeout`: a first attempt got no answer in 5 s, or the call got no decision in the 10 s limit. The network or the company is slow.
- `cancelled`: Claude Code abandoned the call before the answer came, for example after an interrupt.
- `network error`: every attempt failed before an answer came. An organization fetch policy that refuses openrouter.ai shows as this too.
- `HTTP <status>`: the company answered with that status. `HTTP 401` means the company rejected the key. Google's own API answers a bad key with `HTTP 400`, as [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) says. `HTTP 429` and `HTTP 503` mean the company refused or failed on every attempt. `HTTP 400` can also mean that OpenRouter does not know the model name in `models`. Under `openrouter-first` the provider's own API is then not asked.
- `failed`: any other error.

### A retired provider value

Run these steps after an update when the tool prints `gateway: direct` and the person used OpenRouter before.

Earlier versions took `auto`, `openrouter-first` and `openrouter` as values of `provider`. They are values of `gateway` now. Do these steps in this order:

1. Ask the person which `provider` value they chose before the update.
   The tool cannot show the stored value, as the Settings facts say.
2. Propose the pair that gives the same requests as before:
   - `auto` becomes `provider` `typesafe` with `gateway` `auto`.
   - `openrouter-first` becomes `provider` `typesafe` with `gateway` `openrouter-first`.
   - `openrouter` becomes `provider` `typesafe` with `gateway` `openrouter`.
3. On the person's word, call the tool with `setting` set to `gateway`.
   The person picks the agreed value in the dialog. Where no dialog opens, the person types `/model-router:gateway <value>`.
4. Ask the person to type `/model-router:provider typesafe` at their own prompt, so the retired value leaves the settings.
   The dialog cannot make this change: it answers `<setting> unchanged: already <value>` for the value the plugin already gets.
5. Call the tool with no setting and check the gateway line.

### The routing check

- A routing check is one Agent call with no `subagent_type`, no `model` and no `name`, and the prompt "Reply with the single word ok."
- Run it after the plugin has loaded with its key.
- A good result is a line that names a level, a model and an effort.
- No line means a reason above holds. A `skipped` line names the reason.

For the person: the plugin README at plugins/model-router/README.md has the same options, routing rules and troubleshooting.

## Limits

- Never take, show or repeat a key. If a key arrives in the chat, do not store it, and tell the person to rotate it.
- Change a setting only when the person asked for it or agreed.
- A routing check spawns one small task and spends a little usage, so ask before it.
- Never pass a value with `setting`. The person's choice comes from its dialog or their own command.
- Pass `models` only at the person's request, with every entry the person keeps.

## When you finish

Say what is set, what you changed and what still keeps routing off. Include no key and no home-directory path.
