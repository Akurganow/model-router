---
name: model-router-setup
description: Use to check or change the model-router setup in OpenClaw, such as its scoring keys, provider, gateway, scope, the scoring models, the small, middle and large models, or why routing is off.
---

# model-router setup for OpenClaw

model-router scores each routed `sessions_spawn` call with the decision model of the chosen provider, on the provider's own API or through OpenRouter. It sets the subagent's `model` from the person's `small_model`, `middle_model` or `large_model`, and its `thinking` from a fixed ladder of efforts.

## What set up means

Routing works when both of these hold:

- The Gateway has loaded the plugin and it is enabled.
- A scoring key exists for a path the `provider` and `gateway` settings allow.

The person may also choose these, and each has a default:

- `provider`: whose model scores tasks. It takes `typesafe` (the default), `openai` or `google`.
- `gateway`: how OpenRouter is used to reach the provider. The default is `direct`.
- `scope`: which spawns the plugin routes. The default is `core`.
- `models`: the scoring model of each provider. A provider with no entry uses its default model.
- A model for each of the three levels: `small_model` for lookup work, `middle_model` for bounded judgment, `large_model` for open judgment. A level with no model keeps OpenClaw's model and still gets the effort for a task the plugin scores.

## Your job

Find out which of these already hold, with the `model_router_config` tool and OpenClaw's own means. Tell the person in one message what is set and what is missing. Do only what is missing or what the person asks to change, and do it yourself once the person agrees. Never ask the person to repeat a step that is done, and never ask for the install commands. Ask the person with the question tool OpenClaw gives you, never as plain text in your reply. If the session has no such tool, ask one question per message.

When a choice has more than four values, ask with three values and `more` at a time, the current value first; `more` on the last page goes back to the first.

When the person wants to choose the provider, follow these steps in order:

1. Call `model_router_config` with no input, and read the settings and the key lines.
2. Ask which provider's model scores, and give the labels from the Provider and gateway facts.
3. Ask how OpenRouter is used, before any write, and give the labels from the Provider and gateway facts.
4. On the person's word, have the owner type `/model-router-gateway <value>` and `/model-router-provider <value>`, one command at a time. Set `gateway` first. When the stored `gateway` is `openrouter`, set `provider` first.
   - Ask for the second command only after OpenClaw has replaced the plugin and `model_router_config` shows the agreed value of the first setting. If it does not, stop and tell the person.
   - Between the two writes the plugin routes by the middle pair. This order uses no key that neither the old pair nor the new pair uses.
5. Name the key the choice needs, and say where it comes from, as the Keys facts say.
6. After OpenClaw replaces the plugin, call `model_router_config` again and confirm the lines.

When the `models` line ends with `(not valid: <entry>)`, repair it. Follow these steps in order:

1. Call `model_router_config` with no input, and read the `models` line.
2. Name the entry to the person, and ask for a corrected text.
3. On the person's word, run `openclaw config set plugins.entries.model-router-openclaw.config.models '<corrected text>'`, with the text in the short form and the entries in the order the line shows them. When a kept name holds a comma, a quote or a brace, write the whole value as a JSON object.
4. After OpenClaw replaces the plugin, call `model_router_config` again, and confirm the `models` line.

When the person wants another scoring model for one provider, follow these steps in order:

1. Call `model_router_config` with no input, and read the `models` line and the lines under it.
2. Ask the person for the provider and the model name. Model names come from the provider's API documentation.
3. Take the text the line shows, keep every other entry, and set or replace that provider's entry. Write the short form, with the entries in the order the line shows them. When a kept name holds a comma, a quote or a brace, write the whole value as a JSON object.
4. On the person's word, run `openclaw config set plugins.entries.model-router-openclaw.config.models '<whole text>'`.
5. After OpenClaw replaces the plugin, call `model_router_config` again, and confirm the `models` line.

## Facts

### The tool

- `model_router_config` with no input prints the `provider`, `gateway`, `scope`, `models`, `small_model`, `middle_model` and `large_model` lines, then one key line for each path the `gateway` setting allows.
- A model line shows the slot string as written, or `unset`. A key line reads `typesafe key: set`, `openai key: unset` or `openrouter key: unset`, after the key's holder.
- Example output, with the model line of one provider. [The report lines](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-report-lines) show one for each:

```text
provider: typesafe
gateway: auto (typesafe, then openrouter)
scope: core
models: unset
typesafe model: jev-latest (OpenRouter: jev-latest)
small_model: acme/small
middle_model: unset
large_model: unset
typesafe key: set
openrouter key: unset
```

- A setting that is not valid prints as `<setting>: <stored text> (not valid: use one of <values>)`. The gateway line then names no company, and no key line prints.
- A `models` value that is not valid prints as `models: <text> (not valid: <entry>)`, and no provider model line prints.
- The tool only reads and writes nothing.

### Provider and gateway

- `provider` has three values. `typesafe` is the default.
  - `typesafe - Jev from TypeSafe`
  - `openai - OpenAI's decision model`
  - `google - Google's decision model`
  - [What each company does with the text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#what-each-company-does-with-the-text) says more.
- `gateway` has four values. `direct` is the default.
  - `direct - the provider's own API only`
  - `auto - the provider's own API, then OpenRouter if it fails`
  - `openrouter-first - OpenRouter, then the provider's own API if it fails`
  - `openrouter - OpenRouter only`
- Only some failures reach the second path: [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) lists them.
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
  3. Once the person agrees, ask them to type `/model-router-gateway <value>`.
  4. After OpenClaw has replaced the plugin, call `model_router_config` again. Go on only when the `gateway` line shows the agreed value.
  5. Ask them to type `/model-router-provider typesafe`.
  6. After OpenClaw has replaced the plugin, call `model_router_config` again and check the `provider` and `gateway` lines.
- OpenClaw gives you no way to write `provider`, `gateway` or `scope`. Only the owner can change them with these commands.

### Scoring models

- `models` takes the short form, such as `{typesafe:jev-latest, openai:gpt-6-luna}`, a JSON object, or a native object in the config. [The `models` setting](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-models-setting) lists the forms, the defaults, the OpenRouter names and when a value is not valid.
- The person sets `models` on the plugin's page in the Control UI, or with `openclaw config set plugins.entries.model-router-openclaw.config.models '<text>'`. Run the command only on the person's word.
- A change applies once OpenClaw replaces the plugin, after running work drains, up to 60 s. The tool can show the old value until then.
- A model name goes as written on the provider's own API, and that API's documentation lists the names. [The model name on each path](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-model-name-on-each-path) says what OpenRouter does with a name.
- A stored `models` makes an older plugin version fail OpenClaw's config check, because the schema allows no unknown key. Tell the person to remove the setting before an older install.
- The plugin registers its migration ladder with OpenClaw. `openclaw doctor --fix` and an update run it. Today it changes nothing.

### Scope

- `scope` has two values. `core` is the default.
  - `core - built-in general agents only`
  - `extended - also routes other agents that pass no model`
- `core` routes the spawn of the requesting agent itself: a spawn with no `agentId`, or with the requester's own id, and a `runtime` that is absent or `subagent`.
- `extended` also routes the spawn of any other configured agent that does not set its own model.
- The person changes it with `/model-router-scope <value>`. The replies and the timing match `provider`.

### Keys

- Each key is a plugin setting, else an environment variable.
  - TypeSafe: the setting `api_key`, else `TYPESAFE_API_KEY`. Get a key at https://console.typesafe.ai/keys.
  - OpenAI: the setting `openai_api_key`, else `OPENAI_API_KEY`. Get a key at https://platform.openai.com/api-keys.
  - Google: the setting `google_api_key`, else `GEMINI_API_KEY`. Get a key at https://aistudio.google.com/docs/api-key.
  - OpenRouter: the setting `openrouter_api_key`, else `OPENROUTER_API_KEY`. Get a key at https://openrouter.ai.
- The key of the chosen provider serves the direct path, and the OpenRouter key serves the gateway path.
- The person adds a key in the secret field of the plugin's page in the Control UI, or sets the variable in the Gateway's environment and restarts the Gateway.
- A key counts as set when either place holds a non-blank value.
- OpenClaw's own OpenRouter provider reads `OPENROUTER_API_KEY` too. A key already in any of these variables scores tasks when the `provider` and `gateway` settings allow its holder and the plugin's setting for that holder holds none.
- No other credential of OpenClaw serves as a scoring key.
- A workspace `.env` is a lower-trust source: OpenClaw drops `OPENROUTER_API_KEY`, `OPENAI_API_KEY` and `GEMINI_API_KEY` from it, and not `TYPESAFE_API_KEY`. The global `~/.openclaw/.env` and the Gateway's environment stay trusted. Tell the person to keep a key in one of those two.
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
- Who answered follows, as `typesafe`, `openai`, `google` or `openrouter`, then the model its reply names and the token counts, as in ` · typesafe jev-1.14.0 · 812/9 tok`. The model and the token counts are left out when the reply lacks them. Google's reply names no model, so its line reads ` · google · 430/0 tok`.
- After a fallback, the line ends with the attempt that failed and its reason, as in ` · openrouter openai/gpt-6-luna-decisions-20261006 · 488/0 tok · openai HTTP 429`.
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

- `<setting> not valid: run setup`: the setting holds a value outside its list, or `models` is not valid. With more than one, the reason names the first of `provider`, `gateway`, `scope` and `models`. Set a valid value with that setting's command, or write `models` as the steps above say. For a retired `provider` value, follow the steps under "A retired provider value" above.
- `key unset`: no path the `provider` and `gateway` settings allow has a key. Add a key.
- `<id> is outside the core scope`: under `core`, the spawn names another agent. Set `scope` to `extended` to route it.
- `subagent model set`: `agents.defaults.subagents.model`, or the target agent's `subagents.model`, is set. OpenClaw's own choice decides. Clear that setting to route the spawn.
- `<id> agent discovery failed`: under `extended`, the plugin cannot read OpenClaw's config.
- `<id> agent unknown`: under `extended`, the agent is not in `agents.entries`, or in `agents.list` when `entries` is absent.
- `<id> sets its own model`: under `extended`, the agent's entry sets a `model`. OpenClaw's choice decides.
- `settings unreadable`: the plugin cannot read OpenClaw's live config.
- `timeout`: the first of two attempts got no answer in 5 s, or the 10 s routing limit expired. The limit shrinks to the hook timeout minus 2 s when that is smaller.
- `cancelled`: OpenClaw cancelled the `sessions_spawn` call before routing finished.
- `HTTP <status>`, `network error`, `bad reply` or `failed`: the attempt gave no score. Look at the company that failed, its key and the network. `HTTP 400` can also mean that OpenRouter does not know the model name in `models`. Google's own API answers a bad key with `HTTP 400`, as [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) says.

### Checking routing

- A routing check spawns one small subagent with `sessions_spawn`, with the task "Reply with the single word ok." and no `agentId`, `model` or `thinking`.
- A line that reads `<slot> model unset` keeps OpenClaw's own model. A skip reason ends the check.

For the person: the plugin's README, `plugins/model-router-openclaw/README.md` in the repository, has the full routing rules.

## Limits

- Never take, show or repeat a key. If a key arrives in chat, do not repeat or store it, and tell the person to rotate it.
- Change a setting only when the person asked for it or agreed.
- Run the `models` command only on the person's word, with every entry the person keeps.
- Only the owner can change a setting with `/model-router-provider`, `/model-router-gateway` and `/model-router-scope`.
- A routing check spawns one small task and spends a little usage, so ask before it.

## When you finish

Say what is set, what you changed and what still keeps routing off. Include no key and no home-directory path.
