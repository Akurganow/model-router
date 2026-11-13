---
name: model-router-setup
description: Use to check or change the model-router setup in OpenClaw: its scoring key, provider, scope, small, middle and large models, or why routing is off.
---

# model-router setup for OpenClaw

model-router scores each routed `sessions_spawn` call with Jev, on TypeSafe or OpenRouter. It sets the subagent's `model` from the person's `small_model`, `middle_model` or `large_model`, and its `thinking` from a fixed ladder of efforts.

## What set up means

Routing works when both of these hold:

- The Gateway has loaded the plugin and it is enabled. A change to the plugin needs a Gateway restart.
- A scoring key exists for a provider the `provider` setting allows.

The person may also choose these, and each has a default:

- `provider`: which providers score tasks. The default is `typesafe`.
- `scope`: which spawns the plugin routes. The default is `core`.
- A model for each of the three levels: `small_model` for lookup work, `middle_model` for bounded judgment, `large_model` for open judgment. A level with no model keeps OpenClaw's model and still gets the effort for a task the plugin scores.

## Your job

Find out which of these already hold, with the `model_router_config` tool and OpenClaw's own means. Tell the person in one message what is set and what is missing. Do only what is missing or what the person asks to change. Never ask the person to repeat a step that is done, and never ask for the install commands. Ask the person with OpenClaw's `ask_user` tool, never as plain text in your reply. WhatsApp, Signal and iMessage do not expose `ask_user`, so there ask one text question per message.

## Facts

### The tool

- `model_router_config` with no setting prints the `provider`, `scope`, `small_model`, `middle_model` and `large_model` lines, then one key line for each provider the `provider` setting allows.
- A model line shows the slot string as written, or `unset`. A key line reads `typesafe key: set` or `openrouter key: unset`.
- Example output:

```text
provider: auto (typesafe, then openrouter)
scope: core
small_model: acme/small
middle_model: unset
large_model: unset
typesafe key: set
openrouter key: unset
```

- The tool only reads and writes nothing. With a setting name it returns how the person changes that setting.
- The tool accepts `provider`, `scope`, `small_model`, `middle_model`, `large_model`, `typesafe_key` and `openrouter_key`.

### Provider

- `typesafe` is TypeSafe only. `openrouter` is OpenRouter only. `auto` is TypeSafe, then OpenRouter. `openrouter-first` is OpenRouter, then TypeSafe.
- The person changes it with the chat command `/model-router-provider <value>`. The tool with setting `provider` returns that command and the allowed values.
- The command replies with the new `provider` line. A value already set gives `provider unchanged: already <value>`. A sender who is not the owner gets `provider unchanged: only the owner can change it`.
- A Gateway client without `operator.admin` gets OpenClaw's own error `This command requires gateway scope: operator.admin.`.
- A change applies once OpenClaw replaces the plugin, after running work drains, up to 60 s. The tool can show the old value until then. A spawn in that window uses the old value.

### Scope

- `core` routes the spawn of the requesting agent itself: a spawn with no `agentId`, or with the requester's own id, and a `runtime` that is absent or `subagent`.
- `extended` also routes the spawn of any other configured agent that does not set its own model.
- The person changes it with `/model-router-scope <value>`. The tool with setting `scope` returns the command and the allowed values. The replies and the timing match `provider`.

### Keys

- TypeSafe key: the plugin setting `api_key`, else the environment variable `TYPESAFE_API_KEY`.
- OpenRouter key: the plugin setting `openrouter_api_key`, else the environment variable `OPENROUTER_API_KEY`.
- A key counts as set when either place holds a non-empty value. The plugin never uses OpenClaw's own provider credentials as a key.
- The person enters a key in the secret field of the plugin's settings page in the Control UI, at `/settings/plugins/model-router-openclaw`. The field takes plain text or a SecretRef.
- The other way is the environment variable in the Gateway's environment, then `openclaw gateway restart`. A variable there reaches every process the Gateway starts.
- With `auto` or `openrouter-first` and one key, that key's provider scores alone.

### Models

- The tool with setting `small_model`, `middle_model` or `large_model` returns where the person sets it: the plugin's settings page in the Control UI, or `openclaw config set plugins.entries.model-router-openclaw.config.<name> <provider/model>`. No chat command sets a model.
- Each slot takes the full `provider/model` id. OpenClaw expands a bare model name to a ref it may not know, and the child then fails.
- A slot is set when its setting names a model. The plugin sets that model on the spawn of its level.
- A level with an unset slot keeps the model OpenClaw would give the spawn. The plugin still sets the effort.
- Suggest a model only from the models OpenClaw itself lists. The plugin has no tool that lists or sets a model.
- OpenClaw can still reject a spawn whose model the plugin set, and the child can still fail on it. A model set on a spawn loses OpenClaw's configured fallbacks.
- A spawn that sets `outputSchema` runs a collector child that needs tools, so assign tool-capable models.
- OpenClaw does not sandbox a CLI backend. A child that must run sandboxed fails with a CLI-backend model.

### Effort

- Level 0 sets `thinking` to `medium`, `high` or `xhigh`. Level 1 and 2 set `low`, `medium` or `high`. The work question picks the value. The plugin never sets `max`, `ultra`, `adaptive`, `minimal` or `off`.
- The plugin keeps an effort the person set: the spawn's own `thinking` (the line shows `caller effort`), `agents.defaults.subagents.thinking`, or under `core` the requester's `subagents.thinking` (the line shows `config effort`).
- Under `extended`, the ladder effort replaces a `subagents.thinking` set on the requesting or target agent. A global `agents.defaults.subagents.thinking` still wins.

### The log line

- OpenClaw shows no line in the chat. The plugin writes one line per routed or skipped spawn to the Gateway log. Read it with `openclaw logs --plain`, or `openclaw logs --follow --plain` to watch. The line starts with `model-router`.
- A routed line reads `L<level> <model or slot state> · <effort or kept label> · p=<tier>/<work>`, followed by the provider and token counts. The model is the slot string as written. An unset slot shows `<slot> model unset`, and that spawn keeps OpenClaw's model.
- Example lines:

```text
model-router L0 acme/small · medium · p=0.91/0.84 · jev jev-1.14.0 · 812/9 tok
model-router L1 middle model unset · caller effort · p=0.62/0.70
model-router skipped, key unset
```

- A skipped line reads `skipped, <reason>`. OpenClaw then runs the spawn as it would without the plugin.

### Why routing is off

A spawn with no `model-router` line at all has one of these causes:

- The Gateway has not loaded the plugin. `openclaw plugins inspect model-router-openclaw --runtime --json` must show `plugin.status` as `loaded` and `plugin.enabled` as `true`.
- The spawn passes without a line. It sets a `model` other than `default`, a `runtime` other than `subagent`, an `agentId` that is not text, `visible: true`, `context: "fork"`, `mode: "session"` or `thread: true`, or it has no `task`.
- The spawn takes a path that never calls `sessions_spawn`: `/acp spawn`, the gateway method `sessions.create`, the Control UI's new session, `api.runtime.subagent.run` from another plugin, or Codex's own `spawn_agent`.
- The hook timeout is below 3000 ms, so the plugin routes nothing. The plugin logs one warning at start-up. The operator sets `plugins.entries.model-router-openclaw.hooks.timeouts.before_tool_call` or `hooks.timeoutMs` to 3000 or more.

Skip reasons, checked in this order, with the fix:

- `key unset`: no provider the `provider` setting allows has a key. Add a key.
- `<id> is outside the core scope`: under `core`, the spawn names another agent. Set `scope` to `extended` to route it.
- `subagent model set`: `agents.defaults.subagents.model`, or the target agent's `subagents.model`, is set. OpenClaw's own choice decides. Clear that setting to route the spawn.
- `<id> agent discovery failed`: under `extended`, the plugin cannot read OpenClaw's config.
- `<id> agent unknown`: under `extended`, the agent is not in `agents.entries`, or in `agents.list` when `entries` is absent.
- `<id> sets its own model`: under `extended`, the agent's entry sets a `model`. OpenClaw's choice decides.
- `settings unreadable`: the plugin cannot read OpenClaw's live config.
- `timeout`: the 8 s routing limit expired. The limit shrinks to the hook timeout minus 2 s when that is smaller.
- `cancelled`: OpenClaw cancelled the `sessions_spawn` call before routing finished.
- `HTTP <status>`, `network error`, `rejected request`, `bad reply` or `failed`: Jev did not answer. Look at the provider, the key and the network.

### Checking routing

- A routing check spawns one small subagent with `sessions_spawn`, with the task "Reply with the single word ok." and no `agentId`, `model` or `thinking`.
- Note the time before the spawn. The first `model-router` line logged after that time belongs to the check. An older line belongs to another spawn.
- A line that names a slot string has `resolvedModel` in the spawn result matching it. A line that reads `<slot> model unset` keeps OpenClaw's own model. A skip reason ends the check.
- After a key environment variable changes, the Gateway must restart before a check means anything.

For the person: the plugin's README, `plugins/model-router-openclaw/README.md` in the repository, has the full routing rules.

## Limits

- Never take, show or repeat a key. If a key arrives in chat, do not repeat or store it, and tell the person to rotate it.
- Change a setting only when the person asked for it or agreed.
- Only the owner can run `/model-router-provider` and `/model-router-scope`.
- A routing check spawns one small task and spends a little usage, so ask before it.

## When you finish

Say what is set, what you changed and what still keeps routing off. Include no key and no home-directory path.
