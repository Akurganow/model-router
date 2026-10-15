# model-router

The repository [README](../../README.md) says what this mod does and how to
[install it](../../README.md#install). This file says what the mod can reach,
what leaves the machine, the modes, the effort ladder and the troubleshooting
steps.

## What this mod can reach

[Anthropic's guide to trusting a mod](https://code.claude.com/docs/en/plugins/mods/overview#decide-whether-to-trust-a-mod)
asks six questions. The answers for this mod:

- **Acts on your machine as you?** No. It reads no files, writes none and
  starts no program.
- **Reads your secrets?** Only its own TypeSafe key. It comes from the
  plugin's sensitive `api_key` option, which Claude Code hands it from secure
  storage. When that option is empty, the mod reads the key from the
  environment variable `TYPESAFE_API_KEY`. It reads no other environment
  variable and no file. Its other option is `mode`.
- **Sees your session?** The arguments of each Agent tool call. It sends the
  task, the description and the agent type. It reads `model`, `name` and
  `effort` to decide whether to route and whether to keep the caller's effort.
  It asks Claude Code's permission verdict for the call through `$.tool.check`,
  which opens no dialog and runs nothing. The verdict never leaves the machine.
  It keeps nothing between calls.
- **Changes your session?** In `auto` mode, two arguments of that Agent
  tool call: `model` and `effort`. Nothing in `suggest` mode.
- **Acts without asking you?** No. It approves or denies nothing. Your
  permission rules and prompts decide every call.
- **Spends your usage?** No model calls on your plan. One request per routed
  call goes to TypeSafe on your TypeSafe key.

`claude plugin validate plugins/model-router` lists the same from the code: one hook,
`tool.call{tool=Agent}`, the calls `$.clock.sleep`, `$.env.get`, `$.http.fetch`,
`$.tool.check` and `$.ui.log`, and the one variable it reads.

## Mode

The `Routing mode` row in `/config` holds the mode:

- `suggest` (default): log the model and effort Jev would pick, change
  nothing. One dim line per routed call shows the pick.
- `auto`: set the model and the effort.

To turn routing off, disable the plugin in `/plugin`.

The mod routes Agent tool calls only. A fork, a named agent and a call that
names a model pass through untouched. So do agents that a workflow script
starts, or that another plugin starts without the Agent tool. In `auto` mode
the mod overrides a model or an effort pinned in an agent definition's
frontmatter, because the call does not carry them. Name `model` or `effort`
in the Agent call to keep your own.

## What leaves the machine

On each routed call the mod sends one HTTPS POST to
https://api.typesafe.ai/v1/systemone through Claude Code's own `$.http.fetch`,
with your TypeSafe key as the bearer token. The body holds:

- the task text, condensed and redacted as below
- the agent type and the caller's one-line description
- the fixed model name `jev-1.13.0` and two scoring questions with their
  three texts each, which ship with the plugin

Two steps run on the task text before it leaves. Fenced code blocks become a
one-line size note. Token-shaped strings are masked: `Bearer …`, `sk-…` keys,
and assignments to names ending in `key`, `token`, `secret` or `password`.
Nothing else leaves the machine.

The request is sent in both modes, before Claude Code's permission check for
the call. Before routing, the mod asks Claude Code's permission rules about
the call's original arguments. If they deny the call, nothing is sent. A rule
on the model the mod picks, a PreToolUse hook and the auto-mode classifier
decide after the request left. A call that prompts you is sent before you
answer. To read each request as it left, start Claude Code with `--debug`. The
mod writes each request body to the debug log, in numbered pieces when it is
long. The key is never written.

Any failure, from a missing key to a timeout, leaves the call unchanged.

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
stops at `low`. `max` is never set. An effort named in the Agent call is kept,
with or without a model. A model named in the call keeps both.

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

In `suggest` mode each of these only logs the pick. In `auto` mode the first
runs on `haiku`. For it the log shows one of these lines, `suggest` first:

```
model-router would pick L0 haiku · medium · p=0.91/0.62
model-router L0 haiku · medium · p=0.91/0.62
```

The second number is the probability of the chosen work index. A kept caller
effort shows as `caller effort` in place of the ladder label. In `auto` mode
the pick is logged as the call starts, and a call that Claude Code then
refuses adds a second line, `denied`.

## Troubleshooting

- No log line appears: the plugin is disabled, the call passed through, or
  your permission rules deny the Agent call. Forks, named agents and calls
  that name a model pass through. Enable the plugin in `/plugin`.
- The line says `model-router skipped, api_key unset`: the key is not set.
  Set it as [Install](../../README.md#install) says for your app, then run
  `/reload-plugins`. In the desktop app a saved key can read back as empty
  after a restart, so set `TYPESAFE_API_KEY` in the `env` block of
  `~/.claude/settings.json` instead.
- The line says `skipped, HTTP 401`: TypeSafe rejected the key. Check it at
  https://console.typesafe.ai/keys.
- The line says `skipped, no answer in 8000 ms`: the request timed out. The
  call ran unchanged. Check the network and try again.
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
  `calibration.jsonl` at the repository root and reword a tier text in
  `hooks/router.ts`. Then run the calibration script.

## Support

Questions and bug reports go to
https://github.com/Akurganow/model-router/issues. The privacy policy is in
[PRIVACY.md](PRIVACY.md).
