# model-router

A Claude Code mod that picks the cheapest Claude model and effort for each
subagent before it starts. On every Agent tool call it routes, the mod condenses
and redacts the task text and asks [TypeSafe Jev](https://docs.typesafe.ai) two
Score questions in one request. The mod sets the subagent's model: `haiku` for
lookup or transcription, `sonnet` for bounded judgment, `opus` for open
judgment. It also sets the subagent's effort, as [Effort](#effort) shows.

[docs/model-choice.md](docs/model-choice.md) says why the tiers and the effort
ladder are what they are, with Anthropic's sources.

## What the mod does

The mod has one hook, on Claude Code's `tool.call` event for the Agent tool,
which fires when Claude calls the Agent tool, before Claude Code's permission
check for that call.

In `auto` mode that hook changes at most two arguments of the call: `model`
and `effort`. A caller-named effort is kept. The subagent then starts as if the
caller had named them. In `suggest` mode it changes nothing and writes one dim
log line.

The hook reads the task, the one-line description and the agent type to route
the call. It also looks at `model` and `name` to decide whether to route at all,
and at `effort` to decide whether to keep it. It reads nothing else of the
conversation and keeps nothing between calls.

The mod reads two values from the plugin's user configuration. They are
`api_key`, which is sensitive and kept in secure storage, and `mode`. It reads
nothing else from the machine.

On each routed call the hook sends one request through Claude Code's own
`$.http.fetch`. It sends the condensed and redacted task text, the agent type
and the caller's one-line description to
https://api.typesafe.ai/v1/systemone. The request is an HTTPS POST with the key
as the bearer token. The body also carries the fixed model name and two scoring
questions, one for the tier and one for the work level. Both ship with the
plugin. The request goes out before Claude Code decides whether the call may
run, so a call that is then refused has already been scored.

The hook runs no commands, spawns no processes and writes no files.

`scripts/calibrate.ts` is a developer tool that you run by hand from the plugin
folder. It takes the key from a masked prompt or from stdin and sends the
labelled seed to the same host. Claude Code never runs it.

[PRIVACY.md](PRIVACY.md) states the same in policy form.

## Requirements

- Claude Code v2.1.293 or later (mods on by default, Haiku 5.5 supported).
- A TypeSafe API key from https://console.typesafe.ai/keys. The install dialog
  in `/plugin` asks for it and keeps it in your system's secure storage.
- Node 22.18 or 23.6 or later runs the calibration script.

## Install

```
/plugin install model-router --marketplace Akurganow/model-router
```

Answer `y` to add the marketplace, then pick the user scope.

## Set the key later

In a session, run `/plugin configure model-router@model-router` to open the
install dialog again. A saved key takes effect after `/reload-plugins` or in the
next session.

## Mode

The `Routing mode` row in `/config` holds the mode:

- `suggest` (default): log the model and effort Jev would pick, change nothing.
  One dim line per dispatch shows the pick.
- `auto`: set the model and the effort.

To turn routing off, disable the plugin in `/plugin`.

The hook keeps a model passed in the Agent call. In `auto` mode it overrides
a model or an effort pinned in an agent definition's frontmatter, because the
call does not carry them. Forks and named agents, which are teammates, pass
through untouched. The mod sees Agent tool calls only. Agents that a workflow
script starts, or that another plugin starts without the Agent tool, are not
routed.

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
stops at `low`. `max` is never set. An effort named in the Agent call is kept,
with or without a model: the mod sees the call and leaves that subagent's
effort alone. A model named in the call keeps both the model and the effort.

## What leaves the machine

[What the mod does](#what-the-mod-does) names the host and the request. Two
steps run on the subagent's prompt before it leaves. Fenced code blocks become
a one-line size note. Token-shaped strings are masked (`Bearer …`, `sk-…`
keys, assignments to names ending in `key`, `token`, `secret` or `password`).
Nothing else leaves the machine. Any failure, from a missing key to a timeout,
leaves the dispatch unchanged.

## Examples

The mod needs no prompt of its own. It acts whenever Claude Code starts a
subagent. Three dispatches and what the mod does with them:

1. "Copy this function into `utils.ts` exactly as given and run the tests."
   The task holds the exact code, so Jev scores it level 0. The subagent runs
   on `haiku`.
2. "Check this diff against the five requirements in the spec and list what
   is missing." Bounded judgment over given material scores level 1,
   `sonnet`.
3. "Review the whole branch for design problems and propose a split." Open
   judgment scores level 2, `opus`.

In `suggest` mode each of these only logs the pick. In `auto` mode the
subagent runs on `haiku`. For the first dispatch the log shows these lines,
`suggest` first:

```
model-router would pick L0 haiku · medium · p=0.91/0.62
model-router L0 haiku · medium · p=0.91/0.62
```

The second number is the probability of the chosen work index. A kept caller
effort shows as `caller effort` in place of the ladder label. In `auto` mode
the pick is logged as the call starts, and a call that Claude Code then refuses
adds a second line, `denied`.

## Troubleshooting

- No log line appears: the plugin is disabled, or the dispatch was not routed.
  Forks, named agents and calls that name a model pass through untouched.
  Enable the plugin in `/plugin`.
- The line says `model-router skipped, api_key unset`: the key is not set.
  Run `/plugin configure model-router@model-router`, enter the key, then
  `/reload-plugins`.
- The line says `skipped, HTTP 401`: TypeSafe rejected the key. Check it at
  https://console.typesafe.ai/keys.
- The line says `skipped, no answer in 8000 ms`: the request timed out. The
  dispatch ran unchanged. Check the network and try again.
- A subagent ran on a model you did not expect: in `auto` mode a model pinned
  in an agent definition is overridden. Pass `model` in the Agent call to
  keep it.
- A subagent thinks harder or less than you expect: the effort ladder in
  [Effort](#effort) set it. Name `effort` in the Agent call to keep your own.
- A subagent ran on a forced or substituted model at the router's effort:
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` or `availableModels` replaced the pick.
  The effort stayed with the call. Name `effort` in the Agent call, or set the
  mode to `suggest`.
- A kind of task lands on the wrong tier: add a labelled brief to
  `calibration.jsonl` and reword a tier text in `hooks/router.ts`. Then run
  the calibration script.

## Support

Questions and bug reports go to
https://github.com/Akurganow/model-router/issues. The privacy policy is in
[PRIVACY.md](PRIVACY.md).

## Calibration and tests

From the plugin folder:

```
claude plugin test .
node scripts/calibrate.ts
```

The calibration script sends `calibration.jsonl`, twenty-one labelled briefs, to
the same endpoint and exits 1 when tier or work agreement falls below 85%. It
prompts for the key with masked input, which keeps the key out of command lines
and shell history. It also reads stdin when piped. Pipe it only from a source
that does not put the key in the command line. A miss is fixed by rewording a
tier or work-level text in `hooks/router.ts`, never by lowering the bar.
