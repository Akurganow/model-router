---
name: model-router-setup
description: >
  Use when the user wants to set up or configure model-router in Claude Code,
  to choose its provider, to add an OpenRouter key, to find out why routing is
  off, or to check that routing works.
---

# model-router setup for Claude Code

model-router scores each routed Agent call with Jev, on TypeSafe or OpenRouter. It sets the subagent's model and effort. This interview asks which provider scores each call and checks its keys. It finds the reasons routing is off, and it ends with a routing check.

## Rules

- Ask one question at a time. Wait for the answer before the next step.
- Write nothing without consent. Show the target and the exact change, ask, and wait for a yes.
- Never ask for the TypeSafe key or the OpenRouter key in chat. Never display either key or any other credential.
- Use Claude Code's own settings and documentation to read and change settings. This skill names what to check, not how.
- Change only the `provider` option.
- Skip a step the user declines. Name the skipped steps in the closing summary.
- Keep each message short. Show raw output only when the user needs it.

The skill changes at most one setting: the `provider` option. The user changes it with `/model-router:provider <value>` or in `/config`.

## Step 1. Choose the provider

The `provider` option names the providers that may score a call, in order:

- `typesafe` (default): TypeSafe only.
- `openrouter`: OpenRouter only.
- `auto`: TypeSafe, then OpenRouter when TypeSafe fails.
- `openrouter-first`: OpenRouter, then TypeSafe when OpenRouter fails.

With `auto` or `openrouter-first` and one key, that key's provider scores alone. With both keys, one call may reach both companies. Claude Code ignores `pluginConfigs` in project and local settings, so a project cannot change `provider`.

1. Ask the user to run `/model-router:provider` with no value and to share the line it prints.
2. Check which providers have a key, as step 2 does. Read no value.
3. Show the current value and its order. An unknown value counts as `typesafe`.
4. Ask which value the user wants. When both providers have a key, list `auto` first as the suggested value.
5. If the user keeps the current value, go to step 2.
6. Show the change: the `provider` option, from the current value to the new one.
7. Ask for consent.
8. After a yes, ask the user to run `/model-router:provider <value>`.
9. Ask for the line it prints. It names the new value, or `provider unchanged: <reason>`.
10. If the value is unchanged, ask the user to set `provider` in `/config`.

## Step 2. Check the keys

The plugin reads keys only for the providers the chosen value allows. For each one it reads the option first, then the variable. Check the variables only. Read no value.

1. For each provider the value allows, check whether its variable is set: `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`.
2. Say that this skill cannot check the `api_key` and `openrouter_api_key` options, because Claude Code keeps them as sensitive values.
3. If an allowed provider has no variable set, ask whether the user set its option.
4. If no allowed provider has a key, say that every call skips with `key unset` until one exists.
5. If `auto` or `openrouter-first` finds one key, say that its provider scores alone.
6. For each missing key, offer the two routes: set its option in `/config`, or set its variable in the `env` block of the user settings.
7. Ask the user to say when the key is in place. Then check again.

## Step 3. List the reasons routing is off

Check each reason below. The keys are checked in step 2. Report every reason that holds, not only the first.

- The plugin is disabled in `/plugin`. No line appears.
- Permission rules deny the Agent call. No line appears.
- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is set. Claude Code ignores the model the plugin picks.
- `CLAUDE_CODE_EFFORT_LEVEL` is set. It outranks the effort the plugin picks.

For each reason that holds, tell the user which setting to change, and where. This skill changes none of them. The only write is the provider in step 1.

## Step 4. Routing check

1. If the plugin was just enabled or installed, or a key changed, ask the user to run `/reload-plugins`. Then return to this step.
2. Ask: "To check routing I will spawn one small subagent. It spends a little model usage. May I?"
3. On a no, record "routing check: skipped" and go to the closing summary.
4. Spawn one Agent call with no `subagent_type`, no `model` and no `name`, and the prompt "Reply with the single word ok."
5. Read the dim log line. It starts with `model-router`. If no line appears, check the reasons in step 3.
6. Check that the line names a level, a model and an effort. After a fallback, it ends with ` · via <provider> (<first provider> <reason>)`.
7. If the line names a skip reason, stop and report it. `key unset` points to step 2. `timeout`, `network error` or an HTTP status points to the provider or the network. After two attempts the line names each provider with its reason, for example `skipped, typesafe HTTP 503, openrouter timeout`.
8. If Claude Code shows the model the subagent ran on, check that it matches the model the line names.
9. Report the result in one line.

## Closing summary

List what the interview changed, and where each change went. List the reasons that still turn routing off, and the skipped steps. Include no key value and no home-directory path.
