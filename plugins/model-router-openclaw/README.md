# model-router for OpenClaw

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that picks a model and an effort for the subagents it routes. It asks a decision model, on the provider's own API or through OpenRouter, how much judgment the task needs and how much work it takes. It then sets the `model` and `thinking` of that `sessions_spawn` call.

## What it does

- It scores each routed `sessions_spawn` call through the decision model of the `provider` setting, [Jev](https://docs.typesafe.ai) from TypeSafe by default. One request asks two questions: how much judgment the task needs, and how much work it takes.
- Level 0 sets your `small_model`, level 1 your `middle_model` and level 2 your `large_model`. A slot you leave unset keeps OpenClaw's model for its level, which then gets the effort alone, as [Models](#models) says.
- It sets `thinking` from a fixed ladder of efforts, as [Effort](#effort) says.
- It sets only a model you assigned.
- It never overrides a model you chose, nor an effort the spawn or the global config sets. [The rules of the routed spawns](#which-spawns-are-routed) list the model rules, and [Efforts the plugin keeps](#efforts-the-plugin-keeps) lists the effort rules.
  Under `extended`, [rule 4](#efforts-the-plugin-keeps) replaces the requester's `subagents.thinking`, which OpenClaw applies to a cross-agent spawn.
- Under the default `core` scope, it routes only [the spawn of the requesting agent itself](#the-spawn-of-the-requesting-agent-itself). [Scope](#scope) defines the term.
- With your grant, it adds a short text on how to brief a subagent to the system context of a main session. [The brief text](#the-brief-text) says how.
- It fails open. [Fails open](PRIVACY.md#fails-open) says what that means and what OpenClaw can still do.
- The plugin changes a setting only when the owner types one of its three commands. It never writes `models`. [Change the options](#change-the-options) lists the commands.

## Install

The install commands are under [OpenClaw in the root README](https://github.com/Akurganow/model-router/blob/main/README.md#openclaw). The notes below explain them.

OpenClaw must be at or above the minimum version in [the harness table of the root README](https://github.com/Akurganow/model-router/blob/main/README.md#model-router).

The npm package is `@akurganow/model-router`. The plugin id is `model-router-openclaw`. The two names differ: OpenClaw uses the id as the config key. It prints an info line about the difference only when the CLI runs the install itself, not when a running Gateway installs. Install with the package name. Enable, configure, update and disable with the id.

The install command carries a prefix and two flags:

- `npm:` selects the npm registry only.
- `--force` confirms the source. Without it, a non-interactive install of an arbitrary npm package stops, and an interactive one asks.
- `--accept-capabilities` records your review of the plugin's declared tool, hook, commands and skills. A non-interactive install needs it.

Drop both flags in a terminal to answer OpenClaw's prompts instead. Review the source before you pass the flags. They skip OpenClaw's prompts.

The `inspect` step shows that OpenClaw installed and enabled the plugin. A good install reads `plugin.status: loaded`, `plugin.imported: true` and `plugin.enabled: true`. The step loads the plugin in tool-discovery mode, where the plugin registers only its `model_router_config` tool. The report lists that tool, and its lists of hooks and commands stay empty.

To see the hook and the commands, start or restart the Gateway and read its log with `openclaw logs --follow --plain`. Under verbose logging or file log level `debug`, the log holds `Registered plugin command: /model-router-provider (plugin: model-router-openclaw)`.

A running local Gateway applies the install, the enable and later config changes without a restart. A config change takes effect once OpenClaw replaces the plugin, after running work drains. [Provider and gateway](#provider-and-gateway) says what a spawn in that window sees. Without a running Gateway, OpenClaw saves the change for the next start.

[Facts behind the install](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-install-and-update)

## Set up

Routing needs a key. The models in the slots decide what each level runs on. The [setup skill](openclaw-skills/model-router-setup/SKILL.md) walks through them. Ask OpenClaw to run `model-router-setup`.

1. Assign any of `small_model`, `middle_model` and `large_model` in OpenClaw's config. Each slot is optional: a slot you leave unset runs its level on OpenClaw's model. Write each as the full `provider/model` id, because OpenClaw expands a bare name to a ref it may not know, and the child then fails. Use the Control UI page `/settings/plugins/model-router-openclaw`, or run:

   ```bash
   openclaw config set plugins.entries.model-router-openclaw.config.small_model <provider/model>
   openclaw config set plugins.entries.model-router-openclaw.config.middle_model <provider/model>
   openclaw config set plugins.entries.model-router-openclaw.config.large_model <provider/model>
   ```

   [What each model must support](#models) has more. The plugin has no command for the models.
2. Add a [key](#keys).
3. Pick the [provider](#provider-and-gateway), the [gateway](#provider-and-gateway) and the [scope of routing](#scope) if the defaults do not fit.
4. Check the routing, as [Verify](#verify) says.

## Verify

OpenClaw shows no line in the chat. Start a subagent, and read the Gateway log with `openclaw logs --follow --plain`. The plugin writes one line per spawn. [The log line](#the-log-line) shows an example and explains it. [Which spawns are routed](#which-spawns-are-routed) lists the `skipped` reasons. If no line appears, [No line at all?](#no-line-at-all) lists the causes.

## Keys

For each key holder the [`provider` and `gateway` settings](#provider-and-gateway) allow, the plugin checks two places for that holder's key, in this order: the plugin's setting, then the environment variable.

| Key holder | Setting | Variable |
| --- | --- | --- |
| TypeSafe | `api_key` | `TYPESAFE_API_KEY` |
| OpenAI | `openai_api_key` | `OPENAI_API_KEY` |
| Google | `google_api_key` | `GEMINI_API_KEY` |
| Perplexity | `perplexity_api_key` | `PERPLEXITY_API_KEY` |
| OpenRouter | `openrouter_api_key` | `OPENROUTER_API_KEY` |

[Where to get a key](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys) also says when a key counts as set and which Google variable the plugins do not read. OpenClaw's own OpenRouter provider reads `OPENROUTER_API_KEY` too. A key already in any variable of the table scores tasks when the `provider` and `gateway` settings allow its holder and the plugin's setting for that holder holds none. No other credential of OpenClaw serves as a scoring key.

Add a key in one of two ways:

- Fill the secret field in the plugin's settings page in the Control UI, with a plain text key or a SecretRef. OpenClaw's documentation says a plugin receives a SecretRef's resolved value, and the plugin reads that value. No live run has checked a SecretRef. The [secret inputs fact](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-runtime-logs-and-environment) has the source.
- Set the environment variable in the Gateway's own environment, then restart the Gateway. The variable is visible to every process the Gateway starts. [Stored data](PRIVACY.md#what-the-plugin-stores) covers a `.env` file.

Never type a key into the chat.

[Facts behind the keys](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-runtime-logs-and-environment)

## Provider and gateway

The `provider` and `gateway` settings decide who receives each task. By default, `provider` is `typesafe` and `gateway` is `direct`. [The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) lists the other values, says which of them cost more and tells where each sends the task.

The `gateway` setting is not OpenClaw's Gateway, the process that loads the plugin.

Who receives a spawn's task under each value: [the privacy policy](PRIVACY.md). [The model of each request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request) also says when the `jev-latest` alias moves.

Switch them with `/model-router-provider <value>` and `/model-router-gateway <value>`. The plugin reads each setting at each spawn. A change applies once OpenClaw replaces the plugin, after running work drains, up to 60 s. A spawn in that window uses the old value. A spawn that overlaps the replacement can fail with `Gateway requester authority changed`, which is OpenClaw's own error. The same holds for `/model-router-scope` and for the model slots.

[A setting that is not valid](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) says what a value outside a setting's list does, and lists the retired values of `provider`.

### The scoring model of each provider

The `models` setting names the scoring model of each provider. [The `models` setting](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-models-setting) lists its forms, its defaults, the OpenRouter names, when a value is not valid and the lines of the config tool. OpenClaw also takes a native object.

The tool is read-only, so the owner or the agent, on the owner's word, sets `models`. Use the Control UI page `/settings/plugins/model-router-openclaw`, or run:

```bash
openclaw config set plugins.entries.model-router-openclaw.config.models '<text>'
```

A change applies once OpenClaw replaces the plugin, after running work drains, up to 60 s. A spawn in that window uses the old value.

A `models` value that is not valid skips every spawn that does not pass through unchanged with `models not valid: run setup`.

The plugin registers [the migration ladder](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-migration-ladder) through OpenClaw's config migration. `openclaw doctor --fix` and an update run it. Today it changes nothing.

A stored `models` makes an older plugin version fail OpenClaw's config check, because the schema allows no unknown key. Remove the `models` setting before you install an older version.

## Scope

The `scope` setting picks which spawns the plugin routes:

| Value | Spawns routed |
| --- | --- |
| `core` (default) | The spawn of the requesting agent itself |
| `extended` | That spawn, and the spawn of any other configured agent that does not set its own model |

A value outside this list is not valid, as [the notes on a setting that is not valid](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) say.

Under `extended`, the plugin judges each spawn on its own. [The extended scope](PRIVACY.md#the-extended-scope) says what `extended` sends.

### The spawn of the requesting agent itself

The requester is the agent that makes the `sessions_spawn` call. The target agent is the agent the spawn runs: the one it names in `agentId`, or the requester when it names none. A spawn is the spawn of the requesting agent itself when both hold:

- It names no `agentId`, or it names the requester's own id. The plugin reads `agentId` [as OpenClaw's tool does](#how-the-plugin-reads-a-spawn). It compares the two ids as OpenClaw normalises them: it trims them, lower-cases them and turns invalid characters into dashes.
- Its `runtime` is absent or `subagent`.

## Change the options

Three commands show or change an option:

- `/model-router-provider [typesafe|openai|google|perplexity]`
- `/model-router-gateway [direct|auto|openrouter-first|openrouter]`
- `/model-router-scope [core|extended]`

[The option commands](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-option-commands) say what a command prints. A command from the owner with a valid value that differs from the stored text writes it to your OpenClaw config.

A Gateway client without `operator.admin` gets OpenClaw's own `This command requires gateway scope: operator.admin.` before the plugin runs, even for a bare read. The [`requiredScopes` check](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-commands-and-owner-check) has the source.

Only the owner can write. For anyone else, a command with a valid value prints `<setting> unchanged: only the owner can change it` and the setting's current line.

The read-only `model_router_config` tool returns the `provider` line, the `gateway` line, the `scope` line, the `models` lines, the slot lines and the key lines. The example shows the model line of one provider, and [The report lines](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-report-lines) show one for each. A slot line shows the slot string as you wrote it, or `unset`. [The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool) says what the key lines show and what the tool prints while a setting is not valid.

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

[Facts behind the commands](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-commands-and-owner-check)

## Models

After scoring, the plugin reads the slot the level picks. The slot is unset when it names no model.

An unset slot keeps the model OpenClaw would give the spawn, and the line names the slot: `L1 middle model unset`. The plugin still sets the effort, except where [the rules of kept efforts](#efforts-the-plugin-keeps) say otherwise. [A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) has the rule the omp, OpenClaw and Hermes plugins share.

Before you downgrade to a release without `middle_model`, remove the `middle_model` setting. OpenClaw checks the plugin's config against the manifest's closed schema, so it rejects a setting the older manifest lacks. After such a downgrade, the Gateway does not start until you remove the setting. `openclaw config validate` names the setting. [OpenClaw package files](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-package-files) has the runs.

Check these when you choose a model:

- **Sandboxed children.** OpenClaw does not sandbox a CLI backend. A child that must run sandboxed fails with a CLI-backend model.
- **Structured results.** A spawn that sets `outputSchema` runs a collector child, which needs tools. Assign tool-capable models to every slot.
- **Thinking.** The ladder sets `thinking` on the child. A model that keeps thinking off by default thinks when routing sets it.
- **An effort the model lacks.** OpenClaw rejects a spawn's `thinking` only when it names no known effort. It clamps a known effort the model does not support, such as `xhigh`, to a supported one at run time and shows a notice.

[Facts behind the models](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-hook-and-spawn)

## Routing

The judgment question picks the level, and the level picks the slot, as [the table under A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) lists.

The plugin stays at level 1 unless an end is clearly more likely. [model-choice.md](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/docs/model-choice.md#the-default-level) explains the factors.

## Effort

The work question picks the effort. The plugin sets `thinking` to one of these values and to no other:

| Work index | Level 0 | Level 1 or 2 |
| --- | --- | --- |
| 0, a short task | `medium` | `low` |
| 1, an ordinary task | `high` | `medium` |
| 2, a long or delicate task | `xhigh` | `high` |

The plugin never sets `max`, `ultra`, `adaptive`, `minimal` or `off`. The small model's row starts at `medium`. [model-choice.md on the work question](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/docs/model-choice.md#the-work-question-and-the-arch) gives the reasons.

The routed effort replaces the effort you chose in the calling session. The plugin sets `thinking` on the spawn, and OpenClaw would otherwise pass your session's effort to the child.

### Efforts the plugin keeps

The first rule that matches decides. The later rules are not checked.

1. The spawn sets `thinking`. The plugin routes the model and keeps your effort. The line shows `caller effort`.
2. `agents.defaults.subagents.thinking` is set. It is your global effort for subagents. The plugin routes the model and sets no `thinking`. The line shows `config effort`.
3. Under `core`, the requesting agent sets `subagents.thinking`. The plugin keeps it, and the line shows `config effort`.
4. Under `extended`, the requesting agent or the target agent sets `subagents.thinking`. The ladder effort replaces it.
5. Otherwise the plugin sets the ladder effort.

Under `extended` with both a global value and a per-agent value, rule 2 decides. The plugin sets no `thinking`, and OpenClaw's own precedence applies the per-agent value.

With an unset slot and a kept effort, there is nothing to set. The plugin returns nothing and still logs the line.

## The brief text

The plugin adds a short text on how to brief a subagent to the system context of each main session. A spawned child gets nothing. [The brief text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-brief-text) says what it holds.

OpenClaw builds the `sessions_spawn` description itself and no hook changes it, so the text goes into the system context.

The text is off until you grant the plugin conversation access, because OpenClaw registers the prompt hook of a plugin like this one only then. [What the plugin stores](PRIVACY.md#what-the-plugin-stores) says what the grant opens. To turn the text on, run this line in a shell:

```sh
openclaw config set plugins.entries.model-router-openclaw.hooks.allowConversationAccess true
```

In its default reload mode, OpenClaw applies the change on its own. A restart applies it in full:

```sh
openclaw gateway restart
```

To turn the text off, set that grant to `false`, or set `plugins.entries.model-router-openclaw.hooks.allowPromptModification` to `false`. Older OpenClaw releases name this key `allowPromptInjection`. Then restart the Gateway.

## Which spawns are routed

### No line at all?

A spawn with no `model-router` line in the Gateway log has one of four causes:

- The Gateway has not loaded the plugin. Run `openclaw plugins inspect model-router-openclaw --runtime --json`. `plugin.status` must read `loaded` and `plugin.enabled` must read `true`. Then restart the Gateway. [Install](#install) says where the commands are.
- The spawn [passes without a line](#spawns-that-pass-without-a-line).
- The spawn takes a [path the hook never sees](#paths-the-hook-never-sees).
- The hook timeout is too short for the plugin to run. [Hook timeout](#hook-timeout) gives the floor.

### Spawns that pass without a line

These spawns pass through unchanged, and the plugin logs nothing:

- The spawn sets a text `model` that is not empty and not `default`, in any case.
- The spawn sets a `runtime` other than `subagent`, such as `acp`.
- The spawn sets an `agentId`, or an `agent_id` when `agentId` is absent, that is not text and not `null`.
- The spawn sets `visible: true`, `context: "fork"`, `mode: "session"` or `thread: true`.
- The spawn sets no `task`, or a `task` that is not text.

### The gates

For every other spawn, the gates run in this order. The first that fails skips the spawn with its reason, and OpenClaw runs the spawn as it would without the plugin. A tag says which spawns the gate can stop: "(every spawn)" includes [the requesting agent's own spawn](#the-spawn-of-the-requesting-agent-itself), "(another agent)" does not, and "(requesting agent)" stops only that spawn.

1. (every spawn) `<setting> not valid: run setup`: a stored `provider`, `gateway` or `scope` holds a value outside its list, or `models` is not valid. [Not valid: run setup](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid) says which setting the reason names and how to set a valid value.
2. (every spawn) `key unset`: no path the `gateway` setting allows has a key.
3. (another agent) `<id> is outside the core scope`: under `core`, the spawn names another agent.
4. (every spawn) `subagent model set`: `agents.defaults.subagents.model`, or the target agent's `subagents.model`, is set. OpenClaw's own choice decides.
5. (another agent) `<id> agent discovery failed`: under `extended`, the plugin cannot read OpenClaw's config.
6. (another agent) `<id> agent unknown`: under `extended`, the agent is not in [the roster](#the-agent-roster).
7. (another agent) `<id> sets its own model`: under `extended`, the agent's entry sets a `model`.
8. (requesting agent) `settings unreadable`: the plugin cannot read OpenClaw's live config. A spawn of another agent stops at gate 3 or gate 5 first.

### The agent roster

The plugin finds an agent in either roster by its normalised id, as OpenClaw does. The roster is `agents.entries` or, when `entries` is absent, the older `agents.list`. The first roster present is the only one it reads.

### After the gates

A scored spawn can still skip:

- `timeout`: the first of two attempts got no answer in 5 s, or the routing limit expired before the plugin finished routing. Once the limit has expired, the line reads `timeout` alone, even after the first attempt failed. [The hook's three limits](#hook-timeout) give the limit.
- `cancelled`: OpenClaw cancelled the `sessions_spawn` call before the plugin finished routing.
- `HTTP <status>`, `network error`, `bad reply` or `failed`: the attempt gave no score. [A failed attempt](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-failed-attempt) explains each. [The fallback rule of the line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says how the line names two of them.

### How the plugin reads a spawn

The plugin reads the parameters of a `sessions_spawn` call as OpenClaw's tool does.

- For `agentId`, `label`, `model` and `thinking`, the plugin takes the key as written. It takes the snake_case key, such as `agent_id`, only when the written key is absent.
- The plugin counts the value only when it is a string, except `agentId`. [The list of spawns without a line](#spawns-that-pass-without-a-line) says what a non-text `agentId` does. It trims the value, and an empty value counts as absent.
- The plugin reads `runtime` and `taskName` as written.

### The role the scoring model reads

[What the plugin sends](PRIVACY.md#what-the-plugin-sends) says which role text the scoring model reads with the task. [model-choice.md on the role of the default agent](https://github.com/Akurganow/model-router/blob/main/plugins/model-router/docs/model-choice.md#the-role-of-the-default-agent) says why this plugin differs from the others.

[Facts behind the routed spawns](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-hook-and-spawn)

## The log line

OpenClaw shows no line in the chat. The plugin writes one line per routed or skipped spawn to the Gateway log. Read it with `openclaw logs --follow --plain`. The line starts with `model-router`.

```text
model-router L0 acme/small · medium · p=0.91/0.84 · typesafe jev-1.14.0 · 812/9 tok
model-router L1 middle model unset · caller effort · p=0.62/0.70 · typesafe jev-1.14.0 · 640/9 tok
model-router skipped, key unset
```

A routed line reads `L<level> <model or slot state> · <effort or kept label> · p=<tier>/<work>`. The model is the slot string as you wrote it. The slot state is `<slot> model unset`, as [the rule of an unset slot](#models) says. [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says what else it holds.

A skipped line reads `skipped, <reason>`. [The gates and what follows them](#which-spawns-are-routed) list the reasons. The plugin logs one warning when a hook timeout makes it inert, as [the floor of the hook timeout](#hook-timeout) says.

## Limits

- **OpenClaw can still say no.** [Fails open in the privacy policy](PRIVACY.md#fails-open) says what OpenClaw can still do after the plugin sets a model.
- **Later hooks.** Handlers run by descending priority, and the plugin uses priority 100. A later plugin that returns `params` replaces the plugin's result whole.
- **Parallel spawns.** [Requests and billing](PRIVACY.md#requests-and-billing) says what many parallel spawns cost.

### Paths the hook never sees

The plugin hooks the `sessions_spawn` tool. A spawn that does not call that tool is never routed. Five paths start an agent session without it:

- `/acp spawn`
- the gateway method `sessions.create`
- the Control UI's new session
- `api.runtime.subagent.run` from another plugin
- Codex's own `spawn_agent`. [OpenClaw hook and spawn](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-hook-and-spawn) says why.

### Hook timeout

Three limits bound the time a spawn waits for routing:

| Limit | Value | What it bounds |
| --- | --- | --- |
| Hook timeout | 12 s | The whole hook. The plugin registers it with this value. |
| Routing limit | 10 s | The plugin's work in the hook: both attempts and all retries. |
| First-attempt wait | 5 s | The first of two attempts. It gets no retry. |

An operator overrides the hook timeout with `plugins.entries.model-router-openclaw.hooks.timeouts.before_tool_call` or `hooks.timeoutMs`.

- **The limit.** The routing limit shrinks to the hook timeout minus 2 s when that is smaller. The margin keeps the plugin ahead of OpenClaw's own timeout. When the routing limit expires, the plugin logs `skipped, timeout`, sets nothing and lets the spawn run unchanged.
- **The floor.** A hook timeout below 3000 ms leaves less than 1 s to route, so the plugin routes nothing.
- **The warning.** For such a timeout, the plugin logs one warning at start-up. It names the timeout and the value to set.

[Facts behind the limits](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#openclaw-hook-and-spawn)

## Update

Run these lines in a shell, then restart the Gateway:

```sh
openclaw plugins update model-router-openclaw
openclaw gateway restart
```

## Turn it off

To turn routing off, run this line in a shell:

```sh
openclaw plugins disable model-router-openclaw
```

The plugin sends nothing while it is disabled. Removing the key of every path the `gateway` setting allows also stops routing, and every spawn that does not pass through unchanged then reports `key unset`.

## What leaves the machine

[PRIVACY.md](PRIVACY.md) lists the request, the companies and the retries.

[How the plugins use the providers](https://github.com/Akurganow/model-router/blob/main/docs/providers.md) holds what the four plugins share.

### What the plugin reads and writes

[What the plugin stores](PRIVACY.md#what-the-plugin-stores) lists what the plugin reads and writes. The plugin starts no program.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
