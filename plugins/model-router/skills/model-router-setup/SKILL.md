---
name: model-router-setup
description: >
  Use when the user wants to set up or configure model-router in Claude Code,
  to choose its provider or scope, to add a TypeSafe or OpenRouter key, to find
  out why routing is off, or to check that routing works.
---

# model-router setup for Claude Code

model-router scores each routed Agent call with Jev, on TypeSafe or OpenRouter. It sets the subagent's model and effort. This setup picks the provider and the scope, checks the keys, lists the reasons routing is off, and ends with a routing check.

## Rules

- Ask one question per screen with `AskUserQuestion`. If it is missing, ask numbered text questions.
- Make every provider and scope choice through the `mcp__model-router__config` tool. Call it with the setting name only.
- The plugin asks the person in its own dialog and writes the choice. Never ask your own question for these choices. Never pass a value to the tool.
- Run the setup the same way on the first run and on every re-run.
- Never take a key through a button or a free-text answer to your own question. If a key arrives, do not repeat or store it. Tell the user to rotate it.
- Never display a key or any other credential.
- Ask before you create a missing file. Create a JSON file holding an empty object.
- Propose no models.
- If the tool returns `<setting> unchanged: no answer from the dialog`, say that no dialog answered. Name the command the user can type: `/model-router:provider <value>` or `/model-router:scope <value>`.
- Skip a step the user declines. Name the skipped steps in the closing summary.
- Keep each message short. Show raw output only when the user needs it.

## Step 1. Read the settings and the key status

1. Call the tool with no setting.
2. Show the lines it returns.

The tool returns the `provider` line, the `scope` line, and `<provider> key: set` or `<provider> key: unset` for each provider the `provider` value allows. An unknown `provider` value counts as `typesafe`. An unknown `scope` value counts as `core`.

## Step 2. Provider

1. Call the tool with setting `provider`.
2. Report the line it returns.

The [Options](../../README.md#options) section of the README lists the values. If the line reads `provider unchanged: already <value>`, the user kept the current value.

## Step 3. Keys

1. Call the tool with no setting.
2. Note each provider that reports `key: unset`.
3. For each such provider, ask the key question below, once.
4. After button 1, 2 or 3, wait until the user says the key is in place.
5. Call the tool with no setting and report the key line.
6. If the key is still unset, say so in one line.

Skip this step when every allowed provider reports `key: set`. The tool takes no key in Claude Code, so the person adds it.

The key question has four buttons:

1. "I will add it in the plugin settings". Mark it recommended. The mark applies to this question only. Tell the user where that dialog is: `/plugin` in the terminal, or the plugin's gear icon in VS Code.
2. "Write it to the settings files myself". Name the variable and the file, and wait. The variable is `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`. The file is the user settings file, and the variable goes in its `env` block. Name the file by its full path.
3. "Same, open the files for me". Do what button 2 does. Also open the file with the system opener: `open` on macOS, `xdg-open` on Linux, `start` on Windows.
4. "Do nothing". Skip the key.

A variable in the settings file reaches the environment of every process Claude Code starts. Say so after button 2 or 3.

If a key is missing for every allowed provider, say that every call skips with `key unset` until one exists. With `auto` or `openrouter-first` and one key, say that its provider scores alone.

## Step 4. Scope

1. Call the tool with setting `scope`.
2. Report the line it returns.

The [Which calls are routed](../../README.md#which-calls-are-routed) section of the README says what each value routes.

## Step 5. List the reasons routing is off

Check each reason below. Report every reason that holds, not only the first.

- The plugin is disabled in `/plugin`. No line appears.
- Permission rules deny the Agent call. No line appears.
- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is set. Claude Code ignores the model the plugin picks.
- `CLAUDE_CODE_EFFORT_LEVEL` is set. It outranks the effort the plugin picks.
- The call passes through under the chosen scope, as [Which calls are routed](../../README.md#which-calls-are-routed) lists.

For each reason that holds, tell the user which setting to change, and where. This skill changes none of them.

## Step 6. Routing check

1. If the plugin was just enabled or installed, or a key changed, ask the user to run `/reload-plugins`. Then return to this step.
2. Ask the routing-check question with the buttons "Check" and "Skip".
3. On Skip, record "routing check: skipped" and go to the closing summary.
4. On Check, spawn one Agent call with no `subagent_type`, no `model` and no `name`, and the prompt "Reply with the single word ok."
5. Read the dim log line, which starts with `model-router`. If no line appears, check the reasons in step 5.
6. Check that the line names a level, a model and an effort.
7. If the line names a skip reason, stop and report it.
8. If Claude Code shows the model the subagent ran on, check it against the line.
9. Report the result in one line.

The routing-check question reads: "To check routing I will spawn one small subagent. It spends a little model usage."

Read the line as follows:

- The model matches the model the line names.
- After a fallback, it ends with ` · via <provider> (<first provider> <reason>)`.
- `key unset` points to step 3.
- `timeout`, `network error` or an HTTP status points to the provider or the network.
- After two attempts the line names each provider with its reason, for example `skipped, typesafe HTTP 503, openrouter timeout`.

## Closing summary

List what the setup changed. List the reasons that still turn routing off, and the skipped steps. Include no key and no home-directory path.
