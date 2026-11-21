---
name: model-router-setup
description: Use to check or change the model-router setup in OpenClaw, such as its scoring key, provider, gateway, scope, the small, middle and large models, or why routing is off.
---

# model-router setup for OpenClaw

model-router scores each routed `sessions_spawn` call with Jev, on TypeSafe's own API or through OpenRouter. It sets the subagent's `model` from the person's `small_model`, `middle_model` or `large_model`, and its `thinking` from a fixed ladder of efforts.

## What set up means

Routing works when both of these hold:

- The Gateway has loaded the plugin and it is enabled.
- A scoring key exists for a path the `gateway` setting allows.

The person may also choose these, and each has a default:

- `provider`: whose model scores tasks. Its one value is `typesafe`, the default.
- `gateway`: how OpenRouter is used to reach the provider. The default is `direct`.
- `scope`: which spawns the plugin routes. The default is `core`.
- A model for each of the three levels: `small_model` for lookup work, `middle_model` for bounded judgment, `large_model` for open judgment. A level with no model keeps OpenClaw's model and still gets the effort for a task the plugin scores.

## Your job

Find out which of these already hold, with the `model_router_config` tool and OpenClaw's own means. Tell the person in one message what is set and what is missing. Do only what is missing or what the person asks to change, and do it yourself once the person agrees. Never ask the person to repeat a step that is done, and never ask for the install commands. Ask the person with the question tool OpenClaw gives you, never as plain text in your reply. If the session has no such tool, ask one question per message.

## Facts

### The tool

- `model_router_config` with no input prints the `provider`, `gateway`, `scope`, `small_model`, `middle_model` and `large_model` lines, then one key line for each path the `gateway` setting allows.
- A model line shows the slot string as written, or `unset`. A key line reads `typesafe key: set` or `openrouter key: unset`.
- Example output:

```text
provider: typesafe
gateway: auto (typesafe, then openrouter)
scope: core
small_model: acme/small
middle_model: unset
large_model: unset
typesafe key: set
openrouter key: unset
```

- A setting that is not valid prints as `<setting>: <stored text> (not valid: use one of <values>)`. The gateway line then names no company, and no key line prints.
- The tool only reads and writes nothing.

### Provider and gateway

- `provider` has one value: `typesafe`, the default. It is TypeSafe's model, Jev.
- `gateway` has four values:
  - `direct`, the default: TypeSafe's own API only.
  - `auto`: TypeSafe's own API, then OpenRouter.
  - `openrouter-first`: OpenRouter, then TypeSafe's own API.
  - `openrouter`: OpenRouter only.
- The `gateway` setting is not OpenClaw's Gateway, the process that loads the plugin.
- The person changes `provider` with the chat command `/model-router-provider <value>`, and `gateway` with `/model-router-gateway <value>`.
- The `/model-router-provider` command replies with the new `provider` line. A value equal to the stored text gives `provider unchanged: already <value>`. A sender who is not the owner, with a valid value, gets `provider unchanged: only the owner can change it` and the current `provider` line.
- The `/model-router-gateway` command replies the same way, with `gateway` in place of `provider`.
- A change to either setting applies once OpenClaw replaces the plugin, after running work drains, up to 60 s. The tool can show the old value until then. A spawn in that window uses the old value.

### A retired provider value

- `auto`, `openrouter-first` and `openrouter` are retired `provider` values. They are `gateway` values now, so a stored `provider` that holds one is not valid.
- The tool shows a retired value as `provider: <stored text> (not valid: use one of <values>)`.
- The pairs that give the same requests as before:
  - `auto`: `provider` `typesafe`, `gateway` `auto`.
  - `openrouter-first`: `provider` `typesafe`, `gateway` `openrouter-first`.
  - `openrouter`: `provider` `typesafe`, `gateway` `openrouter`.
- Take these steps in this order. Set `gateway` first. While `provider` is not valid, nothing routes, so no task takes an unchosen path.
  1. Read the stored `provider` and `gateway` with `model_router_config`.
  2. Propose the pair above that matches the stored value.
  3. Once the person agrees, ask them to type `/model-router-gateway <value>` first and `/model-router-provider typesafe` second.
  4. After OpenClaw has replaced the plugin, call `model_router_config` again and check the `provider` and `gateway` lines.
- OpenClaw gives you no way to write a setting. Only the owner can change a setting with these commands.

### Scope

- `core` routes the spawn of the requesting agent itself: a spawn with no `agentId`, or with the requester's own id, and a `runtime` that is absent or `subagent`.
- `extended` also routes the spawn of any other configured agent that does not set its own model.
- The person changes it with `/model-router-scope <value>`. The replies and the timing match `provider`.

### Keys

- TypeSafe key, on the direct path: the plugin setting `api_key`, else the environment variable `TYPESAFE_API_KEY`.
- OpenRouter key, on the gateway path: the plugin setting `openrouter_api_key`, else the environment variable `OPENROUTER_API_KEY`.
- The person adds a key in the secret field of the plugin's page in the Control UI, or sets the variable in the Gateway's environment and restarts the Gateway.
- A key counts as set when either place holds a non-blank value.
- OpenClaw's own OpenRouter provider reads `OPENROUTER_API_KEY` too. A key already in that variable scores tasks when the `gateway` setting allows OpenRouter and the plugin's `openrouter_api_key` setting holds none.
- No other credential of OpenClaw serves as a Jev key.
- A key variable reaches every process the Gateway starts.
- With `auto` or `openrouter-first` and one key, that key's path scores alone.

### Models

- The person sets a model on the plugin's page in the Control UI, or with `openclaw config set plugins.entries.model-router-openclaw.config.<slot> <provider/model>`. No chat command sets a model.
- Each slot takes the full `provider/model` id. OpenClaw expands a bare model name to a ref it may not know, and the child then fails.
- A slot is set when its setting names a model. The plugin sets that model on the spawn of its level.
- A level with an unset slot keeps the model OpenClaw would give the spawn. The plugin still sets the effort.
- OpenClaw can still reject a spawn whose model the plugin set, and the child can still fail on it. A model set on a spawn loses OpenClaw's configured fallbacks.

### Effort

- Level 0 sets `thinking` to `medium`, `high` or `xhigh`. Level 1 and 2 set `low`, `medium` or `high`. The work question picks the value. The plugin never sets `max`, `ultra`, `adaptive`, `minimal` or `off`.
- The plugin keeps an effort the person set: the spawn's own `thinking` (the line shows `caller effort`), `agents.defaults.subagents.thinking`, or under `core` the requester's `subagents.thinking` (the line shows `config effort`).
- Under `extended`, the ladder effort replaces a `subagents.thinking` set on the requesting or target agent. A global `agents.defaults.subagents.thinking` still wins.

### The log line

- OpenClaw shows no line in the chat. The plugin writes one line per routed or skipped spawn to the Gateway log. The line starts with `model-router`.
- A routed line reads `L<level> <model or slot state> · <effort or kept label> · p=<tier>/<work>`. The model is the slot string as written. An unset slot shows `<slot> model unset`, and that spawn keeps OpenClaw's model.
- Who answered follows, as `typesafe` or `openrouter`, then the model its reply names and the token counts, as in ` · typesafe jev-1.14.0 · 812/9 tok`. The model and the token counts are left out when the reply lacks them.
- After a fallback, the line ends with the attempt that failed and its reason, as in ` · openrouter typesafe/jev-1.14.0 · 812/9 tok · typesafe HTTP 503`.
- Example lines:

```text
model-router L0 acme/small · medium · p=0.91/0.84 · typesafe jev-1.14.0 · 812/9 tok
model-router L1 middle model unset · caller effort · p=0.62/0.70 · typesafe jev-1.14.0 · 640/9 tok
model-router skipped, key unset
```

- A skipped line reads `skipped, <reason>`. OpenClaw then runs the spawn as it would without the plugin.

### Why routing is off

A spawn with no `model-router` line at all has one of these causes:

- The Gateway has not loaded the plugin, or the plugin is not enabled.
- The spawn passes without a line. It sets a `model` other than `default`, a `runtime` other than `subagent`, an `agentId` that is not text and not `null`, `visible: true`, `context: "fork"`, `mode: "session"` or `thread: true`, or it sets no `task` or a `task` that is not text.
- The spawn takes a path that never calls `sessions_spawn`: `/acp spawn`, the gateway method `sessions.create`, the Control UI's new session, `api.runtime.subagent.run` from another plugin, or Codex's own `spawn_agent`.
- The hook timeout is below 3000 ms, so the plugin routes nothing. The plugin logs one warning at start-up. The operator sets `plugins.entries.model-router-openclaw.hooks.timeouts.before_tool_call` or `hooks.timeoutMs` to 3000 or more.

Skip reasons, checked in this order, with the fix:

- `<setting> not valid: run setup`: the setting holds a value outside its list. With more than one, the reason names the first of `provider`, `gateway` and `scope`. Set a valid value with that setting's command. For a retired `provider` value, follow the steps under "A retired provider value" above.
- `key unset`: no path the `gateway` setting allows has a key. Add a key.
- `<id> is outside the core scope`: under `core`, the spawn names another agent. Set `scope` to `extended` to route it.
- `subagent model set`: `agents.defaults.subagents.model`, or the target agent's `subagents.model`, is set. OpenClaw's own choice decides. Clear that setting to route the spawn.
- `<id> agent discovery failed`: under `extended`, the plugin cannot read OpenClaw's config.
- `<id> agent unknown`: under `extended`, the agent is not in `agents.entries`, or in `agents.list` when `entries` is absent.
- `<id> sets its own model`: under `extended`, the agent's entry sets a `model`. OpenClaw's choice decides.
- `settings unreadable`: the plugin cannot read OpenClaw's live config.
- `timeout`: the 8 s routing limit expired. The limit shrinks to the hook timeout minus 2 s when that is smaller.
- `cancelled`: OpenClaw cancelled the `sessions_spawn` call before routing finished.
- `HTTP <status>`, `network error`, `bad reply` or `failed`: the company did not answer. Look at the company that failed, its key and the network.

### Checking routing

- A routing check spawns one small subagent with `sessions_spawn`, with the task "Reply with the single word ok." and no `agentId`, `model` or `thinking`.
- A line that reads `<slot> model unset` keeps OpenClaw's own model. A skip reason ends the check.

For the person: the plugin's README, `plugins/model-router-openclaw/README.md` in the repository, has the full routing rules.

## Limits

- Never take, show or repeat a key. If a key arrives in chat, do not repeat or store it, and tell the person to rotate it.
- Change a setting only when the person asked for it or agreed.
- Only the owner can change a setting with `/model-router-provider`, `/model-router-gateway` and `/model-router-scope`.
- A routing check spawns one small task and spends a little usage, so ask before it.

## When you finish

Say what is set, what you changed and what still keeps routing off. Include no key and no home-directory path.
