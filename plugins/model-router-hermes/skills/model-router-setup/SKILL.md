---
name: model-router-setup
description: Use to set up model-router in Hermes Agent: turn the delegation backend on, choose its provider, add a TypeSafe or OpenRouter key, assign the small, middle and large models, find why routing is off, or check routing.
---

# model-router setup for Hermes Agent

model-router scores each `delegate_task` task with Jev, on TypeSafe or OpenRouter. It gives the task the person's `small_model` for lookup work, their `middle_model` for bounded judgment, or their `large_model` for open judgment. This setup turns the backend on, picks the provider, checks the keys, helps assign the three models, lists the reasons routing is off, and ends with a routing check.

## Rules

- When a step names a linked README section, open it before you act.
- Ask one question per message. Wait for the answer.
- Read every setting through the `model_router_config` tool. The tool only reads.
- Never write a config value or a key yourself. Ask the person to type each command.
- Only `/model-router-provider <value>` changes the provider, and only a local session can run it. Hermes CLI, TUI and Desktop sessions are local. A messaging platform is not.
- Run the setup the same way on the first run and on every re-run.
- Never take a key through chat. If a key arrives, do not repeat or store it. Tell the person to rotate it.
- Never display a key or any other credential.
- Skip a step the person declines. Name the skipped steps in the closing summary.
- Keep each message short. Show raw output only when the person needs it.

## Step 1. Enable the plugin and the backend

If the install block ran, confirm both settings and go to Step 2.

The person opts in twice. Ask them to run both commands, then confirm:

```sh
hermes plugins enable model-router-hermes
hermes config set delegation.backend model-router
```

[Hermes Agent](https://github.com/Akurganow/model-router/blob/main/README.md#hermes-agent) shows the install and the two commands.

Setting `delegation.backend` to `model-router` replaces `model_map` or any other backend. Say so before the person runs the second command.

A backend change applies from the next session. In a running session the person types `/delegation model-router --now`.

## Step 2. Read the settings and the key status

1. Call the tool with no setting.
2. Show the lines it returns.

The tool returns the `provider` line, the `small_model`, `middle_model` and `large_model` lines, and `<provider> key: set` or `<provider> key: unset` for each provider the `provider` value allows. A model line reads `<name>: <provider> <model>` or `<name>: unset`.

## Step 3. Provider

1. Call the tool with setting `provider`.
2. Show the command and the allowed values it returns.
3. Ask the person which value they want, and to type the command.
4. When they say it is done, call the tool with no setting.
5. Report the `provider` line.

The command replies with the new `provider` line. If it replies `provider unchanged: already <value>`, the person kept the current value. If it replies `provider unchanged: only a local session can change it`, tell the person to type it in a Hermes CLI, TUI or Desktop session.

## Step 4. Keys

[The keys table](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-hermes/README.md#keys) lists each key, its variable and where to set it.

1. Call the tool with no setting.
2. Note each provider that reports `key: unset`.
3. For each such provider, call the tool with `typesafe_key` or `openrouter_key`.
4. Show the answer. Ask the person to set the key there and tell you when it is done.
5. Call the tool with no setting again.
6. Report the key line. If it still reads `key: unset`, ask the person to start a new session, then say so in one line and go on.

Skip this step when every allowed provider reports `key: set`.

If a key is missing for every allowed provider, say that every task skips with `key unset` until one exists. With `auto` or `openrouter-first` and one key, say that its provider scores alone. A key in the environment is visible to every process Hermes starts.

## Step 5. Models

1. Call the tool with no setting. It shows `small_model`, `middle_model` and `large_model`, each with its configured value or `unset`. A slot with no model runs on the model Hermes gives, and the plugin still sets the effort unless the person set one.
2. When a slot is unset, or the person asks: call the tool with setting `models`. For each slot propose up to four ids from that list only, in chat: cheap and fast for small, mid-priced for middle, strongest for large. Use a price only where the list shows one, and say when it shows none.
3. Call the tool with the slot setting and give the person the text it returns. It says where the setting lives and the command to run.
4. When the person says it is done, call the tool with no setting and show the three lines again.

Each slot is a mapping with two fields. `provider` is a Hermes provider id, such as `openrouter`. `model` is an id from Hermes's offline model list for that provider. A slot with no `model` counts as unset.

An id in the `models` list reads `provider/model`. The text before the first slash is `provider`, and the rest is `model`: `openrouter/anthropic/claude-sonnet-4.5` is provider `openrouter` and model `anthropic/claude-sonnet-4.5`.

The plugin checks the slot a task picks before it uses it. When the provider needs a network call to refresh its credentials, or the model is not in the offline list, the label reads `<slot> model unresolved`, and the task runs on the model Hermes gives. [Models](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-hermes/README.md#models) says what the plugin needs.

## Step 6. List the reasons routing is off

Check each reason below and report every one that holds, not only the first. The label of a skipped task reads `model-router skipped, <reason>`. [Which tasks are routed](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-hermes/README.md#which-tasks-are-routed) explains each reason.

- `key unset`: Step 4.
- `subagent model set`: the person's `delegation` section. The person decides whether to clear it.
- `node not found`: the person installs a Node for Hermes.
- `timeout`, `failed`, or an HTTP status: no setting fixes it.

For each reason that holds, tell the person which setting to change, and where. The person runs the change. This skill changes none of them.

A routed line that reads `config effort` in place of an effort is not a skip: `delegation.reasoning_effort` is set, so the plugin keeps that effort and routes the model only.

## Step 7. Routing check

1. If the plugin or the backend was just set, or a key changed, ask the person to start a new session or to type `/delegation model-router --now`. Then return to this step.
2. Ask the routing-check question with the answers "Check" and "Skip".
3. On Skip, record "routing check: skipped" and go to the closing summary.
4. On Check, call `delegate_task` with one task: "Reply with the single word ok." Pass no `model`, `provider` or `reasoning_effort`.
5. Read the `route.label` field of the result. It shows the plugin's line in every plugin isolation mode. The plugin's own log drops INFO lines by default.
6. If the label holds no `model-router` line, report it and check Step 1 and Step 6.
7. If the label names a skip reason, stop and report it with its step.
8. Otherwise check that the label names a level, a model or a slot whose model is unset or unresolved, and an effort. Report the result in one line. For an unset or unresolved slot, point to Step 5.

The routing-check question reads: "To check routing I will delegate one small task. It spends a little model usage."

## Closing summary

List what the setup changed. List the reasons that still turn routing off, and the skipped steps. Include no key and no home-directory path.
