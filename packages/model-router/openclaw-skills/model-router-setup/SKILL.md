---
name: model-router-setup
description: Use to set up model-router in OpenClaw: choose its provider or scope, add a TypeSafe or OpenRouter key, find why routing is off, or check routing.
---

# model-router setup for OpenClaw

model-router scores each routed `sessions_spawn` call with Jev, on TypeSafe or OpenRouter. It gives the subagent the person's `small_model` for lookup work, or their `large_model` for open judgment. This setup picks the provider and the scope, checks the keys, lists the reasons routing is off, and ends with a routing check.

## Rules

- When a step names a linked README section, open it before you act.
- Ask one question per message. Wait for the answer.
- Read every setting through the `model_router_config` tool. The tool only reads.
- Never write a setting yourself. Ask the person to type the command the tool names: `/model-router-provider <value>` or `/model-router-scope <value>`.
- Only the owner can run those commands. [Change the options](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md#change-the-options) says who can write.
- Run the setup the same way on the first run and on every re-run.
- Never take a key through chat. If a key arrives, do not repeat or store it. Tell the person to rotate it.
- Never display a key or any other credential.
- Propose no models. Assigning `small_model` and `large_model` is the person's job.
- Tell the person to write each slot as the full `provider/model` id. A bare model name expands to a ref OpenClaw may not know, and the child then fails.
- Skip a step the person declines. Name the skipped steps in the closing summary.
- Keep each message short. Show raw output only when the person needs it.

## Step 1. Read the settings and the key status

1. Call the tool with no setting.
2. Show the lines it returns.

[Change the options](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md#change-the-options) lists the lines the tool returns.

## Step 2. Provider

1. Call the tool with setting `provider`.
2. Show the command and the allowed values it returns.
3. Ask the person which value they want, and to type the command.
4. When they say it is done, call the tool with no setting.
5. Report the `provider` line.

The command replies with the new `provider` line. If it replies `provider unchanged: already <value>`, the person kept the current value. If it replies that only the owner can change it, tell the person to run it from an owner session.

The tool can show the old value until OpenClaw replaces the plugin, after running work drains, up to 60 s. Then report the command's reply as the new value, and say that a spawn before the replacement uses the old one.

## Step 3. Keys

1. Call the tool with no setting.
2. Note each provider that reports `key: unset`.
3. For each such provider, ask the key question below, once.
4. When the person says the key is in place, call the tool with no setting.
5. Report the key line. Continue only when it reads `key: set`.

Skip this step when every allowed provider reports `key: set`.

The key question has three answers:

1. "Enter it in the plugin settings". Recommend it for this question only. The person opens the plugin's settings in the Control UI and fills the TypeSafe or OpenRouter key field. The field stores a secret.
2. "Set the environment variable". The person sets `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY` in the Gateway's environment, then restarts the Gateway with `openclaw gateway restart`.
3. "Do nothing". Skip the key.

[Keys](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md#keys) says where the plugin looks for a key. After answer 2, say that a variable in the Gateway's environment reaches every process the Gateway starts.

If a key is missing for every allowed provider, say that every call skips with `key unset` until one exists. With `auto` or `openrouter-first` and one key, say that its provider scores alone.

## Step 4. Scope

1. Call the tool with setting `scope`.
2. Show the command and the allowed values it returns.
3. Ask the person which value they want, and to type the command.
4. When they say it is done, call the tool with no setting.
5. Report the `scope` line.

The tool can show the old value until OpenClaw replaces the plugin, as in Step 2.

[Scope](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md#scope) says what each value routes.

## Step 5. List the reasons routing is off

Check each cause on the [No line at all?](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md#no-line-at-all) list and each skip reason in [Which spawns are routed](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md#which-spawns-are-routed). Report every reason that holds, not only the first.

For each reason that holds, tell the person which setting to change, and where. [Set up](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md#set-up) shows how to assign a model. The person runs the change. This skill changes none of them.

## Step 6. Routing check

1. If the plugin was just enabled or installed, or a key variable changed, ask the person to restart the Gateway. Then return to this step.
2. Ask the routing-check question with the answers "Check" and "Skip".
3. On Skip, record "routing check: skipped" and go to the closing summary.
4. On Check, call `sessions_spawn` with the task "Reply with the single word ok." Pass no `agentId`, `model` or `thinking`.
5. Read the spawn result. Note `resolvedModel` and any model the spawn reports.
6. OpenClaw shows no chat line. Read the newest `model-router` line in the Gateway log with `openclaw logs --plain`, or ask the person to read it.
7. Check that the line names a level, a model or `no change`, and an effort.
8. If the line names a skip reason, stop and report it.
9. Check `resolvedModel` against the line. Report the result in one line.

The routing-check question reads: "To check routing I will spawn one small subagent. It spends a little model usage."

Read the line as follows:

- A level 0 or 2 line names the slot string, and `resolvedModel` matches it. A level 1 line reads `no change`, and the spawn keeps OpenClaw's own model. [The log line](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/README.md#the-log-line) explains the rest of the line.
- `key unset` points to step 3.
- Any other reason in step 5 points to step 5.
- `timeout`, `network error` or an HTTP status points to the provider or the network.

When the check fails after a model was set, say that OpenClaw can still say no, as [Fails open](https://github.com/Akurganow/model-router/blob/main/plugins/model-router-openclaw/PRIVACY.md#fails-open) explains.

## Closing summary

List what the setup changed. List the reasons that still turn routing off, and the skipped steps. Include no key and no home-directory path.
