---
name: model-router-setup
description: >
  Use when the user wants to set up or configure model-router in Claude Code,
  to choose its provider or scope, to add a TypeSafe or OpenRouter key, to find
  out why routing is off, or to check that routing works. It finds what already
  holds and does only what is missing.
---

# model-router setup for Claude Code

model-router scores each routed Agent call with Jev, on TypeSafe or OpenRouter. It sets the subagent's model, one of haiku, sonnet or opus, and its effort.

## What set up means

Routing works when all of these hold:

- The plugin is enabled.
- A scoring key exists for a provider the `provider` setting allows.

The person may also choose:

- `provider`: which providers score a call, and in which order.
- `scope`: which Agent calls the plugin routes.

## Your job

Find out which of these already hold, with the `mcp__model-router__config` tool and Claude Code's own means. Tell the person in one message what is set and what is missing. Do only what is missing or what the person asks to change, and do it yourself once the person agrees. Never ask the person to repeat a step that is done, and never ask for the install commands. Ask the person with the question tool Claude Code gives you, never as plain text in your reply. If the session has no such tool, ask one question per message.

## Facts

### The config tool

- The tool is `mcp__model-router__config`. It takes one optional input, `setting`.
- With no input it prints a `provider` line, a `scope` line, and one `<provider> key: set` or `<provider> key: unset` line for each provider the `provider` value allows.
- A provider line looks like `provider: auto (typesafe, then openrouter)`. A scope line looks like `scope: core`.
- A key counts as set when its plugin option or its environment variable holds a non-blank value.
- The tool never returns a key, its length or any part of it.
- With `setting` set to `provider` or `scope`, the plugin opens its own dialog. The person picks a value, and the plugin writes it. The reply is the new setting line.
- Pass no value to the tool. The person chooses in the dialog.
- The dialog writes nothing for the current value, a dismissed dialog or free text. It also writes nothing where no dialog can open, such as `claude -p`.
- Reply `<setting> unchanged: already <value>` means the person kept the current value.
- Reply `<setting> unchanged: no answer from the dialog` means no dialog answered. The person can type `/model-router:provider <value>` or `/model-router:scope <value>` at their own prompt. A command writes only when typed there.
- Reply `<setting> unchanged: the answer was not one of the offered values` means the dialog returned something else. Nothing was written.
- Reply `Permission rules deny this tool, so nothing was read or changed.` means the person's permission rules deny the tool.
- Both commands print the current value when run with no value. A value outside the list prints the allowed ones.

### Settings

- `provider` takes `typesafe` (the default), `openrouter`, `auto` or `openrouter-first`.
  - `typesafe` scores on TypeSafe only. `openrouter` scores on OpenRouter only.
  - `auto` tries TypeSafe, then OpenRouter when TypeSafe fails.
  - `openrouter-first` tries OpenRouter, then TypeSafe when OpenRouter fails.
  - A stored value outside these four counts as `typesafe`.
  - With `auto` or `openrouter-first` and only one key set, that key's provider scores alone.
- `scope` takes `core` (the default) or `extended`. A stored value outside these two counts as `core`.
  - Under `core`, the plugin routes a call to the built-in agents `general-purpose`, `claude`, `Explore` and `Plan`. A call with no `subagent_type` counts as `general-purpose`.
  - Under `extended`, it routes every Agent call that passes no `model` and no `name`, a fork excepted. That includes user, project and plugin agents.
  - Under `extended`, the routed model and effort replace the ones an agent's definition sets, and the agent's description and task text go to the provider.
- Claude Code has no per-level model setting. The plugin picks haiku for level 0, sonnet for level 1 and opus for level 2.
- Claude Code ignores plugin options in project and local settings. Only the user's own settings and commands change `provider` and `scope`.

### Keys

- The TypeSafe key is the plugin option `api_key` or the variable `TYPESAFE_API_KEY`. The OpenRouter key is the option `openrouter_api_key` or the variable `OPENROUTER_API_KEY`. The option wins when both exist.
- The plugin reads a key only for a provider the `provider` value allows. Each key goes only to its own provider.
- The desktop app cannot set a plugin's key yet, and a saved key can read back as empty after a restart. The workaround is the variable in the `env` block of the user settings file, `~/.claude/settings.json`.
- A variable in that file reaches the environment of every process Claude Code starts, and the key sits there in plain text. Say so when the person chooses it.
- The plugin reads a key when it loads, so a key change reaches it after the plugin reloads or in a new session.
- The tool takes no key. The person adds it themselves.
- With only an OpenRouter key and `provider` still `typesafe`, every call skips with `key unset`. The person sets `provider` to `openrouter`, `auto` or `openrouter-first`.
- With no key for any allowed provider, every call skips with `key unset`.

### Reasons routing is off

More than one can hold. Report every one that holds.

- The plugin is disabled. No line appears.
- The person's permission rules deny the Agent call. No line appears.
- The call passes through under the chosen scope: it names a `model` or a `name`, it is a fork, or it is an agent the scope does not route. A user, project or plugin agent passes through under `core`, even when it takes a built-in's name. A workflow script's agents, teammates, resumed agents and agents another plugin spawns also pass through. No line appears.
- The environment variable `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is set. Claude Code ignores the model the plugin picks. Only the person unsets it.
- The environment variable `CLAUDE_CODE_EFFORT_LEVEL` is set. It outranks the plugin's effort, and the line shows `env effort`.
- The person's organization `availableModels` list can replace the pick with another model.
- The call passes `effort`. The plugin keeps it, and the line shows `caller effort`.
- A routed call skips and logs `skipped, <reason>`. The reasons are below.

### The routed line

- Each routed call logs one dim line that starts with `model-router`, for example `model-router L0 haiku · medium · p=0.91/0.62 · jev jev-1.14.0 · 812/9 tok`.
- It holds the level (`L0`, `L1` or `L2`), the model, the effort, the probability of each chosen level, the Jev model and the token counts. The Jev model and token counts are left out when the reply lacks them.
- `caller effort` or `env effort` takes the place of the effort when a kept effort applies.
- A call that Claude Code then refuses adds a second line, `denied`.
- After a fallback to the second provider, the line ends with ` · via <provider> (<first provider> <reason>)`, for example ` · via openrouter (typesafe HTTP 503)`.
- After both providers fail, the line names each, for example `skipped, typesafe HTTP 503, openrouter timeout`.
- A skipped call runs unchanged.

### Skip reasons

- `key unset`: no provider the `provider` value allows has a key. Add one as the Keys facts say.
- `bad reply`: the provider answered without a valid score for one of the two questions.
- `timeout`: a first attempt got no answer in 2 s, or the call got no decision in the 8 s limit. The network or provider is slow.
- `cancelled`: Claude Code abandoned the call before the answer came, for example after an interrupt.
- `network error`: every attempt failed before an answer came. An organization fetch policy that refuses openrouter.ai shows as this too.
- `HTTP <status>`: the provider answered with that status. `HTTP 401` means the provider rejected the key. `HTTP 429` and `HTTP 503` mean the provider refused or failed on every attempt.
- `rejected request`: the SDK refused the request itself.
- `failed`: any other error.

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
- Never pass a value to the config tool. The person's choice comes from its dialog or their own command.

## When you finish

Say what is set, what you changed and what still keeps routing off. Include no key and no home-directory path.
