# model-router

The repository [README](https://github.com/Akurganow/model-router) says what
this mod does and how to
[install it](https://github.com/Akurganow/model-router#install). This file
says what the mod can reach, what leaves the machine, the routing, the effort
ladder and the troubleshooting steps.

To install, run this line in a Claude Code session:

```text
/plugin install model-router --marketplace Akurganow/model-router
```

## What this mod can reach

[Anthropic's guide to trusting a mod](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod)
asks six questions. The answers for this mod:

- **Acts on your machine as you?** No. It reads no files, writes no files of
  its own and starts no program.
- **Reads your secrets?** Only its own TypeSafe and OpenRouter keys. Claude
  Code hands it the plugin's sensitive `api_key` and `openrouter_api_key`
  options from secure storage. When an option is empty, the mod reads the key
  from `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`. It reads a key only for a
  provider the `provider` option allows. It reads one more environment
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
  the [extended scope](#which-calls-are-routed), replaces the one the agent's
  definition sets. A model without effort gets none. It registers one tool the model can call,
  `mcp__model-router__config`. The tool reads the settings and opens the
  mod's own dialog. It writes the `provider` and `scope` options only after
  you pick a value there. The two commands write the same options, and only from your own prompt. The
  model never passes a value. [Change the options](#change-the-options) has
  the details.
- **Acts without asking you?** No. It approves nothing, and it denies only its
  own tool when your permission rules deny that tool. Your permission rules
  and prompts decide every call. Every setting change waits for your choice in
  the mod's dialog or your own command.
- **Spends your usage?** No model calls on your plan. Up to four requests per
  routed call go to TypeSafe or OpenRouter, each on its own key, as
  [What leaves the machine](#what-leaves-the-machine) counts them. An
  OpenRouter key may also pay for your chat models, and the scoring requests
  spend the same credit.

`claude plugin validate plugins/model-router` lists the same from the code.
This is the whole surface:

| Kind | Name | Why the mod has it |
| --- | --- | --- |
| hook | `agent.offer` | Records which agents Claude Code offers, from where and with which description. It passes each offer on unchanged. |
| hook | `command.run{command=model-router:provider}` | Answers the `/model-router:provider` command. |
| hook | `command.run{command=model-router:scope}` | Answers the `/model-router:scope` command. |
| hook | `session.start` | Registers the `mcp__model-router__config` tool, at session start and after each plugin reload. |
| hook | `agent.spawn` | Scores the brief and sets the subagent's `model` before it starts. |
| hook | `tool.call{tool=Agent}` | Passes the Agent call on unchanged and notes whether the caller set an `effort`. |
| hook | `tool.call{tool=mcp__model-router__config}` | Answers the `config` tool: the settings and the dialogs. |
| hook | `turn.step` | Sets the routed `effort` on the subagent's requests. |
| hook | `turn.complete` | Forgets that a finished subagent's first request already waited for the spawns in flight. |
| call | `$.clock.after` | The TypeSafe SDK's timers run on it, for example its retry wait. |
| call | `$.clock.sleep` | Times the 8 s limit. |
| call | `$.config.set` | Writes the `provider` or `scope` option, after you pick a value in the dialog or give a command with a value at your own prompt. |
| call | `$.env.get` | Reads `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY`, and whether `CLAUDE_CODE_EFFORT_LEVEL` is set, the only variables the mod reads. |
| call | `$.http.fetch` | Sends the request to TypeSafe or OpenRouter. |
| call | `$.tool.check` | Asks for the permission verdict of a call to the `config` tool. |
| call | `$.tool.register` | Registers the `config` tool. |
| call | `$.ui.ask` | Opens the mod's dialog for a setting. |
| call | `$.ui.log` | Writes the log line, and the request body to the debug log. |

`tools/surface.json` in the repository lists the same names, and CI compares
them with the validate output.

## Routing

On each routed call the mod sets the model and, unless the call names one,
the effort. One dim line per routed call shows the pick. To turn routing off,
disable the plugin in `/plugin`.

### Options

The plugin has four options. Set them in the install dialog or in `/config`:

- `provider`: which providers may score a call, and in which order.
  - `typesafe` (default): TypeSafe only.
  - `openrouter`: OpenRouter only.
  - `auto`: TypeSafe, then OpenRouter when TypeSafe fails.
  - `openrouter-first`: OpenRouter, then TypeSafe when OpenRouter fails.
- `scope`: which Agent calls the mod routes.
  - `core` (default): the four built-in agents, as before.
  - `extended`: also every other Agent call that passes no model and no name,
    forks excepted. [Which calls are routed](#which-calls-are-routed) lists
    the cases. A value other than these two counts as `core`.
- `api_key`: your TypeSafe key, a sensitive value.
- `openrouter_api_key`: your OpenRouter key, a sensitive value.

With `auto` or `openrouter-first` and only one key set, that key's provider
scores alone. [PRIVACY.md](PRIVACY.md) says which company receives the task
under each value.

Every request names the alias `jev-latest`. TypeSafe points it at the most
recent official Jev release. OpenRouter routes it to its own alias for the
newest Jev release. The alias moves when a release ships, so the picks can
shift with no change to the plugin. TypeSafe's
[Models](https://docs.typesafe.ai/models) page says which version it points
to, and the log line names the model that answered.

An install updated from an earlier version follows these rules:

- The removed `model` option is ignored, a stored `jev-preview` included. The
  mod sends `jev-latest`.
- A stored `provider` outside the four values counts as `typesafe`.
- A missing `scope` counts as `core`, so an update changes no routing.

Claude Code ignores plugin options in project and local settings. No project
can set `provider` or `scope`.
[PRIVACY.md](PRIVACY.md) says what the options can and cannot change.

### Change the options

Two commands show or change an option:

- `/model-router:provider [auto|openrouter-first|typesafe|openrouter]`
- `/model-router:scope [core|extended]`

Run a command with no value to print the current value. The provider line
also prints the order, for example `provider: auto (typesafe, then openrouter)`.
Run it with a value, for example `/model-router:scope extended`, to write the
option and print the new value. A value outside the list prints the allowed
ones. When Claude Code refuses the change, the command prints
`<setting> unchanged: <reason>`. A command writes only when you type it at
your own prompt. From any other origin the command prints the value and writes
nothing. When Claude runs a command itself, the command's text tells Claude to
call the tool below. `/config` changes the same options.

The tool `mcp__model-router__config` takes one optional input, `setting`:

- With no setting, it returns the `provider` and `scope` lines. For each
  provider the `provider` value allows, it adds `<provider> key: set` or
  `<provider> key: unset`. A key counts as set when its option or its variable
  holds a non-empty value. The tool never returns a key, its length or any
  part of it.
- With `provider` or `scope`, the mod opens its own dialog. The current value
  comes first, and each label says what the value does. The mod writes only
  the value you pick. It writes nothing for free text, for the current value
  or for a dismissed or interrupted dialog. It writes nothing where no dialog
  can open, such as `claude -p`. The reply equals the command's text for the
  same outcome.

The tool takes no key. Add a key in the plugin's settings: `/plugin` in the
terminal, or the plugin's gear icon in VS Code. The model never passes a
value. Your permission rules apply to the tool, as they do to the Agent call.
Calls run one at a time. The mod reads the current value after the previous
dialog closes.

To be guided through the choices, ask Claude to run the `model-router-setup`
skill. It reads the settings and the key status through the tool, then asks
about the provider, any missing key and the scope. It lists the reasons routing
is off and ends with a routing check. The skill lives in
[skills/model-router-setup/](skills/model-router-setup/).

### Which calls are routed

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

## What leaves the machine

On each routed call the mod sends an HTTPS POST through Claude Code's own
`$.http.fetch` to the first provider in the `provider` order:

- TypeSafe: https://api.typesafe.ai/v1/systemone, with your TypeSafe key as
  the bearer token.
- OpenRouter: https://openrouter.ai/api/v1/systemone, with your OpenRouter key
  as the bearer token.

The second provider in the order gets a request only after the first fails,
as below. Each key goes only to its own provider. The body holds:

- the task text, condensed and redacted as below
- the agent's role: the built-in `general-purpose` and `claude` agents send a
  fixed text, and every other agent sends its description, masked and cut to
  500 characters. [model-choice.md](docs/model-choice.md#the-role-of-the-default-agent)
  says why
- the caller's one-line description
- the Jev alias `jev-latest` and two scoring questions with their
  three texts each, which ship with the plugin

Two steps run on the task text before it leaves. Fenced code blocks become a
one-line size note. Token-shaped strings are masked: `Bearer …`, `sk-…` keys,
and assignments to names ending in `key`, `token`, `secret` or `password`. A
text over 12,000 characters keeps its start and its end, joined by a marker
that says the middle is omitted. Nothing else leaves the machine.

Under `extended`, the descriptions and task text of your user, project and
plugin agents leave too. [The extended scope](PRIVACY.md#the-extended-scope)
says what that can expose, and [PRIVACY.md](PRIVACY.md) lists what else the
mod reads, stores and passes on.

[Retries and the second provider](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#retries-and-the-second-provider)
gives the attempts at each provider.

One fixed 8 s limit covers the whole call, retries and the second provider
included. A call that runs past it runs unchanged.
[The routing limit and billing](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-limit-and-billing) says what a
request in flight can cost.

The request is sent when the subagent spawns, after Claude Code's permission
decision for the Agent call. A call that your rules or the auto-mode
classifier deny never spawns, so nothing is sent. Auto mode reviews the Agent
input as the model wrote it, and the mod does not rewrite it afterwards. A
rule on the model the mod picks applies after the request left. To read each
request as it left, start Claude Code with `--debug`. The mod writes each
request body to the debug log, in numbered pieces when it is long. The key is never written.

Any failure, from a missing key to a timeout, leaves the call unchanged. The
log line then says `skipped` and names the cause, as
[Troubleshooting](#troubleshooting) lists.

[PRIVACY.md](PRIVACY.md) states the same in policy form.

## Effort

Jev answers a second question: how much work the task takes once the
judgment is settled, as an index from 0 to 2. The index rests on the middle
and moves to an end only when Jev gives that end more than a fitted factor
times the middle's probability: 2.38 for index 0 and 1.41 for index 2. The index then maps to an effort per model:

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
them.
`CLAUDE_CODE_EFFORT_LEVEL` outranks either, as
[Precedence](#precedence) says. Claude Code reads the per-invocation effort
from v2.1.292. Under the `extended` scope the ladder also replaces an effort
that an agent definition sets, as
[Which calls are routed](#which-calls-are-routed) says.

## Examples

The mod needs no prompt of its own. It acts whenever Claude calls the Agent
tool. Three dispatches and what the mod does with them:

1. "Copy this function into `utils.ts` exactly as given and run the tests."
   The task holds the exact code, so Jev scores it level 0. The subagent runs
   on `haiku`.
2. "Check this diff against the five requirements in the spec and list what
   is missing." Bounded judgment over given material scores level 1,
   `sonnet`.
3. "Review the whole branch for design problems and propose a split." Open
   judgment scores level 2, `opus`.

The first runs on `haiku`. For it the log shows:

```text
model-router L0 haiku · medium · p=0.91/0.62 · jev jev-1.14.0 · 812/9 tok
```

The second number is the probability of the chosen work index.
[The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line)
says what the tail holds and how a fallback ends the line. A kept caller effort shows as
`caller effort`, and a `CLAUDE_CODE_EFFORT_LEVEL` that is set shows as
`env effort`, in place of the ladder label. The pick is logged as the call starts, and a call that
Claude Code then refuses adds a second line, `denied`.

## Troubleshooting

- No log line appears: the plugin is disabled, the call passed through, or
  your permission rules deny the Agent call. Forks, named agents and calls
  that name a model pass through under both scopes. Under `core`, agents other
  than the four built-ins pass through too. Run `/model-router:scope` to see
  the scope, and [Which calls are routed](#which-calls-are-routed) lists the
  cases. Enable the plugin in `/plugin`.
- A routed call logs `skipped, <cause>` and runs unchanged. After both
  providers fail, the line names each provider with its cause, as
  [The routing line](https://github.com/Akurganow/model-router/blob/main/docs/providers.md#the-routing-line) says. The causes are:
  - `key unset`: no provider the `provider` option allows has a key. The
    TypeSafe key comes from `api_key` or `TYPESAFE_API_KEY`, the OpenRouter
    key from `openrouter_api_key` or `OPENROUTER_API_KEY`. Set one as
    [Install](https://github.com/Akurganow/model-router#install) says for
    your app, then run `/reload-plugins`. In the desktop app a saved key can
    read back as empty after a restart. [Keys in the desktop
    app](#keys-in-the-desktop-app) has the workaround.
  - `bad reply`: the provider answered, but the answer lacks a valid score
    for one of the two questions.
  - `timeout`: a first attempt got no answer in 2 s, or the call got no
    decision in the 8 s limit. Check the network and try again.
  - `cancelled`: Claude Code abandoned the call before the answer came, for
    example because you interrupted it.
  - `network error`: every attempt failed before an answer came. An
    organization fetch policy that refuses openrouter.ai shows as this too.
    Check the network and try again.
  - `HTTP <status>`: the provider answered with that status, after the
    retries for a status that is retried. `HTTP 401` means the provider
    rejected the key. Check a TypeSafe key at https://console.typesafe.ai/keys
    and an OpenRouter key in your OpenRouter account. `HTTP 429` and
    `HTTP 503` mean the provider refused or failed on every attempt. Try
    again later.
  - `rejected request`: the SDK refused the request itself.
  - `failed`: any other error.
- A subagent ran on a model you did not expect: the mod did not route the
  call, or `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` forced a model. Under
  `extended`, the mod replaced the model its agent definition sets. Pass
  `model` in the Agent call to choose one, unless the force is on.
- A subagent thinks harder or less than you expect: the effort ladder in
  [Effort](#effort) set it, or `CLAUDE_CODE_EFFORT_LEVEL` did. Name `effort`
  in the Agent call to keep your own. Under `extended`, the ladder replaces
  the effort an agent definition sets.
- A subagent ran on a substituted model at the router's effort: your
  organization's `availableModels` replaced the pick. The effort stayed with
  the call. Name `effort` in the Agent call.
- A kind of task lands on the wrong tier: add a labelled brief to
  `calibration.jsonl` at the repository root and reword a tier text in
  `src/model.ts`. Then run the calibration script.

### Keys in the desktop app

The desktop app cannot set a plugin's key yet. A key saved from a shell also
reads back empty after the app restarts.
https://github.com/anthropics/claude-code/issues/89749

When the setup skill asks how to add a key, pick "Write it to the settings
files myself" or "Same, open the files for me". Either button names the
variable and the user settings file, and you add the variable to its `env`
block. Until the bug is fixed:

1. Open `~/.claude/settings.json`.
2. Add `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY` or both to the `env` block,
   with your keys in place of `YOUR_KEY` and `YOUR_OPENROUTER_KEY`:

   ```json
   {
     "env": {
       "TYPESAFE_API_KEY": "YOUR_KEY",
       "OPENROUTER_API_KEY": "YOUR_OPENROUTER_KEY"
     }
   }
   ```

3. Start a new session.
4. If you set `OPENROUTER_API_KEY`, run `/model-router:provider auto` in the
   session.
5. Delete those lines once the bug is fixed.

The keys sit there in plaintext, and every process Claude Code starts can see
them.

## Support

Questions and bug reports go to
https://github.com/Akurganow/model-router/issues. The privacy policy is in
[PRIVACY.md](PRIVACY.md).
