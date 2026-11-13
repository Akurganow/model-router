# model-router

[![Release](https://img.shields.io/github/v/release/Akurganow/model-router)](https://github.com/Akurganow/model-router/releases)
[![CI](https://github.com/Akurganow/model-router/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Akurganow/model-router/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Akurganow/model-router)](LICENSE)

![Gamayun, the prophetic bird of Slavic folklore](docs/banner.jpg)

Picks a model for each subagent, judged by Jev on TypeSafe or OpenRouter. For the harnesses in the table.

| Harness | The plugin sets | Questions to Jev | Starts a program | Minimum version | Reference |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `model` and `effort` | 2 | no | v2.1.308 | [plugin README](plugins/model-router/README.md) |
| Oh My Pi | the `smol`, `middle` or `slow` role and the thinking level | 2 | no | v18.12.6 | [plugin README](plugins/model-router-omp/README.md) |
| OpenClaw | `model` and `thinking` | 2 | no | 2026.10.10 | [plugin README](plugins/model-router-openclaw/README.md) |
| Hermes Agent | `model`, `provider` and `reasoning_effort` | 2 | yes, Node once per task | 0.22.6 | [plugin README](plugins/model-router-hermes/README.md) |

Claude Code, Oh My Pi and OpenClaw each have a `scope` setting. It takes `core` (the default) or `extended` and picks the agents the plugin routes. The plugin README says how. Hermes Agent has no `scope` setting: the plugin routes every `delegate_task` task and never the main turn.

[Install](#install) · [Verify](#verify) · [Update](#update) · [Turn off and uninstall](#turn-off-and-uninstall) · [What leaves the machine](#what-leaves-the-machine)

## How it works

**Claude Code.** On each Agent tool call it routes, the plugin asks
[Jev](https://docs.typesafe.ai) two questions: how much judgment and how much
work the task needs. Jev reads the task and the agent text (the request's
`role` field). Then the plugin sets the call's `model` and `effort`. The model
is `haiku` for lookup or transcription, `sonnet` for bounded judgment and `opus`
for open judgment.
[Effort](plugins/model-router/README.md#effort) shows the effort ladder.
[model-choice.md](plugins/model-router/docs/model-choice.md) says why the
tiers and the ladder are what they are, with Anthropic's sources.

The `scope` option picks the calls. [Which calls are routed](plugins/model-router/README.md#which-calls-are-routed)
holds the rules.

**Oh My Pi.** The plugin scores each batch item with Jev, which answers two
questions: how much judgment the task needs and how much work it takes. Jev
reads the task and the agent text. For lookup work the plugin gives the spawn
the `smol` role. For bounded judgment it gives the `middle` role, and for open
judgment the `slow` role. Each spawn also gets a thinking level from a fixed
ladder. The plugin never changes the tool input. The roles run on the models
you point `smol`, `middle` and `slow` at.
[Effort](plugins/model-router-omp/README.md#effort) has the ladder and the
efforts the plugin keeps.

The `scope` setting picks the agents. [Scope](plugins/model-router-omp/README.md#scope)
holds the rules.

**OpenClaw.** The plugin scores each routed `sessions_spawn` call with Jev, then
sets `model` from your `small_model`, `middle_model` or `large_model` and
`thinking` from a fixed ladder. [Routing](plugins/model-router-openclaw/README.md#routing) has the
levels, and [Which spawns are routed](plugins/model-router-openclaw/README.md#which-spawns-are-routed)
has the rules.

**Hermes Agent.** The plugin is a delegation backend. It scores each `delegate_task`
task with Jev, then gives the task's child your `small_model`, `middle_model`
or `large_model` and a `reasoning_effort` from a fixed ladder. Hermes has no
`scope`, so the plugin routes every task of the tool and never the main turn. A Python shim
starts Hermes's own Node once per task to run the scoring step.
[Routing](plugins/model-router-hermes/README.md#routing) has the levels, and
[Which tasks are routed](plugins/model-router-hermes/README.md#which-tasks-are-routed)
has the rules.

In Oh My Pi, OpenClaw and Hermes Agent, a level whose model you did not set
keeps the model the harness gives it, and the plugin still sets the effort.
[A slot with no model](docs/providers.md#a-slot-with-no-model) has the rule.

The npm package `@akurganow/model-router` carries the OpenClaw plugin. Oh My Pi
can install the same package as a second route, as [its README](plugins/model-router-omp/README.md)
says.

## Install

You need:

- A harness at or above the minimum version in the table.
- A TypeSafe API key from https://console.typesafe.ai/keys, an OpenRouter API
  key from https://openrouter.ai/settings/keys, or both.
- For Claude Code, the `claude` command-line tool. Every `claude plugin` line
  on this page runs in a shell, whichever app you use.

The `provider` option picks who scores each task: `typesafe` (the default),
`openrouter`, `auto` (TypeSafe, then OpenRouter) or `openrouter-first`
(OpenRouter, then TypeSafe).
[Which provider gets a task](docs/providers.md#which-provider-gets-a-task) says
what one key does and when the second provider takes over.

<!-- install:start -->

### Claude Code

```sh
claude plugin marketplace add Akurganow/model-router
claude plugin install model-router@model-router
```

Source: Claude Code documentation, [Install and manage plugins](https://code.claude.com/docs/en/plugins/install#add-a-marketplace).

CI installs it on Ubuntu.

[Set up Claude Code](#set-up-claude-code) has the next steps.

### Oh My Pi

```sh
omp plugin marketplace add Akurganow/model-router
omp plugin install model-router@model-router
```

Source: Oh My Pi documentation, [marketplace.md, lines 20 to 25](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L20-L25).

CI installs it on Ubuntu.

[Set up Oh My Pi](#set-up-oh-my-pi) has the next steps.

### OpenClaw

```sh
openclaw plugins install npm:@akurganow/model-router --force --accept-capabilities
openclaw plugins enable model-router-openclaw
openclaw plugins inspect model-router-openclaw --runtime --json
```

Source: OpenClaw documentation, [Manage plugins](https://docs.openclaw.ai/plugins/manage-plugins).

The npm package `@akurganow/model-router` exists only after its first publication. Review the source of the package before you run these commands: they carry `--force` and `--accept-capabilities`.

CI installs the packed npm package on Ubuntu and checks that OpenClaw loads it.

[Set up OpenClaw](#set-up-openclaw) has the next steps.

### Hermes Agent

```sh
hermes plugins install Akurganow/model-router/plugins/model-router-hermes --enable
hermes config set delegation.backend model-router
```

Source: Hermes Agent documentation, [Plugins](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins).

CI installs it on Ubuntu.

[Set up Hermes Agent](#set-up-hermes-agent) has the next steps.

<!-- install:end -->

The Hermes command `hermes config set delegation.backend model-router` replaces `model_map` or any other delegation backend, because Hermes runs one backend at a time.

[docs/clients.md](docs/clients.md) lists what each client reads, each fact with its source.

### Set up Claude Code

Pick one route: the two `claude` lines under [Claude Code](#claude-code) are
the minimal one, and each route below also sets the options and the keys.
Those two lines install the plugin without its keys.
After them, run `/plugin configure model-router@model-router` in a session to
set the keys.

#### Terminal

1. Run this line in a Claude Code session:

   ```text
   /plugin install model-router --marketplace Akurganow/model-router
   ```

2. Answer `y` to add the marketplace.
3. Pick the user scope.
4. Pick a `provider` and a `scope` in the dialog.
5. Paste your TypeSafe key, your OpenRouter key or both into the dialog.
6. Run `/reload-plugins`, or start a new session.
7. Ask Claude to run the `model-router-setup` skill. It asks the provider and
   the scope with buttons, writes your choices itself and checks the keys.

To reopen the dialog later, run
`/plugin configure model-router@model-router`. `/config` also changes the
options. `/model-router:provider` and `/model-router:scope` change one each.
Claude Code keeps the keys in the system's secure storage.

**Install from a shell.** This line installs the plugin, sets `provider` to
`auto` and saves the keys. It shows `TypeSafe key:`, then `OpenRouter key:`.
It reads each key you paste without showing it. Press Enter at a prompt to
skip a key you do not have. Only the line goes to the shell history, never a
key. The line is for zsh, the default shell on macOS.

```sh
claude plugin install model-router --marketplace Akurganow/model-router && read -rs 'TS_KEY?TypeSafe key: ' && echo && read -rs 'OR_KEY?OpenRouter key: ' && echo && printf '{"provider":"auto","api_key":"%s","openrouter_api_key":"%s"}' "$TS_KEY" "$OR_KEY" | claude plugin configure model-router@model-router --values-stdin
```

To pick another provider, replace `auto` in the line. In bash, replace
`read -rs 'TS_KEY?TypeSafe key: '` with `read -rsp 'TypeSafe key: ' TS_KEY`.
Replace `read -rs 'OR_KEY?OpenRouter key: '` with
`read -rsp 'OpenRouter key: ' OR_KEY`. Look for these two lines in the output:

```text
Successfully installed plugin
Configuration saved. Restart Claude Code to apply it.
```

Then run `/reload-plugins` in each open session, or start a new one. The
plugin reads the key when it loads.

<details>
<summary>Other shells, PowerShell included</summary>

Run this line in place of the one above:

```sh
claude plugin install model-router --marketplace Akurganow/model-router --config provider=auto --config api_key=YOUR_KEY --config openrouter_api_key=YOUR_OPENROUTER_KEY
```

`YOUR_KEY` stands for your TypeSafe key and `YOUR_OPENROUTER_KEY` for your
OpenRouter key. Drop the `--config` pair of a key you do not have. The line
leaves the keys in your shell history and shows them in the process list
while it runs.

</details>

#### VS Code

1. Run `/plugins` to open **Manage plugins**.
2. Add `Akurganow/model-router` on the **Marketplaces** tab.
3. Install `model-router` on the **Plugins** tab.
4. Pick a `provider` and a `scope` in the form that opens.
5. Enter your TypeSafe key, your OpenRouter key or both.
6. Start a new session.

The gear icon on the plugin's row opens the form again. If the form does not
open, set the key as [Desktop app](#desktop-app) describes.

#### Desktop app

1. Open a local session.
2. Choose **+**, then **Add plugins**.
3. Add the marketplace `Akurganow/model-router`.
4. Install `model-router`.

> [!WARNING]
> The desktop app cannot set a plugin's key yet.
> [Keys in the desktop app](plugins/model-router/README.md#keys-in-the-desktop-app)
> says how to set it in the settings file.

### Set up Oh My Pi

1. Install [Oh My Pi](https://github.com/can1357/oh-my-pi) v18.12.6 or later.
2. Run the two install commands under [Oh My Pi](#oh-my-pi).
3. Restart omp, because omp loads extension modules at startup.
4. Run `/login typesafe`, `/login openrouter` or both in omp to store your
   keys.
5. Ask omp to run the `model-router-setup` skill. It asks the provider, the
   keys and the scope with buttons and writes your choices itself. It also
   shows where you set the `smol`, `middle` and `slow` roles.

Instead of `/login`, you can run `omp login typesafe` or
`omp login openrouter` outside a session. You can also set `TYPESAFE_API_KEY`
or `OPENROUTER_API_KEY`. To change the provider or the scope later, open
`/settings` → Plugins, or run `/model-router:provider` or
`/model-router:scope`.
[Set up](plugins/model-router-omp/README.md#set-up) says what the skill checks.

### Set up OpenClaw

After the commands: check the install under [Install](plugins/model-router-openclaw/README.md#install) in the OpenClaw plugin README, then follow [Set up](plugins/model-router-openclaw/README.md#set-up).

### Set up Hermes Agent

After the two commands: check the install under [Install](plugins/model-router-hermes/README.md#install) in the Hermes plugin README, then follow [Set up](plugins/model-router-hermes/README.md#set-up).

## Verify

**Claude Code.** Send this prompt in a new session:

```text
Use the Agent tool with the general-purpose agent, and no model or name, to list the files in this folder.
```

The plugin then logs one line for the routed call, like this example:

```text
model-router L0 haiku · medium · p=0.91/0.62 · jev jev-1.14.0 · 812/9 tok
```

This README has not checked where VS Code or the desktop app shows the line.
If the line says `skipped, <cause>`, or no line appears, see
[Troubleshooting](plugins/model-router/README.md#troubleshooting).

**Oh My Pi.** Give omp any job that makes it spawn a `task` subagent. The
plugin prints one line per batch, like this example:

```text
model-router task 1: L0 @smol · high · p=0.91/0.84 | task 2: L1 middle model unset · medium · p=0.62/0.70 | task 3: skipped, timeout
```

An entry such as `L1 middle model unset` is no error: the level ran on the
agent's model, as [Models](plugins/model-router-omp/README.md#models) says.
[Gate reasons](plugins/model-router-omp/README.md#gate-reasons) and
[Item reasons](plugins/model-router-omp/README.md#item-reasons) explain each
`skipped` entry. No line prints when `task.batch` is off or the batch has no
eligible item.

**OpenClaw.** OpenClaw shows no line in the chat. Start a subagent, and read the Gateway log with `openclaw logs --follow --plain`. The plugin writes one line per spawn. [The log line](plugins/model-router-openclaw/README.md#the-log-line) shows an example and explains it. [Which spawns are routed](plugins/model-router-openclaw/README.md#which-spawns-are-routed) lists the `skipped` reasons. If no line appears, [No line at all?](plugins/model-router-openclaw/README.md#no-line-at-all) lists the causes.

**Hermes Agent.** Ask Hermes to delegate one small task, such as listing the files in the current folder. The plugin puts its line in the task's `route.label`, and Hermes shows the label with the child's progress and result. [The label and the log](plugins/model-router-hermes/README.md#the-label-and-the-log) shows an example, explains the line and says where else it goes. [Which tasks are routed](plugins/model-router-hermes/README.md#which-tasks-are-routed) lists the `skipped` reasons.

## Update

**Claude Code.** Claude Code turns auto-update off by default for a
third-party marketplace like this one. To turn it on, choose
**Enable auto-update** for the marketplace on the **Marketplaces** tab of
`/plugin`. To update by hand, run these lines in a shell:

```sh
claude plugin marketplace update model-router
claude plugin update model-router@model-router
```

Then run `/reload-plugins` in each open session, or start a new one.

**Oh My Pi.** Run these lines in a shell:

```sh
omp plugin marketplace update
omp plugin upgrade model-router@model-router
```

Then restart omp.

**OpenClaw.** Run these lines in a shell, then restart the Gateway:

```sh
openclaw plugins update model-router-openclaw
openclaw gateway restart
```

**Hermes Agent.** Run these lines in a shell:

```sh
hermes plugins update model-router-hermes
hermes gateway stop
```

A gateway keeps a loaded plugin, so Hermes loads the new code on its next start. [Install](plugins/model-router-hermes/README.md#install) says how to pin a commit.

## Turn off and uninstall

**Claude Code.** To turn routing off, disable the plugin in `/plugin`. The
plugin sends nothing while it is disabled. To remove it, run this line in a
shell:

```sh
claude plugin uninstall model-router@model-router
```

If you added `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY` to the `env` block of
`~/.claude/settings.json`, delete those lines too.

**Oh My Pi.** To turn routing off, run this line in a shell:

```sh
omp plugin disable model-router@model-router
```

Then restart omp. The plugin sends nothing while it is disabled. To remove it,
run this line:

```sh
omp plugin uninstall model-router@model-router
```

**OpenClaw.** To turn routing off, run this line in a shell:

```sh
openclaw plugins disable model-router-openclaw
```

The plugin sends nothing while it is disabled. Removing the key of every
provider the `provider` setting allows also stops routing, and every spawn then
reports `key unset`.

**Hermes Agent.** To turn routing off, set the delegation backend back to
`default`. Run this line in a shell:

```sh
hermes config set delegation.backend default
```

In a running session, type `/delegation default --now`. The plugin sends
nothing while the backend is `default`. To disable or remove the plugin, run
one of these lines after that:

```sh
hermes plugins disable model-router-hermes
hermes plugins remove model-router-hermes
```

Never disable or remove the plugin while `delegation.backend` is still
`model-router`. Hermes then fails delegation closed, and every `delegate_task`
call returns an error. Removing the key of every provider the `provider`
setting allows also stops routing, and every task then reports `key unset`.

## What leaves the machine

> [!IMPORTANT]
> Each call, batch item or task the plugin scores sends the condensed, redacted
> task text to the host that `provider` picks, with that host's key:
>
> - `https://api.typesafe.ai/v1/systemone` gets your TypeSafe key under
>   `typesafe`, and first under `auto`.
> - `https://openrouter.ai/api/v1/systemone` gets your OpenRouter key under
>   `openrouter`, and first under `openrouter-first`.
>
> With both keys, `auto` and `openrouter-first` send the same text to the
> second host when the first fails. The default, `typesafe`, never contacts
> OpenRouter.
>
> Each request also carries the agent text. The built-in `general-purpose` and
> `claude` agents, omp's bundled `task` agent, and every Hermes Agent task send
> a fixed text. In
> OpenClaw, [the spawn of the requesting agent itself](plugins/model-router-openclaw/README.md#the-spawn-of-the-requesting-agent-itself)
> sends that agent's description when it has one, and a fixed text otherwise.
> Every other agent sends its description, masked and cut to 500 characters.
> [model-choice.md](plugins/model-router/docs/model-choice.md#the-role-of-the-default-agent)
> says why. Under `extended`, the descriptions and task text of your other
> agents leave the machine too.

The Claude Code and Oh My Pi READMEs list the full request, and each privacy
policy states the same in policy form. For OpenClaw and Hermes Agent, the
privacy policy holds the request:

- Claude Code:
  [What leaves the machine](plugins/model-router/README.md#what-leaves-the-machine),
  [PRIVACY.md](plugins/model-router/PRIVACY.md)
- Oh My Pi:
  [What leaves the machine](plugins/model-router-omp/README.md#what-leaves-the-machine),
  [PRIVACY.md](plugins/model-router-omp/PRIVACY.md),
  [The extended scope](plugins/model-router-omp/PRIVACY.md#the-extended-scope)
- OpenClaw:
  [What the plugin sends](plugins/model-router-openclaw/PRIVACY.md#what-the-plugin-sends),
  [PRIVACY.md](plugins/model-router-openclaw/PRIVACY.md),
  [The extended scope](plugins/model-router-openclaw/PRIVACY.md#the-extended-scope)
- Hermes Agent:
  [What the plugin sends](plugins/model-router-hermes/PRIVACY.md#what-the-plugin-sends),
  [The program the plugin starts](plugins/model-router-hermes/PRIVACY.md#the-program-the-plugin-starts),
  [PRIVACY.md](plugins/model-router-hermes/PRIVACY.md)
- All four: [How the plugins use the providers](docs/providers.md) holds the
  rules they share: the fallback, the request, the retries and what the
  providers do with it.

[Turn off and uninstall](#turn-off-and-uninstall) says how to stop the
requests.

## Documentation

- [Claude Code plugin README](plugins/model-router/README.md): what the plugin
  can reach, routing, the effort ladder and troubleshooting.
- [Oh My Pi plugin README](plugins/model-router-omp/README.md): the key, the
  setup skill, routing and the skip reasons.
- [OpenClaw plugin README](plugins/model-router-openclaw/README.md): the
  install, the model slots, the keys, routing and the skip reasons.
- [Hermes Agent plugin README](plugins/model-router-hermes/README.md): the
  install, the model slots, the keys, routing, the Node step and the skip
  reasons.
- [model-choice.md](plugins/model-router/docs/model-choice.md): why the model
  tiers and the effort ladder are what they are.
- [How the plugins use the providers](docs/providers.md): the fallback rules,
  the request, the retries and what the providers do with it.
- [Claude Code privacy policy](plugins/model-router/PRIVACY.md)
- [Oh My Pi privacy policy](plugins/model-router-omp/PRIVACY.md)
- [OpenClaw privacy policy](plugins/model-router-openclaw/PRIVACY.md)
- [Hermes Agent privacy policy](plugins/model-router-hermes/PRIVACY.md)

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers the repository layout, the build,
the checks, the commit rules and calibration against either provider, with
`node scripts/calibrate.ts <typesafe|openrouter> [model]`, and the offline rule
comparison with `node scripts/compare-rules.ts`.

## Support

Questions and bug reports go to
https://github.com/Akurganow/model-router/issues.

## License

MIT, as [LICENSE](LICENSE) states.
