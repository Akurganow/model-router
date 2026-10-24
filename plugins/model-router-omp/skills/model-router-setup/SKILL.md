---
name: model-router-setup
description: >
  Use when the user wants to set up or configure model-router in Oh My Pi (omp),
  to choose its provider or scope, to add a TypeSafe or OpenRouter key, to find
  out why routing is off, or to check that routing works.
---

# model-router setup for Oh My Pi

model-router scores each routed `task` spawn with Jev, on TypeSafe or OpenRouter. It gives the agent the `smol` role for lookup work, or the `slow` role for open judgment. This setup picks the provider and the scope, checks the keys, lists the reasons routing is off, and ends with a routing check.

## Rules

- Ask one question per screen with `ask`. If it is missing, ask numbered text questions.
- Make every provider and scope choice through the `model_router_config` tool. Call it with the setting name only.
- The plugin asks the person in its own dialog and writes the choice. Never ask your own question for these choices. Never pass a value to the tool.
- Run the setup the same way on the first run and on every re-run.
- Never take a key through a button or a free-text answer to your own question. If a key arrives, do not repeat or store it. Tell the user to rotate it.
- Never display a key or any other credential.
- Ask before you create a missing file. Create a JSON file holding an empty object.
- Propose no models. Assigning the `smol` and `slow` roles is the user's job.
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

The [Provider](../../README.md#provider) section of the README lists the values. If the line reads `provider unchanged: already <value>`, the user kept the current value. If the output adds `A project value for provider overrides it.`, tell the user.

## Step 3. Keys

1. Call the tool with no setting.
2. Note each provider that reports `key: unset`.
3. For each such provider, ask the key question below, once.
4. On button 1, call the tool with `typesafe_key` or `openrouter_key`.
5. If the tool returns `<provider> key: saved, checking`, call the tool again with no setting.
6. Continue only when that call reports `<provider> key: set`.
7. If the tool returns `<provider> key not saved`, or the key is still unset, say so in one line.
8. Ask the key question again, with button 1 replaced by the fallback button.

Skip this step when every allowed provider reports `key: set`. Button 1 stores the key in omp's credential store.

The key question has four buttons:

1. "Enter the key now". Mark it recommended. The mark applies to this question only.
2. "Write it to the settings files myself". Name the variable and the file, and wait. The variable is `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`. The file is the `.env` file in omp's agent directory. Name the file by its full path.
3. "Same, open the files for me". Do what button 2 does. Also open the file with the system opener: `open` on macOS, `xdg-open` on Linux, `start` on Windows.
4. "Do nothing". Skip the key.

The fallback button reads "Log in to the provider". Tell the user to run `/login typesafe` or `/login openrouter`.

After button 2 or 3, wait until the user says the key is in place. Then call the tool with no setting and report the key line.

Without a UI, offer buttons 2 to 4 as numbered text.

If a key is missing for every allowed provider, say that every call skips with `key unset` until one exists. With `auto` or `openrouter-first` and one key, say that its provider scores alone.

## Step 4. Scope

1. Call the tool with setting `scope`.
2. Report the line it returns.

The [Scope](../../README.md#scope) section of the README says what each value routes. If the output adds `A project value for scope overrides it.`, tell the user.

## Step 5. List the reasons routing is off

Check each reason below. Report every reason that holds, not only the first.

- The plugin is disabled. No line appears.
- `task.batch` is off. The call has no `tasks` list, so the plugin prints no line.
- A batch gate is closed, as [Gate reasons](../../README.md#gate-reasons) lists. Every item skips with the gate's reason.
- An item check fails, as [Item reasons](../../README.md#item-reasons) lists. That item skips with its own reason.
- Neither `smol` nor `slow` resolves. The reason is `no @smol or @slow model`.

Check whether `smol` and `slow` resolve, not only whether they are set. An unset role can still resolve through omp's `default` role or its built-in list. Level 0 needs `smol`. Level 2 needs `slow`.

For each reason that holds, tell the user which setting to change, and where. This skill changes none of them.

## Step 6. Routing check

1. If the plugin was just enabled or installed, or a key variable changed, ask the user to restart omp. Then return to this step.
2. Ask the routing-check question with the buttons "Check" and "Skip".
3. On Skip, record "routing check: skipped" and go to the closing summary.
4. On Check, spawn one `task` item with no `agent` and the text "Reply with the single word ok."
5. Read the batch line, which starts with `model-router`. If no line appears, check `task.batch` and that the plugin is enabled.
6. Check that the entry names a level and either a role or `no change`.
7. If the entry names a skip reason, stop and report it.
8. If omp records the model the subagent ran on, check it against the entry.
9. Report the result in one line.

The routing-check question reads: "To check routing I will spawn one small subagent. It spends a little model usage."

Read the entry as follows:

- The model matches the role the entry names. For `no change`, it is the model omp uses without routing.
- After a fallback, it ends with ` · via <provider> (<first provider> <reason>)`.
- `key unset` points to step 3.
- A gate or item reason points to step 5.
- `timeout`, `network error` or an HTTP status points to the provider or the network.
- After two attempts the entry names each provider with its reason, for example `skipped, typesafe HTTP 503, openrouter timeout`.

## Closing summary

List what the setup changed. List the reasons that still turn routing off, and the skipped steps. Include no key and no home-directory path.
