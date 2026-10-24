# model-router

[![Release](https://img.shields.io/github/v/release/Akurganow/model-router)](https://github.com/Akurganow/model-router/releases)
[![CI](https://github.com/Akurganow/model-router/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Akurganow/model-router/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Akurganow/model-router)](LICENSE)

Picks a model for each subagent, judged by Jev on TypeSafe or OpenRouter. For Claude Code and Oh My Pi.

| | Claude Code | Oh My Pi |
| --- | --- | --- |
| Routes | Under `core`, Agent tool calls to the four built-in agents. Under `extended`, every Agent call that passes no model and no name, except a fork ([details](plugins/model-router/README.md#which-calls-are-routed)) | Under `core`, `task` batch items. Under `extended`, every batch item whose agent's model you did not set, except `seance` and the [item reasons](plugins/model-router-omp/README.md#item-reasons) |
| Sets | `model` and `effort` | the `smol` or `slow` role |
| Asks Jev | two questions | one question |
| Needs | Claude Code v2.1.308 or later | Oh My Pi v18.12.6 or later |
| Keys live in | the system's secure storage, or `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY` | omp's TypeSafe and OpenRouter credentials, or `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY` |
| Provider is set in | the install dialog, `/config`, `/model-router:provider` or the `config` tool | `/settings` → Plugins, `/model-router:provider` or the `model_router_config` tool |
| Scope | `core` (default) or `extended`. Set in the install dialog, `/config` or `/model-router:scope` | `core` (default) or `extended`. Set in `/settings` → Plugins or `/model-router:scope`. A project may set it |
| Reference | [plugin README](plugins/model-router/README.md) | [plugin README](plugins/model-router-omp/README.md) |

[Install](#install) · [Verify](#verify) · [Update](#update) · [Turn off and uninstall](#turn-off-and-uninstall) · [What leaves the machine](#what-leaves-the-machine)

## How it works

**Claude Code.** On each Agent tool call it routes, the plugin asks
[Jev](https://docs.typesafe.ai) two questions: how much judgment and how much
work the task needs. Jev reads the task and the agent's description. Then the
plugin sets the call's `model` and `effort`. The model is `haiku` for lookup or
transcription, `sonnet` for bounded judgment and `opus` for open judgment.
[Effort](plugins/model-router/README.md#effort) shows the effort ladder.
[model-choice.md](plugins/model-router/docs/model-choice.md) says why the
tiers and the ladder are what they are, with Anthropic's sources.

The `scope` option picks the calls. [Which calls are routed](plugins/model-router/README.md#which-calls-are-routed)
holds the rules.

**Oh My Pi.** The plugin scores each batch item with Jev, which answers one
question: how much judgment the task needs. Jev reads the task and the agent's
description. For lookup work the plugin gives the spawn the `smol` role. For
open judgment it gives the `slow` role. For bounded judgment it changes
nothing. It sets no effort and never changes the tool input. The roles run on
the models you point `smol` and `slow` at.

The `scope` setting picks the agents. [Scope](plugins/model-router-omp/README.md#scope)
holds the rules.

## Install

You need:

- Claude Code v2.1.308 or later, or Oh My Pi v18.12.6 or later.
- A TypeSafe API key from https://console.typesafe.ai/keys, an OpenRouter API
  key from https://openrouter.ai/settings/keys, or both.
- For Claude Code, the `claude` command-line tool. Every `claude plugin` line
  on this page runs in a shell, whichever app you use.

The `provider` option picks who scores each task: `typesafe` (the default),
`openrouter`, `auto` (TypeSafe, then OpenRouter) or `openrouter-first`
(OpenRouter, then TypeSafe). With one key, `auto` and `openrouter-first` use
that key's provider alone. The [Claude Code](plugins/model-router/README.md)
and [Oh My Pi](plugins/model-router-omp/README.md) READMEs say when the second
provider takes over. The `scope` option picks the agents the plugin routes:
`core` (the default) or `extended`.

### Claude Code

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

### Oh My Pi

1. Install [Oh My Pi](https://github.com/can1357/oh-my-pi) v18.12.6 or later.
2. Add the marketplace:

   ```sh
   omp plugin marketplace add Akurganow/model-router
   ```

3. Install the plugin:

   ```sh
   omp plugin install model-router@model-router
   ```

4. Restart omp, because omp loads extension modules at startup.
5. Run `/login typesafe`, `/login openrouter` or both in omp to store your
   keys.
6. Ask omp to run the `model-router-setup` skill. It asks the provider, the
   keys and the scope with buttons and writes your choices itself.

Instead of `/login`, you can run `omp login typesafe` or
`omp login openrouter` outside a session. You can also set `TYPESAFE_API_KEY`
or `OPENROUTER_API_KEY`. To change the provider or the scope later, open
`/settings` → Plugins, or run `/model-router:provider` or
`/model-router:scope`.
[Set up](plugins/model-router-omp/README.md#set-up) says what the skill checks.

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
model-router task 1: L0 @smol · p=0.91 | task 2: L1 no change · p=0.62 | task 3: skipped, timeout
```

[Gate reasons](plugins/model-router-omp/README.md#gate-reasons) and
[Item reasons](plugins/model-router-omp/README.md#item-reasons) explain each
`skipped` entry. No line prints when `task.batch` is off or the batch has no
eligible item.

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

## What leaves the machine

> [!IMPORTANT]
> Each call or batch item the plugin scores sends the condensed, redacted task
> text to the host that `provider` picks, with that host's key:
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
> Each request also carries the agent's description. Under `extended`, the
> descriptions and task text of your other agents leave the machine too.

Each plugin README lists the full request, and each privacy policy states the
same in policy form:

- Claude Code:
  [What leaves the machine](plugins/model-router/README.md#what-leaves-the-machine),
  [PRIVACY.md](plugins/model-router/PRIVACY.md)
- Oh My Pi:
  [What leaves the machine](plugins/model-router-omp/README.md#what-leaves-the-machine),
  [PRIVACY.md](plugins/model-router-omp/PRIVACY.md),
  [The extended scope](plugins/model-router-omp/PRIVACY.md#the-extended-scope)

[Turn off and uninstall](#turn-off-and-uninstall) says how to stop the
requests.

## Documentation

- [Claude Code plugin README](plugins/model-router/README.md): what the plugin
  can reach, routing, the effort ladder and troubleshooting.
- [Oh My Pi plugin README](plugins/model-router-omp/README.md): the key, the
  setup skill, routing and the skip reasons.
- [model-choice.md](plugins/model-router/docs/model-choice.md): why the model
  tiers and the effort ladder are what they are.
- [Claude Code privacy policy](plugins/model-router/PRIVACY.md)
- [Oh My Pi privacy policy](plugins/model-router-omp/PRIVACY.md)

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers the repository layout, the build,
the checks, the commit rules and calibration against either provider, with
`node scripts/calibrate.ts <typesafe|openrouter> [model]`.

## Support

Questions and bug reports go to
https://github.com/Akurganow/model-router/issues.

## License

MIT, as [LICENSE](LICENSE) states.
