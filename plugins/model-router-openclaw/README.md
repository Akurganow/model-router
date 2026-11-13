# model-router for OpenClaw

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that picks a model and an effort for each subagent. It asks [Jev](https://docs.typesafe.ai), on TypeSafe or OpenRouter, how much judgment the task needs and how much work it takes. It then sets the `model` and `thinking` of that `sessions_spawn` call.

## What it does

- It scores each routed `sessions_spawn` call through Jev, using the `jev-latest` alias. One request asks two questions: how much judgment the task needs, and how much work it takes.
- Level 0 sets your `small_model`, level 1 your `middle_model` and level 2 your `large_model`. A slot can be unset, or name a model OpenClaw cannot run. Its level then keeps OpenClaw's model and gets the effort alone, as [Routing](#routing) says.
- It sets `thinking` from a fixed ladder of efforts, as [Routing](#routing) says.
- It sets only a model you assigned, and never a model that OpenClaw cannot resolve with a credential.
- It never overrides a model you chose, nor an effort the spawn or the global config sets. [Which spawns are routed](#which-spawns-are-routed) lists the model rules, and [Efforts the plugin keeps](#efforts-the-plugin-keeps) lists the effort rules.
  Under `extended`, [rule 4](#efforts-the-plugin-keeps) replaces the requester's `subagents.thinking`, which OpenClaw applies to a cross-agent spawn.
- Under the default `core` scope, it routes only [the spawn of the requesting agent itself](#the-spawn-of-the-requesting-agent-itself). [Scope](#scope) defines the term.
- It fails open. [Fails open](PRIVACY.md#fails-open) says what that means and what OpenClaw can still do.
- The plugin changes a setting only when the owner types one of its two commands. [Change the options](#change-the-options) lists them.

## Install

The install commands are under [OpenClaw](../../README.md#openclaw) in the root README. The notes below explain them.

The npm package is `@akurganow/model-router`. The plugin id is `model-router-openclaw`. The two names differ: OpenClaw uses the id as the config key. It prints an info line about the difference only when the CLI runs the install itself, not when a running Gateway installs. Install with the package name. Enable, configure, update and disable with the id.

The install command carries a prefix and two flags:

- `npm:` selects the npm registry only.
- `--force` confirms the source. Without it, a non-interactive install of an arbitrary npm package stops, and an interactive one asks.
- `--accept-capabilities` records your review of the plugin's declared tool, hook, commands and skills. A non-interactive install needs it.

Drop both flags in a terminal to answer OpenClaw's prompts instead. Review the source before you pass the flags. They skip OpenClaw's prompts.

The `inspect` step shows that OpenClaw installed and enabled the plugin. A good install reads `plugin.status: loaded`, `plugin.imported: true` and `plugin.enabled: true`. The step loads the plugin in tool-discovery mode, where the plugin registers only its `model_router_config` tool. The report lists that tool, and its lists of hooks and commands stay empty.

To see the hook and the commands, start or restart the Gateway and read its log with `openclaw logs --follow --plain`. Under verbose logging or file log level `debug`, the log holds `Registered plugin command: /model-router-provider (plugin: model-router-openclaw)`.

A running local Gateway applies the install, the enable and later config changes without a restart. A config change takes effect once OpenClaw replaces the plugin, after running work drains. [Provider](#provider) says what a spawn in that window sees. Without a running Gateway, OpenClaw saves the change for the next start.

[Facts behind this section](../../docs/clients.md#openclaw-install-and-update)

## Set up

Routing needs a key. The models in the slots decide what each level runs on. The [setup skill](openclaw-skills/model-router-setup/SKILL.md) walks through them. Ask OpenClaw to run `model-router-setup`.

1. Assign `small_model`, `middle_model` and `large_model` in OpenClaw's config. Write each as the full `provider/model` id, because OpenClaw expands a bare name to a ref it may not know, and the child then fails. Use the Control UI page `/settings/plugins/model-router-openclaw`, or run:

   ```bash
   openclaw config set plugins.entries.model-router-openclaw.config.small_model <provider/model>
   openclaw config set plugins.entries.model-router-openclaw.config.middle_model <provider/model>
   openclaw config set plugins.entries.model-router-openclaw.config.large_model <provider/model>
   ```

   Pick models of a provider that has an API key, because the plugin sets no model that OpenClaw holds no credential for. [Choosing models](#choosing-models) has more. The plugin has no command for the models.
2. Add a [key](#keys).
3. Pick the [provider](#provider) and the [scope](#scope) if the defaults do not fit.
4. Watch the Gateway log with `openclaw logs --follow --plain`, and start a subagent. [The log line](#the-log-line) shows the decision.

## Keys

For each provider the [`provider` setting](#provider) allows, the plugin checks two places, in this order:

- TypeSafe: the plugin's `api_key` setting, then the `TYPESAFE_API_KEY` environment variable.
- OpenRouter: the plugin's `openrouter_api_key` setting, then the `OPENROUTER_API_KEY` environment variable.

A key counts as set when either place holds a non-empty value. [Keys](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys) says where to get one and where a key goes. The plugin never uses OpenClaw's own provider credentials as a Jev key.

Add a key in one of two ways:

- Fill the secret field in the plugin's settings page in the Control UI, with a plain text key or a SecretRef. OpenClaw's documentation says a plugin receives a SecretRef's resolved value, and the plugin reads that value. No live run has checked a SecretRef. The [secret inputs fact](../../docs/clients.md#openclaw-runtime-logs-and-environment) has the source.
- Set the environment variable in the Gateway's own environment, then restart the Gateway. The variable is visible to every process the Gateway starts. [What the plugin stores](PRIVACY.md#what-the-plugin-stores) covers a `.env` file.

Never type a key into the chat.

[Facts behind this section](../../docs/clients.md#openclaw-runtime-logs-and-environment)

## Provider

The `provider` setting picks which providers judge each task, and in which order:

| Value | Providers |
| --- | --- |
| `typesafe` (default) | TypeSafe only |
| `openrouter` | OpenRouter only |
| `auto` | TypeSafe, then OpenRouter |
| `openrouter-first` | OpenRouter, then TypeSafe |

Fallback rules: [Which provider gets a task](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#which-provider-gets-a-task). Who receives a spawn's task under each value: [PRIVACY.md](PRIVACY.md).

Switch it with `/model-router-provider <value>`. The plugin reads the setting at each spawn. A change applies once OpenClaw replaces the plugin, after running work drains, up to 60 s. A spawn in that window uses the old value. A spawn that overlaps the replacement can fail with `Gateway requester authority changed`, which is OpenClaw's own error. The same holds for `/model-router-scope` and for the model slots.

## Scope

The `scope` setting picks which spawns the plugin routes:

| Value | Spawns routed |
| --- | --- |
| `core` (default) | The spawn of the requesting agent itself |
| `extended` | That spawn, and the spawn of any other configured agent that does not set its own model |

A value outside the two counts as unset, and the default `core` applies.

Under `extended`, the plugin judges each spawn on its own. [PRIVACY.md](PRIVACY.md#the-extended-scope) says what `extended` sends.

### The spawn of the requesting agent itself

The requester is the agent that makes the `sessions_spawn` call. The target agent is the agent the spawn runs: the one it names in `agentId`, or the requester when it names none. A spawn is the spawn of the requesting agent itself when both hold:

- It names no `agentId`, or it names the requester's own id. The plugin reads `agentId` [as OpenClaw's tool does](#how-the-plugin-reads-a-spawn). It compares the two ids as OpenClaw normalises them: it trims them, lower-cases them and turns invalid characters into dashes.
- Its `runtime` is absent or `subagent`.

## Change the options

Two commands show or change an option:

- `/model-router-provider [auto|openrouter-first|typesafe|openrouter]`
- `/model-router-scope [core|extended]`

[The option commands](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-option-commands) say what a command prints. A command with a valid value writes it to your OpenClaw config.

A Gateway client without `operator.admin` gets OpenClaw's own `This command requires gateway scope: operator.admin.` before the plugin runs, even for a bare read. The [`requiredScopes` check](../../docs/clients.md#openclaw-commands-and-owner-check) has the source.

Only the owner can write. For anyone else the command prints `<setting> unchanged: only the owner can change it` and the current value.

The read-only `model_router_config` tool returns the `provider` line, the `scope` line, the three model lines and the key lines. A model line shows the slot string as you wrote it, or `unset`. The tool runs no check on it. [The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool) says what the key lines show.

```text
provider: auto (typesafe, then openrouter)
scope: core
small_model: acme/small
middle_model: unset
large_model: unset
typesafe key: set
openrouter key: unset
```

Given `provider` or `scope`, the tool returns the command to type. Given `small_model`, `middle_model` or `large_model`, it answers that the slot is set on the plugin's settings page, or with `openclaw config set plugins.entries.model-router-openclaw.config.<name> <provider/model>`. It writes nothing.

[Facts behind this section](../../docs/clients.md#openclaw-commands-and-owner-check)

## Routing

| Level | Judgment the task needs | Slot | Model the plugin sets |
| --- | --- | --- | --- |
| 0 | Lookup or transcription | `small` | `small_model` |
| 1 | Bounded judgment | `middle` | `middle_model` |
| 2 | Open judgment | `large` | `large_model` |

The plugin stays at level 1 unless an end is clearly more likely. [model-choice.md](../model-router/docs/model-choice.md#the-default-level) explains the factors.

After scoring, the plugin checks the slot the level picks. The slot is unset when it names no model. It is unresolved when OpenClaw cannot resolve its string for the target agent, or holds no credential for its provider. [Choosing models](#choosing-models) names a case. A model of a local provider with no key reads unresolved too, because the check needs a credential for its provider. [OpenClaw model and credential checks](../../docs/clients.md#openclaw-model-and-credential-checks) has the run. The check makes no network request.

An unset or unresolved slot keeps the model OpenClaw would give the spawn, and the line names the slot: `L1 middle model unset` or `L2 large model unresolved`. The plugin still sets the effort, except where [Efforts the plugin keeps](#efforts-the-plugin-keeps) says otherwise. [A slot with no model](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-slot-with-no-model) has the rule the omp, OpenClaw and Hermes plugins share.

Before you downgrade to a release without `middle_model`, remove the `middle_model` setting. OpenClaw checks the plugin's config against the manifest's closed schema, so it rejects a setting the older manifest lacks. After such a downgrade, the Gateway does not start until you remove the setting. `openclaw config validate` names the setting. [OpenClaw package files](../../docs/clients.md#openclaw-package-files) has the runs.

The work question picks the effort. The plugin sets `thinking` to one of these values and to no other:

| Work index | Level 0 | Level 1 or 2 |
| --- | --- | --- |
| 0, a short task | `medium` | `low` |
| 1, an ordinary task | `high` | `medium` |
| 2, a long or delicate task | `xhigh` | `high` |

The plugin never sets `max`, `ultra`, `adaptive`, `minimal` or `off`. The small model's row starts at `medium`. [model-choice.md](../model-router/docs/model-choice.md#the-work-question-and-the-arch) gives the reasons.

The routed effort replaces the effort you chose in the calling session. The plugin sets `thinking` on the spawn, and OpenClaw would otherwise pass your session's effort to the child.

### Efforts the plugin keeps

The first rule that matches decides. The later rules are not checked.

1. The spawn sets `thinking`. The plugin routes the model and keeps your effort. The line shows `caller effort`.
2. `agents.defaults.subagents.thinking` is set. It is your global effort for subagents. The plugin routes the model and sets no `thinking`. The line shows `config effort`.
3. Under `core`, the requesting agent sets `subagents.thinking`. The plugin keeps it, and the line shows `config effort`.
4. Under `extended`, the requesting agent or the target agent sets `subagents.thinking`. The ladder effort replaces it.
5. Otherwise the plugin sets the ladder effort.

Under `extended` with both a global value and a per-agent value, rule 2 decides. The plugin sets no `thinking`, and OpenClaw's own precedence applies the per-agent value.

With an unset or unresolved slot and a kept effort, there is nothing to set. The plugin returns nothing and still logs the line.

## Which spawns are routed

### No line at all?

A spawn with no `model-router` line in the Gateway log has one of four causes:

- The Gateway has not loaded the plugin. Run `openclaw plugins inspect model-router-openclaw --runtime --json`. `plugin.status` must read `loaded` and `plugin.enabled` must read `true`. Then restart the Gateway. [Install](#install) has the commands.
- The spawn [passes without a line](#spawns-that-pass-without-a-line).
- The spawn takes a [path the hook never sees](#paths-the-hook-never-sees).
- The hook timeout is too short for the plugin to run. [Hook timeout](#hook-timeout) gives the floor.

### Spawns that pass without a line

These spawns pass through unchanged, and the plugin logs nothing:

- The spawn sets a text `model` that is not empty and not `default`, in any case.
- The spawn sets a `runtime` other than `subagent`, such as `acp`.
- The spawn sets an `agentId`, or an `agent_id` when `agentId` is absent, that is present but not text.
- The spawn sets `visible: true`, `context: "fork"`, `mode: "session"` or `thread: true`.
- The spawn has no `task` text.

### The gates

For every other spawn, the gates run in this order. The first that fails skips the spawn with its reason, and OpenClaw runs the spawn as it would without the plugin. A tag says which spawns the gate can stop: "(every spawn)" includes [the spawn of the requesting agent itself](#the-spawn-of-the-requesting-agent-itself), and "(another agent)" does not.

1. (every spawn) `key unset`: no provider the `provider` setting allows has a key.
2. (another agent) `<id> is outside the core scope`: under `core`, the spawn names another agent.
3. (every spawn) `subagent model set`: `agents.defaults.subagents.model`, or the target agent's `subagents.model`, is set. OpenClaw's own choice decides.
4. (another agent) `<id> agent discovery failed`: under `extended`, the plugin cannot read OpenClaw's config.
5. (another agent) `<id> agent unknown`: under `extended`, the agent is not in [the roster](#the-agent-roster).
6. (another agent) `<id> sets its own model`: under `extended`, the agent's entry sets a `model`.
7. (every spawn) `settings unreadable`: the plugin cannot read OpenClaw's live config.

### The agent roster

The plugin finds an agent in either roster by its normalised id, as OpenClaw does. The roster is `agents.entries` or, when `entries` is absent, the older `agents.list`. The first roster present is the only one it reads.

### After the gates

A scored spawn can still skip:

- `timeout`: the routing limit expired before the plugin finished routing. The line reads `timeout` alone, even after a first provider failed. [Hook timeout](#hook-timeout) gives the limit.
- `cancelled`: OpenClaw cancelled the `sessions_spawn` call before the plugin finished routing.
- `HTTP <status>`, `network error`, `rejected request`, `bad reply` or `failed`: Jev did not answer. After two providers, the reason names each, as [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says.

### How the plugin reads a spawn

The plugin reads the parameters of a `sessions_spawn` call as OpenClaw's tool does.

- For `agentId`, `label`, `model` and `thinking`, the plugin takes the key as written. It takes the snake_case key, such as `agent_id`, only when the written key is absent.
- The plugin counts the value only when it is a string, except `agentId`. [Spawns that pass without a line](#spawns-that-pass-without-a-line) says what a non-text `agentId` does. It trims the value, and an empty value counts as absent.
- The plugin reads `runtime` and `taskName` as written.

### The role Jev reads

[What the plugin sends](PRIVACY.md#what-the-plugin-sends) says which role text Jev reads with the task. [model-choice.md](../model-router/docs/model-choice.md#the-role-of-the-default-agent) says why this plugin differs from the others.

[Facts behind this section](../../docs/clients.md#openclaw-hook-and-spawn)

## The log line

OpenClaw shows no line in the chat. The plugin writes one line per routed or skipped spawn to the Gateway log. Read it with `openclaw logs --follow --plain`. The line starts with `model-router`.

```text
model-router L0 acme/small · medium · p=0.91/0.84 · jev jev-1.14.0 · 812/9 tok
model-router L1 middle model unset · caller effort · p=0.62/0.70
model-router skipped, key unset
```

A routed line reads `L<level> <model or slot state> · <effort or kept label> · p=<tier>/<work>`. The model is the slot string as you wrote it. The slot state is `<slot> model unset` or `<slot> model unresolved`, as [Routing](#routing) says. [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says what else it holds.

A skipped line reads `skipped, <reason>`. [Which spawns are routed](#which-spawns-are-routed) lists the reasons. The plugin logs one warning when a hook timeout makes it inert, as [Hook timeout](#hook-timeout) says.

## Choosing models

- **Runtime-owned auth.** A model whose provider authenticates through the runtime, such as the Claude CLI backend, reads as unresolved. The spawn keeps OpenClaw's model, and the line reads `<slot> model unresolved`.
- **Sandboxed children.** OpenClaw does not sandbox a CLI backend. A child that must run sandboxed fails with a CLI-backend model. The slots take API-key models.
- **Structured results.** A spawn that sets `outputSchema` runs a collector child, which needs tools. Assign tool-capable models to every slot.
- **Thinking.** The ladder sets `thinking` on the child. A model that keeps thinking off by default thinks when routing sets it.
- **An effort the model lacks.** OpenClaw rejects a spawn's `thinking` only when it names no known effort. It clamps a known effort the model does not support, such as `xhigh`, to a supported one at run time and shows a notice.

[Facts behind this section](../../docs/clients.md#openclaw-hook-and-spawn)

## Routing behaviour

- **OpenClaw can still say no.** [Fails open](PRIVACY.md#fails-open) says what OpenClaw can still do after the plugin sets a model.
- **Later hooks.** Handlers run by descending priority, and the plugin uses priority 100. A later plugin that returns `params` replaces the plugin's result whole.
- **Parallel spawns.** [Requests and billing](PRIVACY.md#requests-and-billing) says what many parallel spawns cost.

### Paths the hook never sees

The plugin hooks the `sessions_spawn` tool. A spawn that does not call that tool is never routed. Five paths start an agent session without it:

- `/acp spawn`
- the gateway method `sessions.create`
- the Control UI's new session
- `api.runtime.subagent.run` from another plugin
- Codex's own `spawn_agent`. [OpenClaw hook and spawn](../../docs/clients.md#openclaw-hook-and-spawn) says why.

### Hook timeout

Four limits bound the time a spawn waits for routing:

| Limit | Value | What it bounds |
| --- | --- | --- |
| Hook timeout | 10 s | The whole hook. The plugin registers it with this value. |
| Routing limit | 8 s | The plugin's work in the hook: both providers and all retries. |
| Jev timeout | 10 s | One request to one provider. It is the SDK default. |
| Per-provider wait | 2 s | The first of two providers. It gets no retry. |

The routing limit is shorter than the Jev timeout, so it ends a slow request first.

An operator overrides the hook timeout with `plugins.entries.model-router-openclaw.hooks.timeouts.before_tool_call` or `hooks.timeoutMs`.

- **The limit.** The routing limit shrinks to the hook timeout minus 2 s when that is smaller. The margin keeps the plugin ahead of OpenClaw's own timeout. When the routing limit expires, the plugin logs `skipped, timeout`, sets nothing and lets the spawn run unchanged.
- **The floor.** A hook timeout below 3000 ms leaves less than 1 s to route, so the plugin routes nothing.
- **The warning.** For such a timeout, the plugin logs one warning at start-up. It names the timeout and the value to set.

[Facts behind this section](../../docs/clients.md#openclaw-hook-and-spawn)

## What the plugin reads and writes

[What the plugin stores](PRIVACY.md#what-the-plugin-stores) lists what the plugin reads and writes.

## What leaves the machine

[PRIVACY.md](PRIVACY.md) lists the request, the providers and the retries.

[How the plugins use the providers](https://github.com/Akurganow/model-router/blob/main/docs/providers.md) holds what the four plugins share.

## Turn it off

[Turn off and uninstall](../../README.md#turn-off-and-uninstall) has the command and says what else stops routing.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
