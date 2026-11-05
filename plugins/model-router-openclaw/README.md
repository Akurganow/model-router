# model-router for OpenClaw

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that picks a model and an effort for each subagent. It asks [Jev](https://docs.typesafe.ai), on TypeSafe or OpenRouter, how much judgment the task needs and how much work it takes. It then sets the `model` and `thinking` of that `sessions_spawn` call.

## What it does

- It scores each eligible `sessions_spawn` call through Jev, using the `jev-latest` alias. One request asks two questions: how much judgment the task needs, and how much work it takes.
- Level 0 sets your `small_model`. Level 2 sets your `large_model`. Level 1 leaves the model alone.
- It sets `thinking` from a fixed ladder of efforts, as [Routing](#routing) says.
- It sets only a model you assigned. It proposes none, and it never sets a model that OpenClaw cannot resolve with a credential.
- It never overrides a model or an effort you chose. [Which spawns are routed](#which-spawns-are-routed) lists the rules.
- Under the default `core` scope, it routes only [the spawn of the requesting agent itself](#the-spawn-of-the-requesting-agent-itself). [Scope](#scope) defines the term.
- It fails open. It never blocks a spawn, never asks for approval and never throws into OpenClaw. [Limits](#limits) says what OpenClaw can still do.
- The plugin changes a setting only when the owner types one of its two commands. [Change the options](#change-the-options) lists them.

## Install

The npm package is `@akurganow/model-router`. The plugin id is `model-router-openclaw`. The two names differ: OpenClaw notes it in an info line during install and uses the id as the config key. Install with the package name. Enable, configure, update and disable with the id.

The [repository README](../../README.md#openclaw) holds the install, enable and inspect commands. The npm package exists only after the first publication. CI installs the packed tarball through `npm-pack:`, as [OpenClaw install and update](../../docs/clients.md#openclaw-install-and-update) records.

The install command carries a prefix and two flags:

- `npm:` selects the npm registry only.
- `--force` confirms the source. Without it, a non-interactive install of an arbitrary npm package stops, and an interactive one asks.
- `--accept-capabilities` records your review of the plugin's declared tool, hook, commands and skills. A non-interactive install needs it.

Drop both flags in a terminal to answer OpenClaw's prompts instead. Review the source before you pass the flags. They skip OpenClaw's prompts.

The `inspect` step shows that OpenClaw installed and enabled the plugin. It loads the plugin in tool-discovery mode, where the plugin registers nothing. Its lists of registered hooks, tools and commands stay empty, and only the manifest's `contracts.tools` names `model_router_config`. [OpenClaw install and update](../../docs/clients.md#openclaw-install-and-update) records the output.

To see the registration, start or restart the Gateway and read its log with `openclaw logs --follow --plain`. Under verbose logging or file log level `debug`, the log holds `Registered plugin command: /model-router-provider (plugin: model-router-openclaw)`. [OpenClaw install and update](../../docs/clients.md#openclaw-install-and-update) gives the source of the line.

A running local Gateway applies the install, the enable and later config changes without a restart. Without a running Gateway, OpenClaw saves the change for the next start. When the registration line is missing, run `openclaw gateway restart`.

To update, run `openclaw plugins update model-router-openclaw`, then restart the Gateway. To switch routing off, run `openclaw plugins disable model-router-openclaw`.

For development only, link a checkout's plugin folder instead of installing from npm:

```bash
openclaw plugins install --link ./plugins/model-router-openclaw --force --accept-capabilities
```

The link adds the folder to `plugins.load.paths`. The folder holds the generated manifest and bundle. After an edit, run `openclaw plugins reload model-router-openclaw`.

## Set up

Routing needs a model in a slot and a key. The [setup skill](openclaw-skills/model-router-setup/SKILL.md) walks through them. Ask OpenClaw to run `model-router-setup`.

1. Assign `small_model` and `large_model` in OpenClaw's config. Write each as `provider/model`. A bare name gets the default provider of the agent. Use the Control UI page `/settings/plugins/model-router-openclaw`, or run:

   ```bash
   openclaw config set plugins.entries.model-router-openclaw.config.small_model <provider/model>
   openclaw config set plugins.entries.model-router-openclaw.config.large_model <provider/model>
   ```

   Pick models of a provider that has an API key. [Limits](#limits) says why. The plugin has no command for the models.
2. Add a [key](#keys).
3. Pick the [provider](#provider) and the [scope](#scope) if the defaults do not fit.
4. Watch the Gateway log with `openclaw logs --follow --plain`, and start a subagent. [The log line](#the-log-line) shows the decision.

## Keys

The plugin reads a key only for a provider the [`provider` setting](#provider) allows. For each one it checks two places, in this order:

- TypeSafe: the plugin's `api_key` setting, then the `TYPESAFE_API_KEY` environment variable.
- OpenRouter: the plugin's `openrouter_api_key` setting, then the `OPENROUTER_API_KEY` environment variable.

A key counts as set when either place holds a non-empty value. Get a key from [TypeSafe](https://console.typesafe.ai/keys) or from [OpenRouter](https://openrouter.ai). Each key goes only to its own provider. The plugin never uses OpenClaw's own provider credentials as a Jev key. With no key for any allowed provider, every spawn reports `key unset`.

Add a key in one of two ways:

- Fill the secret field in the plugin's settings page in the Control UI. OpenClaw stores it as a secret input. OpenClaw's documentation says plugins receive resolved values for declared `secretInputs` paths. The plugin reads the live config first, where it skips a SecretRef object that is not resolved, then `api.pluginConfig`. No live probe has checked a SecretRef: [OpenClaw runtime, logs and environment](../../docs/clients.md#openclaw-runtime-logs-and-environment) records the fact and the gap.
- Set the environment variable in the Gateway's own environment, then restart the Gateway. The variable is visible to every process the Gateway starts. [PRIVACY.md](PRIVACY.md#what-the-plugin-stores) says more.

Never type a key into the chat.

## Provider

The `provider` setting picks which providers judge each task, and in which order:

| Value | Providers |
| --- | --- |
| `typesafe` (default) | TypeSafe only |
| `openrouter` | OpenRouter only |
| `auto` | TypeSafe, then OpenRouter |
| `openrouter-first` | OpenRouter, then TypeSafe |

With `auto` or `openrouter-first` and only one key, that key's provider judges alone. A value outside the four counts as unset, and the default `typesafe` applies. [PRIVACY.md](PRIVACY.md) says which company receives the task under each value.

Switch it with `/model-router-provider <value>`. The plugin reads the setting at each spawn, so a change reaches the next spawn.

## Scope

The `scope` setting picks which spawns the plugin routes:

| Value | Spawns routed |
| --- | --- |
| `core` (default) | The spawn of the requesting agent itself |
| `extended` | That spawn, and the spawn of any other configured agent whose model you did not set |

A value outside the two counts as unset, and the default `core` applies.

Under `extended`, the plugin judges each spawn on its own. [PRIVACY.md](PRIVACY.md#the-extended-scope) says what `extended` sends.

### The spawn of the requesting agent itself

The requester is the agent that makes the `sessions_spawn` call. A spawn is the spawn of the requesting agent itself when both hold:

- It names no `agentId`, or it names the requester's own id. The plugin compares the two ids as OpenClaw normalises them: it trims them, lower-cases them and turns invalid characters into dashes.
- Its `runtime` is absent or `subagent`.

## Change the options

Two commands show or change an option:

- `/model-router-provider [auto|openrouter-first|typesafe|openrouter]`
- `/model-router-scope [core|extended]`

A bare command prints the current value. A command with a valid value writes it to your OpenClaw config and prints the new value. An invalid value lists the allowed ones. A refused or failed write prints `<setting> unchanged: <reason>`.

Only the owner can write. Both commands declare the `operator.admin` scope as required. OpenClaw blocks a gateway client without that scope before the handler runs. It lets a channel message from the owner through, because a channel message carries no gateway scopes. [OpenClaw commands and owner check](../../docs/clients.md#openclaw-commands-and-owner-check) has the source. The handler then checks the owner flag. For anyone else the command prints `<setting> unchanged: only the owner with the operator.admin scope can change it` and the current value.

The read-only `model_router_config` tool returns the `provider` line, the `scope` line, the two model lines, and `<provider> key: set` or `<provider> key: unset` for each provider the `provider` value allows. It never returns a key, its length or any part of it.

```text
provider: auto (typesafe, then openrouter)
scope: core
small_model: unset
large_model: unset
typesafe key: set
openrouter key: unset
```

Given a setting name, the tool returns the command to type. It writes nothing.

## Routing

| Level | Judgment the task needs | Model the plugin sets |
| --- | --- | --- |
| 0 | Lookup or transcription | `small_model` |
| 1 | Bounded judgment | none, no change |
| 2 | Open judgment | `large_model` |

The plugin stays at level 1 unless an end is clearly more likely. [model-choice.md](../model-router/docs/model-choice.md#the-default-level) explains the factors.

The work question picks the effort. The plugin sets `thinking` to one of these values and to no other:

| Work index | Level 0, small model | Level 1 or 2, large or unchanged model |
| --- | --- | --- |
| 0, a short task | `medium` | `low` |
| 1, an ordinary task | `high` | `medium` |
| 2, a long or delicate task | `xhigh` | `high` |

The plugin never sets `max`, `ultra`, `adaptive`, `minimal` or `off`. The small model's row starts at `medium`, because a small model stops early on agentic prompts at `low`. [model-choice.md](../model-router/docs/model-choice.md#the-work-question-and-the-arch) gives the reasons.

The routed effort replaces a level you chose in the calling session. The plugin sets `thinking` on the spawn, and OpenClaw would otherwise pass your session's level to the child.

### Efforts the plugin keeps

The first rule that matches decides. The later rules are not checked.

1. The spawn sets `thinking`. The plugin routes the model and keeps your effort. The line shows `caller effort`.
2. `agents.defaults.subagents.thinking` is set. It is your global effort for subagents. The plugin routes the model and sets no `thinking`. The line shows `config effort`.
3. Under `core`, the requesting agent sets `subagents.thinking`. The plugin keeps it, and the line shows `config effort`.
4. Under `extended`, the requesting agent or the target agent sets `subagents.thinking`. The ladder effort replaces it.
5. Otherwise the plugin sets the ladder effort.

Under `extended` with both a global value and a per-agent value, rule 2 decides. The plugin sets no `thinking`, and OpenClaw's own precedence applies the per-agent value.

At level 1 with a kept effort, there is nothing to set. The plugin returns nothing and still logs the line.

## Which spawns are routed

These spawns pass through unchanged, and the plugin logs nothing:

- The spawn sets a `model` that is not empty and not `default`.
- The spawn sets a `runtime` other than `subagent`, such as `acp`.
- The spawn sets `visible: true`, `context: "fork"`, `mode: "session"` or `thread: true`.
- The spawn has no `task` text.

For every other spawn, the gates run in this order. The first that fails skips the spawn with its reason, and OpenClaw runs the spawn as it would without the plugin. A tag says which spawns the gate can stop: "(every spawn)" includes [the spawn of the requesting agent itself](#the-spawn-of-the-requesting-agent-itself), and "(another agent)" does not.

1. (every spawn) `key unset`: no provider the `provider` setting allows has a key.
2. (another agent) `<id> is outside the core scope`: under `core`, the spawn names another agent.
3. (every spawn) `subagent model set`: `agents.defaults.subagents.model`, or the target agent's `subagents.model`, is set. OpenClaw's own choice decides.
4. (another agent) `<id> agent discovery failed`: under `extended`, the plugin cannot read OpenClaw's config.
5. (another agent) `<id> agent unknown`: under `extended`, the agent is in neither `agents.entries` nor, when `entries` is absent, the older `agents.list` roster.
6. (another agent) `<id> sets its own model`: under `extended`, the agent's entry sets a `model`.
7. (every spawn) `no small or large model`: neither slot is set.
8. (every spawn) `settings unreadable`: the plugin cannot read OpenClaw's live config.

The plugin finds an agent in either roster by its normalised id, as OpenClaw does. The first roster present is the only one it reads.

After the gates, a scored spawn can still skip:

- `small model unset` or `large model unset`: the level picked a slot you left empty.
- `small model unresolved` or `large model unresolved`: OpenClaw cannot resolve the slot's string for the target agent, or holds no credential for its provider. The check makes no network request. The plugin then sets neither model nor effort.
- `timeout`, `HTTP <status>`, `network error`, `rejected request`, `bad reply` or `failed`: Jev did not answer in time or at all. `timeout` means Jev's own timeout only. [Limits](#limits) says what the routing limit does. After two providers, the reason names each, for example `typesafe HTTP 503, openrouter timeout`.

The role Jev reads with the task is the requesting agent's `description`, from its roster entry, when it is set. Otherwise it is one fixed text. Under `extended`, another agent sends its own description. [PRIVACY.md](PRIVACY.md#what-the-plugin-sends) lists the request, and [model-choice.md](../model-router/docs/model-choice.md#the-role-of-the-default-agent) says why this plugin differs from the others.

## The log line

OpenClaw shows no line in the chat. The plugin writes one line per routed or skipped spawn to the Gateway log. Read it with `openclaw logs --follow --plain`. The line starts with `model-router`.

```text
model-router L0 acme/small · medium · p=0.91/0.84 · jev jev-1.14.0 · 812/9 tok
model-router L1 no change · caller effort · p=0.62/0.70
model-router skipped, key unset
```

A routed line reads `L<level> <model or no change> · <effort or kept label> · p=<tier>/<work>`. The model is the slot string as you wrote it. The two probabilities belong to the chosen levels of the two questions. When the reply carries them, the line also names the Jev model and the token counts. After a fallback, it ends with the provider that answered and why the first one failed, for example ` · via openrouter (typesafe HTTP 503)`.

A skipped line reads `skipped, <reason>`. The plugin logs one warning when a hook timeout makes it inert, as [Limits](#limits) says.

## Limits

- **Paths the hook never sees.** The plugin hooks the `sessions_spawn` tool. A spawn that does not call that tool is never routed: `/acp spawn`, the gateway method `sessions.create`, the Control UI's new session, `api.runtime.subagent.run` from another plugin, and Codex's own `spawn_agent`.
- **Runtime-owned auth.** A model whose provider authenticates through the runtime, such as the Claude CLI backend, reads as unresolved. The spawn gets `small model unresolved` or `large model unresolved`.
- **Sandboxed children.** OpenClaw does not sandbox a CLI backend. A child that must run sandboxed fails with a CLI-backend model. The slots take API-key models.
- **Structured results.** A spawn that sets `outputSchema` runs a collector child, which needs tools. Assign tool-capable models to both slots.
- **Thinking.** The ladder sets `thinking` on the child. A model that keeps thinking off by default thinks when routing sets it.
- **An effort the model lacks.** OpenClaw rejects a spawn's `thinking` only when it names no known level. It clamps a known level the model does not support, such as `xhigh`, to a supported one at run time and shows a notice. [OpenClaw hook and spawn](../../docs/clients.md#openclaw-hook-and-spawn) has the source.
- **A replaced level.** The routed effort replaces a level you chose in the calling session, as [Efforts the plugin keeps](#efforts-the-plugin-keeps) says.
- **OpenClaw can still say no.** The plugin checks a model before it sets one. OpenClaw can still reject the rewritten spawn, and the child can still fail on the model. A model set on a spawn loses OpenClaw's configured fallbacks.
- **Later hooks.** Handlers run by descending priority, and the plugin uses priority 100. A later plugin that returns `params` replaces the plugin's result whole.
- **Hook timeout.** The plugin registers its hook with a 10 s timeout, and an operator can override it with `plugins.entries.model-router-openclaw.hooks.timeouts.before_tool_call` or `hooks.timeoutMs`. The routing limit is 8 s, or the timeout minus 2 s when that is smaller. A timeout below 3000 ms leaves less than 1 s, so the plugin routes nothing and logs one warning at start-up. When the routing limit expires, the plugin logs nothing, sets nothing and lets the spawn run unchanged.
- **Parallel spawns.** Each routed spawn makes its own Jev request. Many parallel spawns make as many requests, and a provider's rate limit leaves the rest unrouted.

## What the plugin reads and writes

It reads its own settings, the live OpenClaw config for the subagent model and effort rules above, and the agent descriptions it needs. It asks OpenClaw whether a slot resolves and has a credential. It writes `provider` or `scope` when the owner types a command. It writes nothing else and starts no program.

## What leaves the machine

[PRIVACY.md](PRIVACY.md) is the one copy of this passage. It lists the request, the headers, the providers and the retries.

## Turn it off

Run `openclaw plugins disable model-router-openclaw`. Removing the key of every provider the `provider` setting allows also stops routing. Every spawn then reports `key unset`.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
