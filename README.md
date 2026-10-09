# model-router

A Claude Code mod that picks the cheapest Claude model for each subagent
before it starts. On every subagent dispatch the mod condenses and redacts the
task text and asks [TypeSafe Jev](https://docs.typesafe.ai) one Score question.
The mod sets the subagent's model: `haiku` for lookup or transcription,
`sonnet` for bounded judgment, `opus` for open judgment.

## What the mod does

The mod has one hook, on Claude Code's `agent.spawn` event. That event fires
when a subagent is about to start.

In `auto` mode the hook changes exactly one thing: the `model` field of that
subagent. In `suggest` mode it changes nothing and writes one dim log line.

The hook reads two values from the plugin's user configuration. They are
`api_key`, which is sensitive and kept in secure storage, and `mode`. It reads
nothing else from the machine.

On each routed dispatch the hook sends one request through Claude Code's own
`$.http.fetch`. It sends the condensed and redacted task text, the subagent's
type and the caller's one-line description to
https://api.typesafe.ai/v1/systemone. The request is an HTTPS POST with the key
as the bearer token. The body also carries the fixed model name and scoring
question that ship with the plugin.

The hook runs no commands, spawns no processes and writes no files.

`scripts/calibrate.ts` is a developer tool that you run by hand from the plugin
folder. It asks for the key at a masked prompt and sends the labelled seed to
the same host. Claude Code never runs it.

[PRIVACY.md](PRIVACY.md) states the same in policy form.

## Requirements

- Claude Code v2.1.287 or later (mods are on by default).
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

- `suggest` (default): log the model Jev would pick, change nothing. One dim
  line per dispatch shows the pick beside the model that ran.
- `auto`: set the model.

To turn routing off, disable the plugin in `/plugin`.

The hook keeps a model passed in the Agent call. In `auto` mode it overrides
a model pinned in an agent definition's frontmatter, because the hook cannot
see it. Forks, agent-team teammates and workflow agents pass through untouched.

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

In `suggest` mode each of these only logs the pick, for example
`model-router would pick L0 haiku · p=0.91 · ran on opus`. In `auto` mode the
line reads `model-router L0 haiku · p=0.91` and the subagent runs on `haiku`.

## Troubleshooting

- No log line appears: the plugin is disabled, or the dispatch was not routed.
  Forks, teammates, workflow agents and calls that name a model pass through
  untouched. Enable the plugin in `/plugin`.
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

The calibration script sends `calibration.jsonl`, twenty-one labelled briefs,
to the same endpoint and exits 1 when agreement falls below 85%. It prompts for
the key with masked input, or reads stdin when piped, so the key never appears
in command lines or shell history. A miss is fixed by rewording a tier text in
`hooks/router.ts`, never by lowering the bar.
