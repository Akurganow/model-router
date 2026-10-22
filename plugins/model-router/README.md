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

- **Acts on your machine as you?** No. It reads no files, writes none and
  starts no program.
- **Reads your secrets?** Only its own TypeSafe key. It comes from the
  plugin's sensitive `api_key` option, which Claude Code hands it from secure
  storage. When that option is empty, the mod reads the key from the
  environment variable `TYPESAFE_API_KEY`. It reads no other environment
  variable and no file. Its other option is `model`, the Jev alias.
- **Sees your session?** The arguments of each Agent tool call. It sends the
  task, the description and the agent type. It reads `model`, `name` and
  `effort` to decide whether to route and whether to keep the caller's effort.
  It also sees the name and source of each agent Claude Code offers, to tell a
  built-in from a user or plugin agent. It asks Claude Code's permission
  verdict for the call through `$.tool.check`, which opens no dialog and runs
  nothing. The verdict never leaves the machine. Between calls it keeps only
  the latest source of each agent name, in memory.
- **Changes your session?** Two arguments of that Agent tool call: `model`
  and `effort`. It sets `effort` only when the call names none.
- **Acts without asking you?** No. It approves or denies nothing. Your
  permission rules and prompts decide every call.
- **Spends your usage?** No model calls on your plan. Up to three requests per
  routed call go to TypeSafe on your TypeSafe key: one request and up to two
  retries.

`claude plugin validate plugins/model-router` lists the same from the code.
This is the whole surface:

| Kind | Name | Why the mod has it |
| --- | --- | --- |
| hook | `agent.offer` | Records which agents Claude Code offers and from where. It passes each offer on unchanged. |
| hook | `tool.call{tool=Agent}` | Routes the Agent call. |
| call | `$.clock.after` | The TypeSafe SDK's timers run on it, for example its retry wait. |
| call | `$.clock.sleep` | Times the 8 s limit. |
| call | `$.env.get` | Reads `TYPESAFE_API_KEY`, the one variable the mod reads. |
| call | `$.http.fetch` | Sends the request to TypeSafe. |
| call | `$.tool.check` | Asks for the permission verdict of the call. |
| call | `$.ui.log` | Writes the log line, and the request body to the debug log. |

`tools/surface.json` in the repository lists the same names, and CI compares
them with the validate output.

## Routing

On each routed call the mod sets the model and, unless the call names one,
the effort. One dim line per routed call shows the pick. To turn routing off,
disable the plugin in `/plugin`.

The `Jev model` row holds the TypeSafe alias the request names:

- `jev-latest` (default): the most recent official Jev release.
- `jev-preview`: the most recent release, official or not.

Both aliases move when TypeSafe ships a release, so the picks can shift with
no change to the plugin. TypeSafe's [Models](https://docs.typesafe.ai/models)
page says which version each alias points to.

### Which calls are routed

The mod routes a call to one of the built-in agents `general-purpose`,
`claude`, `Explore` and `Plan`, as Claude Code ships them. A call with no
`subagent_type` counts as `general-purpose`. The call must also set no
`model`, must not be a fork and must have no `name`.

Every other call passes through untouched:

- A fork inherits its parent's model.
- `statusline-setup` and `claude-code-guide` have a model of their own.
- A user, project or plugin agent keeps its own choices. That holds for one
  that takes the name of a built-in too: the mod routes a name only while the
  latest offer for it comes from Claude Code itself.
- A name Claude Code has not offered yet is not routed.
- A call that sets a `model` or a `name` keeps what it set.

Agents that a workflow script starts, or that another plugin starts without
the Agent tool, pass through as well.

### Precedence

The mod sets the Agent call's `model`, the per-invocation parameter. Claude
Code ranks that parameter first, above an agent definition's `model` and above
`CLAUDE_CODE_SUBAGENT_MODEL`. So a routed call's model outranks
`CLAUDE_CODE_SUBAGENT_MODEL`.

Two settings outrank the mod:

- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` makes Claude Code ignore the model a call
  passes, so the forced model wins.
- `CLAUDE_CODE_EFFORT_LEVEL` takes precedence over the call's `effort`.

An organization's `availableModels` list can also replace a blocked pick with
another model.

## What leaves the machine

On each routed call the mod sends an HTTPS POST to
https://api.typesafe.ai/v1/systemone through Claude Code's own `$.http.fetch`,
with your TypeSafe key as the bearer token. The body holds:

- the task text, condensed and redacted as below
- the agent type and the caller's one-line description
- the Jev alias from the `Jev model` row and two scoring questions with their
  three texts each, which ship with the plugin

Two steps run on the task text before it leaves. Fenced code blocks become a
one-line size note. Token-shaped strings are masked: `Bearer …`, `sk-…` keys,
and assignments to names ending in `key`, `token`, `secret` or `password`. A
text over 12,000 characters keeps its start and its end, joined by a marker
that says the middle is omitted. Nothing else leaves the machine.

A routed call sends one request and up to two retries. The mod uses the
official TypeSafe SDK. It retries a connection error, and a 408, 429 or 5xx
status, up to three attempts in all. It waits for a `Retry-After` header when
one comes, within the limit, and otherwise backs off for a short time. Any
other status is not retried.

One fixed 8 s limit covers the whole call, retries included. A 429 with a long
`Retry-After` can hold a task for up to 8 s. The call then runs unchanged. The
mod stops waiting at the limit, but it cannot recall a request in flight. A
request can reach TypeSafe even when its answer never returns, so a retry after
a network failure may be billed more than once.

The request is sent before Claude Code's permission check for the call.
Before routing, the mod asks Claude Code's permission rules about the call's
original arguments. If they deny the call, nothing is sent. A rule
on the model the mod picks, a PreToolUse hook and the auto-mode classifier
decide after the request left. A call that prompts you is sent before you
answer. To read each request as it left, start Claude Code with `--debug`. The
mod writes each request body to the debug log, in numbered pieces when it is
long. The key is never written.

Any failure, from a missing key to a timeout, leaves the call unchanged. The
log line then says `skipped` and names the cause, as
[Troubleshooting](#troubleshooting) lists.

[PRIVACY.md](PRIVACY.md) states the same in policy form.

## Effort

Jev answers a second question: how much work the task takes once the
judgment is settled, as an index from 0 to 2. The index rests on the middle
and moves to an end only when Jev gives that end more than twice the
middle's probability. The index then maps to an effort per model:

| index | haiku | sonnet | opus |
| --- | --- | --- | --- |
| 0, a short task | medium | low | low |
| 1, an ordinary task | high | medium | medium |
| 2, a long or delicate task | xhigh | high | high |

The router never sets Haiku below `medium`, because Anthropic measured early
stops at `low`. `max` is never set. A call that names an effort gets a model
and keeps its effort. A call that names a model is not routed, so it keeps
both. `CLAUDE_CODE_EFFORT_LEVEL` outranks either, as
[Precedence](#precedence) says. Claude Code reads the per-invocation effort
from v2.1.292.

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

The second number is the probability of the chosen work index. The tail names
the Jev model that answered and its input and output tokens. A part the answer
lacks is left out. A kept caller effort shows as `caller effort` in place of
the ladder label. The pick is logged as the call starts, and a call that
Claude Code then refuses adds a second line, `denied`.

## Troubleshooting

- No log line appears: the plugin is disabled, the call passed through, or
  your permission rules deny the Agent call. Forks, named agents, calls that
  name a model and agents other than the four built-ins pass through, as
  [Routing](#which-calls-are-routed) lists. Enable the plugin in `/plugin`.
- A routed call logs `skipped, <cause>` and runs unchanged. The causes are:
  - `key unset`: neither the `api_key` option nor `TYPESAFE_API_KEY` holds a
    key. Set one as
    [Install](https://github.com/Akurganow/model-router#install) says for
    your app, then run `/reload-plugins`. In the desktop app a saved key can read back as
    empty after a restart, so set `TYPESAFE_API_KEY` in the `env` block of
    `~/.claude/settings.json` instead.
  - `bad reply`: TypeSafe answered, but the answer lacks a valid score for
    one of the two questions.
  - `timeout`: no decision in 8 s. Check the network and try again.
  - `cancelled`: Claude Code abandoned the call before the answer came, for
    example because you interrupted it.
  - `network error`: every attempt failed before an answer came. Check the
    network and try again.
  - `HTTP <status>`: TypeSafe answered with that status, after the retries for
    a status that is retried. `HTTP 401` means TypeSafe rejected the key.
    Check it at https://console.typesafe.ai/keys. `HTTP 429` and `HTTP 503`
    mean TypeSafe refused or failed on every attempt. Try again later.
  - `rejected request`: the SDK refused the request itself.
  - `failed`: any other error.
- A subagent ran on a model you did not expect: the mod did not route the
  call, or `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` forced a model. Pass `model` in
  the Agent call to choose one, unless the force is on.
- A subagent thinks harder or less than you expect: the effort ladder in
  [Effort](#effort) set it, or `CLAUDE_CODE_EFFORT_LEVEL` did. Name `effort`
  in the Agent call to keep your own.
- A subagent ran on a substituted model at the router's effort: your
  organization's `availableModels` replaced the pick. The effort stayed with
  the call. Name `effort` in the Agent call.
- A kind of task lands on the wrong tier: add a labelled brief to
  `calibration.jsonl` at the repository root and reword a tier text in
  `src/model.ts`. Then run the calibration script.

## Support

Questions and bug reports go to
https://github.com/Akurganow/model-router/issues. The privacy policy is in
[PRIVACY.md](PRIVACY.md).
