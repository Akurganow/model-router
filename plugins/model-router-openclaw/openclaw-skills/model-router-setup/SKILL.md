---
name: model-router-setup
description: Use to set up model-router in OpenClaw: choose its provider or scope, add a TypeSafe or OpenRouter key, find why routing is off, or check routing.
---

# model-router setup for OpenClaw

model-router scores each routed `sessions_spawn` call with Jev, on TypeSafe or OpenRouter. It gives the subagent the person's `small_model` for lookup work, or their `large_model` for open judgment. This setup picks the provider and the scope, checks the keys, lists the reasons routing is off, and ends with a routing check.

## Rules

- Ask one question per message. Wait for the answer.
- Read every setting through the `model_router_config` tool. The tool only reads.
- Never write a setting yourself. Ask the person to type the command the tool names: `/model-router-provider <value>` or `/model-router-scope <value>`.
- Only the owner, with the `operator.admin` scope, can run those commands. OpenClaw refuses anyone else.
- Run the setup the same way on the first run and on every re-run.
- Never take a key through chat. If a key arrives, do not repeat or store it. Tell the person to rotate it.
- Never display a key or any other credential.
- Propose no models. Assigning `small_model` and `large_model` is the person's job.
- Skip a step the person declines. Name the skipped steps in the closing summary.
- Keep each message short. Show raw output only when the person needs it.

## Step 1. Read the settings and the key status

1. Call the tool with no setting.
2. Show the lines it returns.

The tool returns the `provider` line, the `scope` line, the `small_model` and `large_model` lines, and `<provider> key: set` or `<provider> key: unset` for each provider the `provider` value allows. An unknown `provider` value counts as `typesafe`. An unknown `scope` value counts as `core`.

## Step 2. Provider

1. Call the tool with setting `provider`.
2. Show the command and the allowed values it returns.
3. Ask the person which value they want, and to type the command.
4. When they say it is done, call the tool with no setting.
5. Report the `provider` line.

The command replies with the new `provider` line. If it replies `provider unchanged: already <value>`, the person kept the current value. If it replies that only the owner can change it, tell the person to run it from an owner session with the `operator.admin` scope.

## Step 3. Keys

1. Call the tool with no setting.
2. Note each provider that reports `key: unset`.
3. For each such provider, ask the key question below, once.
4. When the person says the key is in place, call the tool with no setting.
5. Report the key line. Continue only when it reads `key: set`.

Skip this step when every allowed provider reports `key: set`.

The key question has three answers:

1. "Enter it in the plugin settings". Recommend it for this question only. The person opens the plugin's settings in the Control UI and fills the TypeSafe or OpenRouter key field. The field stores a secret.
2. "Set the environment variable". The person sets `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY` in the gateway's environment, then restarts the gateway with `openclaw gateway restart`.
3. "Do nothing". Skip the key.

Say that a variable in the gateway's environment reaches every process the gateway starts.

The plugin reads a key only for a provider the `provider` value allows. For each one it checks the plugin's own key first, then the environment variable. OpenClaw's own provider credentials are never used for Jev.

If a key is missing for every allowed provider, say that every call skips with `key unset` until one exists. With `auto` or `openrouter-first` and one key, say that its provider scores alone.

## Step 4. Scope

1. Call the tool with setting `scope`.
2. Show the command and the allowed values it returns.
3. Ask the person which value they want, and to type the command.
4. When they say it is done, call the tool with no setting.
5. Report the `scope` line.

Under `core`, the plugin routes only a spawn that names no other agent. Under `extended`, it also routes other agents that set no model of their own.

## Step 5. List the reasons routing is off

Check each reason below. Report every reason that holds, not only the first.

- The plugin is disabled. No line appears in the gateway log.
- The hook timeout for the plugin is under 3000 ms. The plugin stays inert and logs one warning at start-up.
- A key is missing for every allowed provider. The reason is `key unset`.
- Neither `small_model` nor `large_model` is set. The reason is `no small or large model`.
- Level 0 needs `small_model`. Level 2 needs `large_model`. A picked slot that is empty gives `small model unset` or `large model unset`.
- A slot is set but unusable. The reason is `small model unresolved` or `large model unresolved`. The model string is not accepted, or its provider has no API-key credential. Auth that the OpenClaw runtime owns, such as the Claude CLI backend, reads as unresolved. Use models of a provider with an API key.
- The agent or the defaults set a subagent model. The reason is `subagent model set`.
- Another agent is skipped. The reason is `<id> is outside the core scope`, `<id> agent unknown`, `<id> sets its own model`, or `<id> agent discovery failed`.

A spawn that already names a model, runs on ACP, is visible, forks the context, opens a session or thread, or has no task text passes through with no line.

For each reason that holds, tell the person which setting to change, and where. Assigning a model works in the Control UI under the plugin's settings, or with `openclaw config set plugins.entries.model-router-openclaw.config.small_model <model>` and the same for `large_model`. The person runs it. This skill changes none of them.

## Step 6. Routing check

1. If the plugin was just enabled or installed, or a key variable changed, ask the person to restart the gateway. Then return to this step.
2. Ask the routing-check question with the answers "Check" and "Skip".
3. On Skip, record "routing check: skipped" and go to the closing summary.
4. On Check, call `sessions_spawn` with the task "Reply with the single word ok." Pass no `agentId`, `model` or `thinking`.
5. Read the spawn result. Note `resolvedModel` and any model the spawn reports.
6. OpenClaw shows no chat line. Read the newest `model-router` line in the gateway log with `openclaw logs --plain`, or ask the person to read it.
7. Check that the line names a level, a model or `no change`, and an effort.
8. If the line names a skip reason, stop and report it.
9. Check `resolvedModel` against the line. Report the result in one line.

The routing-check question reads: "To check routing I will spawn one small subagent. It spends a little model usage."

Read the line as follows:

- A level 0 or 2 line names the slot string, and `resolvedModel` matches it. A level 1 line reads `no change`, and the spawn keeps OpenClaw's own model.
- After a fallback, the line ends with ` · via <provider> (<first provider> <reason>)`.
- `key unset` points to step 3.
- Any other reason in step 5 points to step 5.
- `timeout`, `network error` or an HTTP status points to the provider or the network.
- After two attempts the line names each provider with its reason, for example `skipped, typesafe HTTP 503, openrouter timeout`.

OpenClaw can still reject a spawn that carries a model the plugin checked, and a child can still fail on it. Say so when the check fails after a model was set.

## Closing summary

List what the setup changed. List the reasons that still turn routing off, and the skipped steps. Include no key and no home-directory path.
