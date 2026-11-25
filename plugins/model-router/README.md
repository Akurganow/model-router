# model-router for Claude Code

A [Claude Code](https://code.claude.com/docs) plugin that picks a model and an
effort for the subagents it routes. It asks a decision model, on the provider's
own API or through OpenRouter, how much judgment the task needs and how much
work it takes. It then sets the subagent's `model` and `effort`.

This plugin is a mod: a plugin whose `hooks/hooks.json` has a
[`modules` key](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hooks-module).

## What it does

- It scores each Agent call it routes through the decision model of the
  `provider` option: [Jev](https://docs.typesafe.ai) from TypeSafe, OpenAI's or
  Google's. The model reads the task and the agent text, the request's `role`
  field. One request asks two questions: how much judgment the task needs, and
  how much work it takes.
- It sets the model of the level, as [Models](#models) lists, and an effort from
  a fixed ladder, as [Effort](#effort) says. One dim line per routed call shows
  the pick.
- The [`scope` option](#scope) picks the calls it routes. A call that names an
  effort gets a model and keeps its effort.
- It fails open: a failure leaves the call unchanged, as
  [the skip causes](#troubleshooting) list them.
- The mod changes an option only when you pick a value in its dialog, type a
  command, or ask Claude to write `models`. [Change the options](#change-the-options)
  lists the three.

### What this mod can reach

[Anthropic's guide to trusting a mod](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod)
asks six questions. The answers for this mod:

- **Acts on your machine as you?** No. It reads no files, writes no files of
  its own and starts no program.
- **Reads your secrets?** Only its own keys: TypeSafe, OpenAI, Google and
  OpenRouter. Claude Code hands it the plugin's sensitive `api_key`,
  `openai_api_key`, `google_api_key` and `openrouter_api_key` options from
  secure storage. When an option is empty, the mod reads the key from
  `TYPESAFE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` or
  `OPENROUTER_API_KEY`. It reads a key only for a holder the `provider` and
  `gateway` options allow. It reads one more environment
  variable, `CLAUDE_CODE_EFFORT_LEVEL`, and only to see whether it is set. It
  never sends its value anywhere. It reads no file.
- **Sees your session?** The arguments of each Agent tool call. It sends the
  task, the description and the role of the agent. It reads `model`,
  `name` and `effort` to decide whether to route and whether to keep the
  caller's effort. It also sees which plugin started each spawn, to leave
  other plugins' spawns alone. It also sees the name, source and description of each agent
  Claude Code offers, to tell a built-in from a user or plugin agent and to
  describe it. It reads the spawn of each subagent and the requests the
  subagent then makes. Between calls it keeps only the latest source and
  description of each agent name, in memory.
- **Changes your session?** Two settings of the subagent: its `model` and its
  `effort`. The mod sets the `model` when the subagent spawns, and the Agent
  call stays as written. It sets `effort` on the subagent's own requests only
  when the call names none and `CLAUDE_CODE_EFFORT_LEVEL` is unset, or, under
  the [rules of the extended scope](#which-calls-are-routed), replaces the one the agent's
  definition sets. A model without effort gets none. It registers one tool the model can call,
  `mcp__model-router__config`. The tool reads the settings and opens the
  mod's own dialog. It writes the `provider`, `gateway` and `scope` options
  only after you pick a value there. The three commands write the same options, and only from your own prompt. The
  model passes a value for `models` alone, and only at your request. It then
  writes `models` at once.
  [The commands and the tool](#change-the-options) have the details.
- **Acts without asking you?** No. It approves nothing, and it denies only its
  own tool when your permission rules deny that tool. Your permission rules
  and prompts decide every call. Every setting change waits for your choice in
  the mod's dialog, your own command or your request to write `models`.
- **Spends your usage?** No model calls on your plan. Up to four requests per
  routed call go to the provider you chose or to OpenRouter, each on its own key, as
  [What leaves the machine](#what-leaves-the-machine) counts them. An
  OpenRouter key may also pay for your chat models, and the scoring requests
  spend the same credit.

`claude plugin validate plugins/model-router` lists the same from the code.
This is the whole surface:

| Kind | Name | Why the mod has it |
| --- | --- | --- |
| hook | `agent.offer` | Records which agents Claude Code offers, from where and with which description. It passes each offer on unchanged. |
| hook | `command.run{command=model-router:provider}` | Answers the `/model-router:provider` command. |
| hook | `command.run{command=model-router:gateway}` | Answers the `/model-router:gateway` command. |
| hook | `command.run{command=model-router:scope}` | Answers the `/model-router:scope` command. |
| hook | `session.start` | Registers the `mcp__model-router__config` tool, at session start and after each plugin reload. |
| hook | `agent.spawn` | Scores the brief and sets the subagent's `model` before it starts. |
| hook | `tool.call{tool=Agent}` | Passes the Agent call on unchanged and notes whether the caller set an `effort`. |
| hook | `tool.call{tool=mcp__model-router__config}` | Answers the `config` tool: the settings and the dialogs. |
| hook | `turn.step` | Sets the routed `effort` on the subagent's requests. |
| hook | `turn.complete` | Forgets that a finished subagent's first request already waited for the spawns in flight. |
| call | `$.clock.after` | The 10 s limit and the request's timers run on it, for example the retry wait. |
| call | `$.clock.sleep` | Bounds the wait of a subagent's first request for the spawns in flight, 1 s at most. |
| call | `$.config.set` | Writes the `provider`, `gateway` or `scope` option, after you pick a value in the dialog or give a command with a value at your own prompt. Writes the `models` option when the `config` tool gets a `models` text. |
| call | `$.env.get` | Reads `TYPESAFE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` and `OPENROUTER_API_KEY`, and whether `CLAUDE_CODE_EFFORT_LEVEL` is set, the only variables the mod reads. |
| call | `$.http.fetch` | Sends the request to `api.typesafe.ai`, `api.openai.com`, `generativelanguage.googleapis.com` or `openrouter.ai`. |
| call | `$.tool.check` | Asks for the permission verdict of a call to the `config` tool. |
| call | `$.tool.register` | Registers the `config` tool. |
| call | `$.ui.ask` | Opens the mod's dialog for a setting. |
| call | `$.ui.log` | Writes the log line, and the request body to the debug log. |

`tools/surface.json` in the repository lists the same names, and CI compares
them with the validate output.

## Install

The install commands are under
[Claude Code in the root README](https://github.com/Akurganow/model-router/blob/main/README.md#claude-code).

Claude Code must be at or above the minimum version in
[the harness table of the root README](https://github.com/Akurganow/model-router/blob/main/README.md#model-router). The install
commands need the `claude` command-line tool. Every `claude plugin` line on this
page runs in a shell, whichever app you use.

## Set up

Pick one route: the two `claude` lines in
[the Claude Code section of the root README](https://github.com/Akurganow/model-router/blob/main/README.md#claude-code) are
the minimal one, and each route below also sets the options and the keys.
Those two lines install the plugin without its keys.
After them, run `/plugin configure model-router@model-router` in a session to
set the keys.
After the route you pick, check the routing, as [Verify](#verify) says.

### Terminal

1. Run this line in a Claude Code session:

   ```text
   /plugin install model-router --marketplace Akurganow/model-router
   ```

2. Answer `y` to add the marketplace.
3. Pick the user scope.
4. Pick a `provider`, a `gateway` and a `scope` in the dialog.
5. Paste the key of your provider, your OpenRouter key or both into the dialog.
6. Run `/reload-plugins`, or start a new session.
7. Ask Claude to run the `model-router-setup` skill. It asks the provider, the
   gateway and the scope with buttons, writes your choices itself and checks
   the keys.

To reopen the dialog later, run
`/plugin configure model-router@model-router`.
[The other ways to change an option](#change-the-options) are the three
commands and `/config`.

**Install from a shell.** This line installs the plugin, sets `gateway` to
`auto` and saves the keys. It shows `TypeSafe key:`, then `OpenRouter key:`.
It reads each key you paste without showing it. Press Enter at a prompt to
skip a key you do not have. Only the line goes to the shell history, never a
key. The line is for zsh, the default shell on macOS.

```sh
claude plugin install model-router --marketplace Akurganow/model-router && read -rs 'TS_KEY?TypeSafe key: ' && echo && read -rs 'OR_KEY?OpenRouter key: ' && echo && printf '{"gateway":"auto","api_key":"%s","openrouter_api_key":"%s"}' "$TS_KEY" "$OR_KEY" | claude plugin configure model-router@model-router --values-stdin
```

To pick another `gateway` value, replace `auto` in the line. To use OpenAI or
Google, change the line in three places:

- Add `"provider":"openai"` or `"provider":"google"` to the JSON.
- Replace `"api_key"` with `"openai_api_key"` or `"google_api_key"`.
- Replace `TypeSafe` in the first prompt with `OpenAI` or `Google`, so that the
  prompt names the key it reads.

In bash, replace `read -rs 'TS_KEY?TypeSafe key: '` with
`read -rsp 'TypeSafe key: ' TS_KEY`.
Replace `read -rs 'OR_KEY?OpenRouter key: '` with
`read -rsp 'OpenRouter key: ' OR_KEY`. The name you put in place of `TypeSafe`
applies to that prompt too.

Look for these two lines in the output:

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
claude plugin install model-router --marketplace Akurganow/model-router --config gateway=auto --config api_key=YOUR_KEY --config openrouter_api_key=YOUR_OPENROUTER_KEY
```

`YOUR_KEY` stands for your TypeSafe key and `YOUR_OPENROUTER_KEY` for your
OpenRouter key. To use OpenAI or Google, add `--config provider=openai` or
`--config provider=google`, and replace `--config api_key` with
`--config openai_api_key` or `--config google_api_key`. Drop the `--config` pair of a key you do not have. The line
leaves the keys in your shell history and shows them in the process list
while it runs.

</details>

### VS Code

1. Run `/plugins` to open **Manage plugins**.
2. Add `Akurganow/model-router` on the **Marketplaces** tab.
3. Install `model-router` on the **Plugins** tab.
4. Pick a `provider`, a `gateway` and a `scope` in the form that opens.
5. Enter the key of your provider, your OpenRouter key or both.
6. Start a new session.

The gear icon on the plugin's row opens the form again. If the form does not
open, set the key as [Desktop app](#desktop-app) describes.

### Desktop app

1. Open a local session.
2. Choose **+**, then **Add plugins**.
3. Add the marketplace `Akurganow/model-router`.
4. Install `model-router`.

> [!WARNING]
> The desktop app cannot set a plugin's key yet.
> [Keys in the desktop app](#keys-in-the-desktop-app)
> says how to set it in the settings file.

## Verify

Send this prompt in a new session:

```text
Use the Agent tool with the general-purpose agent, and no model or name, to list the files in this folder.
```

The plugin then logs one line for the routed call. [The log line](#the-log-line)
shows an example.

This guide has not checked where VS Code or the desktop app shows the line.
If the line says `skipped, <cause>`, or no line appears, see
[Troubleshooting](#troubleshooting).

## Keys

| Key holder | Option | Variable |
| --- | --- | --- |
| TypeSafe | `api_key` | `TYPESAFE_API_KEY` |
| OpenAI | `openai_api_key` | `OPENAI_API_KEY` |
| Google | `google_api_key` | `GEMINI_API_KEY` |
| OpenRouter | `openrouter_api_key` | `OPENROUTER_API_KEY` |

Each option is sensitive, and the mod reads the variable when the option is
empty. Claude Code keeps the keys in the system's secure storage.
[Where to get a key](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#keys) also says when a key counts as
set and which Google variable the plugins do not read.

### Keys in the desktop app

The desktop app cannot set a plugin's key yet. A key saved from a shell also
reads back empty after the app restarts.
https://github.com/anthropics/claude-code/issues/89749

When the setup skill asks how to add a key, pick "Write it to the settings
files myself" or "Same, open the files for me". Either button names the
variable and the user settings file, and you add the variable to its `env`
block. Until the bug is fixed:

1. Open `~/.claude/settings.json`.
2. Add the variable of each key you use to the `env` block:
   `TYPESAFE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` or
   `OPENROUTER_API_KEY`. This example sets a TypeSafe key and an OpenRouter
   key, with your keys in place of `YOUR_KEY` and `YOUR_OPENROUTER_KEY`:

   ```json
   {
     "env": {
       "TYPESAFE_API_KEY": "YOUR_KEY",
       "OPENROUTER_API_KEY": "YOUR_OPENROUTER_KEY"
     }
   }
   ```

3. Start a new session.
4. If you set `OPENROUTER_API_KEY`, run `/model-router:gateway auto` in the
   session.

The keys sit there in plaintext, and every process Claude Code starts can see
them.

Once the bug is fixed, move the keys, because the mod never copies a variable
into an option:

1. Save each key in the plugin's settings.
2. Delete those lines from the `env` block. While a line stands, its key
   reads as set even when the option is empty.
3. Restart the app, then ask Claude to run the `model-router-setup` skill,
   which checks the keys.
4. Put back the line of each key that reads `unset`.

## Provider and gateway

The `provider` and `gateway` options decide who receives each task.
By default, `provider` is `typesafe` and `gateway` is `direct`.
[The provider and the gateway](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-provider-and-the-gateway) lists the other
values, says which of them cost more and tells where each sends the task.
[PRIVACY.md](PRIVACY.md) says which company receives the task under each
value.

[The model of each request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request) also says when the
`jev-latest` alias moves.

### The scoring model of each provider

The `models` option names the scoring model of each provider.
[The `models` setting](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-models-setting)
lists its forms, its defaults, the OpenRouter names and the lines of the config
tool. It is a row of `/config`, where you type the text.

Claude Code hands `models` to the mod as stored, because the option has no
list. A value that is not valid skips routing with
`models not valid: run setup`, as the other three harnesses do.

The config tool takes a `models` string and writes it at once, with no dialog,
at your request. A text that is not valid is refused with
`models unchanged: not valid: <entry>`.

### A stored value outside an option's list

Claude Code hands the mod an option's default in place of a stored value that
the option's list does not hold. The stored value stays in the settings.
[The hooks module](https://github.com/Akurganow/model-router/blob/main/docs/clients.md#hooks-module)
holds the harness fact.

So the mod never gets such a value, and Claude Code shows no
`<setting> not valid: run setup` line for it. This platform limit makes Claude
Code differ from the other three harnesses.
[A setting that is not valid](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-setting-that-is-not-valid)
holds the rule.

An install updated from an earlier version follows these rules:

- A stored `provider` of `auto`, `openrouter-first` or `openrouter` reaches the
  mod as `typesafe`, on the direct path, with no setup line.
- A stored `openrouter` asked OpenRouter only. Beside a TypeSafe key, the mod
  now sends the task text to TypeSafe's own API.
- With no TypeSafe key, every call then skips with `key unset`.
- To get the earlier requests back, set `gateway` to the value `provider`
  held. [Retired values of `provider`](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retired-values-of-provider)
  gives the pairs.
- A missing `scope` counts as `core`, so an update changes no routing.

## Scope

The `scope` option says which Agent calls the mod routes:

- `core` (default): the four built-in agents.
- `extended`: also every other Agent call that passes no model and no name,
  forks excepted. [Which calls are routed](#which-calls-are-routed) lists
  the cases.

## Change the options

The plugin has eight options: `provider`, `gateway`, `scope`, `models` and
the four keys.
Set them in the install dialog. `/config` also changes `provider`, `gateway`,
`scope` and `models`.

Claude Code ignores plugin options in project and local settings. No project
can set `provider`, `gateway` or `scope`.
[The privacy policy](PRIVACY.md) says what the options can and cannot change.

Three commands show or change an option:

- `/model-router:provider [typesafe|openai|google]`
- `/model-router:gateway [direct|auto|openrouter-first|openrouter]`
- `/model-router:scope [core|extended]`

Run a command with no value to print the current value. The gateway line
also prints the order, for example `gateway: auto (typesafe, then openrouter)`.
Run it with a value, for example `/model-router:scope extended`, to write the
option and print the new value. Claude Code reloads the mod when an option
changes, so the new value holds from the next subagent call of the same
session.
[The option commands](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-option-commands)
says what a bad value or a refused write prints. A command writes only when
you type it at your own prompt. From any other origin a valid value writes
nothing, and the command prints the current value. When Claude runs a command
itself, the command's text tells Claude to call the tool below.

The tool `mcp__model-router__config` takes two optional inputs, `setting` and
`models`. A call that passes both is refused:

- With no input, it returns the provider line, the gateway line, the scope
  line, the models lines and the key lines, as
  [The config tool](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-config-tool)
  gives them. The tool never returns a key, its length or any part of it.
- With `provider`, `gateway` or `scope`, the mod opens its own dialog. The current value
  comes first, and each label says what the value does. The mod writes only
  the value you pick. It writes nothing for free text, for the current value
  or for a dismissed or interrupted dialog. It writes nothing where no dialog
  can open, such as `claude -p`. A written value, a refused write and a failed
  write get the reply the command gives.
- With `models`, a string, the mod writes the text at once, with no dialog, at
  your request. A text that is not valid is refused with
  `models unchanged: not valid: <entry>`, and nothing is written.

The tool takes no key. Add a key in the plugin's settings: `/plugin` in the
terminal, or the plugin's gear icon in VS Code. The model never passes a
value for `provider`, `gateway` or `scope`. It passes one for `models`, at your
request. Your permission rules apply to the tool, as they do to the Agent call.
Calls run one at a time. The mod reads the current value after the previous
dialog closes.

To be guided through the choices, ask Claude to run the `model-router-setup`
skill. It reads the settings and the key status through the tool, then asks
about the provider, the gateway, any missing key and the scope, and it moves a
retired `provider` value into `models`. It lists the reasons routing
is off and ends with a routing check. The skill lives in
[skills/model-router-setup/SKILL.md](skills/model-router-setup/SKILL.md).

## Models

The mod has no option for the subagent's model. Each level has a fixed one.
[The scoring model of each provider](#the-scoring-model-of-each-provider) is a
different setting.


| Level | Judgment the task needs | Model |
| --- | --- | --- |
| 0 | Lookup or transcription | `haiku` |
| 1 | Bounded judgment | `sonnet` |
| 2 | Open judgment | `opus` |

[Precedence](#precedence) lists what can replace the pick.

## Routing

The judgment question picks the level. The mod stays at level 1 unless an end
is clearly more likely.
[model-choice.md](docs/model-choice.md#the-default-level) explains the factors.

### Precedence

The mod sets the subagent's model at `agent.spawn`, before Claude Code
resolves it. A model that a mod sets there replaces the Agent call's `model`
parameter, which Claude Code otherwise ranks above an agent definition's
`model` and `CLAUDE_CODE_SUBAGENT_MODEL`. So a routed model outranks
`CLAUDE_CODE_SUBAGENT_MODEL`.

Two settings outrank the mod:

- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` makes Claude Code ignore the model a call
  or a mod passes, so the forced model wins.
- `CLAUDE_CODE_EFFORT_LEVEL` takes precedence over any `effort`. When it is
  set, the mod leaves the effort of the subagent's requests as Claude Code
  chose it. The log line then shows `env effort`.

An organization's `availableModels` list can also replace a blocked pick with
another model.

### Examples

The mod needs no prompt of its own. It acts whenever Claude calls the Agent
tool. Three dispatches and what the mod does with them:

1. "Copy this function into `utils.ts` exactly as given and run the tests."
   The task holds the exact code, so the model scores it level 0. The subagent runs
   on `haiku`.
2. "Check this diff against the five requirements in the spec and list what
   is missing." Bounded judgment over given material scores level 1,
   `sonnet`.
3. "Review the whole branch for design problems and propose a split." Open
   judgment scores level 2, `opus`.

## Effort

The scoring model answers a second question: how much work the task takes once the
judgment is settled, as an index from 0 to 2. The index rests on the middle
and moves to an end only when the model gives that end more than a fitted factor
times the middle's probability: 2.38 for index 0 and 1.41 for index 2. The
factors are fitted to Jev, and `openai` and `google` use them unfitted. The index then maps to an effort per model:

| index | haiku | sonnet | opus |
| --- | --- | --- | --- |
| 0, a short task | medium | low | low |
| 1, an ordinary task | high | medium | medium |
| 2, a long or delicate task | xhigh | high | high |

The router never sets Haiku below `medium`, because Anthropic measured early
stops at `low`. `max` is never set. A call that names an effort gets a model
and keeps its effort. A call that names a model is not routed, so it keeps
both. A subagent that Claude resumes with `SendMessage` keeps its routed
effort. The mod keeps in memory the efforts of the 1024 routed subagents it
used most recently, so a reload of the mod or a restart of Claude Code forgets
them. A [changed option](#change-the-options) is such a reload.
`CLAUDE_CODE_EFFORT_LEVEL` outranks either, as
[the precedence rules](#precedence) say. Claude Code reads the per-invocation effort
from v2.1.292. Under the `extended` scope the ladder also replaces an effort
that an agent definition sets, as
[the scope cases](#which-calls-are-routed) say.

## Which calls are routed

Two scopes decide which Agent calls the mod routes. Both skip a call that sets
a `model` or a `name`, a fork, and a call your permission rules deny.

Under `core`, the default, the mod routes a call to one of the built-in agents
`general-purpose`, `claude`, `Explore` and `Plan`, as Claude Code ships them. A
call with no `subagent_type` counts as `general-purpose`. Every other call
passes through untouched:

- A fork inherits its parent's model.
- `statusline-setup` and `claude-code-guide` have a model of their own.
- A user, project or plugin agent keeps its own choices. That holds for one
  that takes the name of a built-in too: the mod routes a name only while the
  latest offer for it comes from Claude Code itself.
- A name Claude Code has not offered yet is not routed.
- A call that sets a `model` or a `name` keeps what it set.

Under `extended`, the mod routes every Agent call that passes no `model` and
no `name`, except a fork. That covers plugin, user and project agents, and
built-ins with a model of their own, such as `statusline-setup` and
`claude-code-guide`. The decision never depends on which agents Claude Code
has offered.

Claude Code does not expose the model or the effort an agent definition sets.
So under `extended`, a routed call's model and effort replace the ones the
definition sets. A plugin agent that pins a strong model can therefore run on
a lower tier. A caller's own `effort` is kept, as under `core`. Keep `core`
for agents whose model or effort you chose on purpose.

Under both scopes, agents that a workflow script starts, teammates, resumed
agents, and agents that another plugin starts with its own `$.agent.spawn`
pass through. The mod routes only a spawn that the Agent tool makes.

## The log line

For a lookup the log shows:

```text
model-router L0 haiku · medium · p=0.91/0.62 · typesafe jev-1.14.0 · 812/9 tok
```

A routed line reads `L<level> <model> · <effort or kept label> · p=<tier>/<work>`.
The probabilities belong to the chosen level and the chosen work index.
[The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line)
says what the tail holds and how a fallback ends the line. A kept caller effort shows as
`caller effort`, and a `CLAUDE_CODE_EFFORT_LEVEL` that is set shows as
`env effort`, in place of the ladder label. The pick is logged as the call starts, and a call that
Claude Code then refuses adds a second line, `denied`.

### Troubleshooting

- No log line appears: the plugin is disabled, the call passed through, or
  your permission rules deny the Agent call. Forks, named agents and calls
  that name a model pass through under both scopes. Under `core`, agents other
  than the four built-ins pass through too. Run `/model-router:scope` to see
  the scope, and [the cases of each scope](#which-calls-are-routed) list them. Enable the plugin in `/plugin`.
- A routed call logs `skipped, <cause>` and runs unchanged. The causes are:
  - `key unset`: no path the `gateway` option allows has a key. [Keys](#keys)
    says where the mod looks. Set one as [Set up](#set-up) says for your app,
    then run `/reload-plugins`. In the desktop app a saved key can read back as
    empty after a restart. [The workaround for the desktop app](#keys-in-the-desktop-app)
    is under Keys.
  - `models not valid: run setup`: the `models` option holds a value that is
    not valid. The config tool names the failing entry. Write a valid text, as
    [The scoring model of each provider](#the-scoring-model-of-each-provider)
    says.
  - `HTTP <status>`, `network error`, `bad reply` or `failed`: the attempt gave
    no score. [A failed attempt](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#a-failed-attempt) explains
    each. [The fallback rule of the line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line)
    says how the line names two of them. An organization fetch
    policy that refuses openrouter.ai shows as `network error` too.
  - `timeout`: a first attempt got no answer in 5 s, or the call got no
    decision in the 10 s limit. Check the network and try again.
  - `cancelled`: Claude Code abandoned the call before the answer came, for
    example because you interrupted it.
- A subagent ran on a model you did not expect: the mod did not route the
  call, or `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` forced a model. Under
  `extended`, the mod replaced the model its agent definition sets. Pass
  `model` in the Agent call to choose one, unless the force is on.
- A subagent thinks harder or less than you expect: [the effort ladder](#effort)
  set it, or `CLAUDE_CODE_EFFORT_LEVEL` did. Name `effort`
  in the Agent call to keep your own. Under `extended`, the ladder replaces
  the effort an agent definition sets.
- A subagent ran on a substituted model at the router's effort: your
  organization's `availableModels` replaced the pick. The effort stayed with
  the call. Name `effort` in the Agent call.
- A kind of task lands on the wrong tier: add a labelled brief to
  `calibration.jsonl` at the repository root and reword a tier text in
  `src/core/parts/tier.ts`. Then run the calibration script.

## Limits

One fixed 10 s limit covers the whole call, retries and the second attempt
included. A call that runs past it runs unchanged.
[The routing limit and billing](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-limit-and-billing) says what a
request in flight can cost.

## Update

Claude Code turns auto-update off by default for a
third-party marketplace like this one. To turn it on, choose
**Enable auto-update** for the marketplace on the **Marketplaces** tab of
`/plugin`. To update by hand, run these lines in a shell:

```sh
claude plugin marketplace update model-router
claude plugin update model-router@model-router
```

Then run `/reload-plugins` in each open session, or start a new one.

## Turn it off

To turn routing off, disable the plugin in `/plugin`. The
plugin sends nothing while it is disabled. To remove it, run this line in a
shell:

```sh
claude plugin uninstall model-router@model-router
```

If you added `TYPESAFE_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` or
`OPENROUTER_API_KEY` to the `env` block of `~/.claude/settings.json`, delete
those lines too.

Removing the key of every path the `gateway` option allows also stops
routing, and every routed call then reports `key unset`.

## What leaves the machine

On each routed call the mod sends an HTTPS POST through Claude Code's own
`$.http.fetch` to the first path of the `gateway` value that has a key:

- The direct path, the provider's own API: `api.typesafe.ai`, `api.openai.com`
  or `generativelanguage.googleapis.com`, with the key of the provider you
  chose.
- The gateway path, OpenRouter: `openrouter.ai`, with your OpenRouter key.

[The request](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-request)
lists the address and the model of each path and the header that carries the
key.

The second attempt runs only after the first fails, as below. Each key goes
only to the company that issued it. The body holds:

- the task text, condensed and redacted as below
- the agent's role: the built-in `general-purpose` and `claude` agents send a
  fixed text, and every other agent sends its description, masked and cut to
  500 characters.
  [The role of the default agent](docs/model-choice.md#the-role-of-the-default-agent)
  says why
- the caller's one-line description, masked like the task text
- the model of the endpoint and two scoring questions with their
  three texts each, which ship with the plugin

Two steps run on the task text before it leaves. Fenced code blocks become a
one-line size note, and token-shaped strings are masked, as
[The task text](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-task-text)
lists. A text over 12,000 characters keeps its start and its end, joined by a
marker that says the middle is omitted. Nothing else leaves the machine.

Under `extended`, the descriptions and task text of your user, project and
plugin agents leave too. [The extended scope](PRIVACY.md#the-extended-scope)
says what that can expose, and [the rest of the privacy policy](PRIVACY.md) lists what else the
mod reads, stores and passes on.

[Retries and the second attempt](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-attempt)
gives the requests of each attempt.

The request is sent when the subagent spawns, after Claude Code's permission
decision for the Agent call. A call that your rules or the auto-mode
classifier deny never spawns, so nothing is sent. Auto mode reviews the Agent
input as the model wrote it, and the mod does not rewrite it afterwards. A
rule on the model the mod picks applies after the request left. To read each
request as it left, start Claude Code with `--debug`. The mod writes each
request body to the debug log, in numbered pieces when it is long. The key is never written.

Any failure, from a missing key to a timeout, leaves the call unchanged. The
log line then says `skipped` and names the cause, as
[the troubleshooting steps](#troubleshooting) list them.

[The policy of this plugin](PRIVACY.md) states the same in policy form.

## Support

Questions and bug reports go to
https://github.com/Akurganow/model-router/issues. The privacy policy is
[PRIVACY.md beside this guide](PRIVACY.md).
