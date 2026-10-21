# model-router

A router that picks the cheapest model and effort for each subagent. It ships
for two harnesses, [Claude Code](#claude-code) and [Oh My Pi](#oh-my-pi) (omp).

## Claude Code

A Claude Code mod that picks the cheapest Claude model and effort for each
subagent. On every Agent tool call it routes, the mod asks
[TypeSafe Jev](https://docs.typesafe.ai) two questions: how much judgment and
how much work the task needs. Then it sets the call's `model` and `effort`.
The model is `haiku` for lookup or transcription, `sonnet` for bounded
judgment and `opus` for open judgment.
[Effort](plugins/model-router/README.md#effort) shows the effort ladder.

[docs/model-choice.md](plugins/model-router/docs/model-choice.md) says why
the tiers and the ladder are what they are, with Anthropic's sources.

The plugin is the folder [plugins/model-router](plugins/model-router). Its
[README](plugins/model-router/README.md) says what the mod can reach, what
leaves the machine, the routing, the effort ladder and the troubleshooting
steps. [PRIVACY.md](plugins/model-router/PRIVACY.md) is the privacy policy.

## Oh My Pi

The omp plugin routes each `task` batch item to one of three router agents,
`router_light`, `router_mid` and `router_heavy`, and sets the item's effort.
Jev answers the same two questions as in Claude Code. The agents run on model
roles you point at your own models.

The plugin is the folder [plugins/model-router-omp](plugins/model-router-omp).
Its [README](plugins/model-router-omp/README.md) covers the install, the setup
skill, the effort modes, conflicts with other extensions and what leaves the
machine. [PRIVACY.md](plugins/model-router-omp/PRIVACY.md) is the privacy
policy. The same TypeSafe key is needed.

## Install Claude Code

The mod needs Claude Code v2.1.293 or later and a TypeSafe API key from
https://console.typesafe.ai/keys. Claude Code keeps the key in your system's
secure storage. The steps differ by where you run Claude Code.

### Terminal

```
/plugin install model-router --marketplace Akurganow/model-router
```

Answer `y` to add the marketplace, then pick the user scope. The install
dialog asks for the key.

To set the key later, run `/plugin configure model-router@model-router` in a
session. It opens the same dialog.

### VS Code

Add the marketplace `Akurganow/model-router` on the **Marketplaces** tab of
**Manage plugins**, then install `model-router` on the **Plugins** tab. A form
asks for the key after the install. The gear icon on the plugin's row opens
the form again.

### Desktop app

The desktop app has no dialog for a plugin's key: `/plugin configure` opens
the plugin manager instead, and the plugin's page has no key field. See
[anthropics/claude-code#89749](https://github.com/anthropics/claude-code/issues/89749).
Until that is fixed, set the key from a terminal, the app's own Terminal
panel or any other. One line installs the plugin and saves the key:

```
claude plugin install model-router --marketplace Akurganow/model-router --config api_key=YOUR_KEY
```

That line leaves the key in your shell history, and while the command runs
the key is visible in the process list to anyone on the machine. On a shared
or managed machine, or if you would rather keep it out of the history, use
this line instead. It installs the plugin, then shows
`TypeSafe key:` and reads the key you paste without showing it, then hands
it to Claude Code, which saves it to secure storage. Only the line itself
goes to the history, never the key. The line is for zsh, the default shell
on macOS. In bash, write `read -rsp 'TypeSafe key: ' KEY` in its place.

```
claude plugin install model-router --marketplace Akurganow/model-router && read -rs 'KEY?TypeSafe key: ' && printf '{"api_key":"%s"}' "$KEY" | claude plugin configure model-router@model-router --values-stdin
```

The first line ends with `Successfully installed plugin`, the second with
`Configuration saved. Restart Claude Code to apply it.` A key in
`TYPESAFE_API_KEY` in the `env` block of `~/.claude/settings.json` survives
restarts, and the mod reads it whenever the saved option is empty.

### Apply the key

The mod reads the key when it loads. After the key is saved, run
`/reload-plugins` in each open session, or start a new one.

## Repository layout

- `shared/` holds the routing core, `core.ts`, and the Jev client, `jev.ts`.
  It holds the tier and work texts, `TIER_TEXTS` and `WORK_TEXTS`, with their
  tests.
- `plugins/model-router` is the Claude Code plugin.
- `plugins/model-router-omp` is the omp plugin.
- `.claude-plugin/marketplace.json` is the Claude Code catalog.
- `.omp-plugin/marketplace.json` is the omp catalog. Each harness reads only
  its own catalog.
- `scripts/sync.ts` copies the shared files into the plugin folders, because
  each plugin must run on its own. `npm run sync` writes the copies, and
  `npm run check` fails when a copy differs or the plugin versions differ.
- `evals/` and `scripts/evals.ts` run real clients against the plugins.

The Claude Code plugin folder is what Claude Code installs, so it holds no
`package.json`. The development tools live at the repository root: Claude Code
installs the packages of a lockfile in a plugin's root onto every user's
machine, and Anthropic's directory holds such a plugin for a reviewer.

## Development

From the repository root:

```
npm ci
claude plugin test plugins/model-router
npm run check
node scripts/calibrate.ts
```

`claude plugin test plugins/model-router` runs the tests, no network.
`npm run check` type-checks the plugin's `hooks/` and `tests/` and the
repository's `scripts/` with `tsc`, checks that the shared copies and the
plugin versions agree, runs the tests of `shared/`, `scripts/` and the omp
plugin, and runs Biome, lint and formatting.
`npm run fix` formats and applies the safe lint fixes.

The hooks and tests are checked against the declarations Claude Code writes
into `plugins/model-router/.claude-plugin/types/` when it loads the mod. Run
`claude --plugin-dir plugins/model-router` once in an interactive session and
quit; `tsconfig.json` extends the tsconfig written there. No command writes
the declarations without a session, so CI type-checks `scripts/` only.

Dependencies are exact versions in `package.json` and `package-lock.json`.
`.npmrc` installs a version 14 days after its release at the earliest and runs
no install scripts. That needs npm 11.10.0 or later, and `npm ci` refuses an
older npm, which would ignore the window. Renovate (`.github/renovate.json`)
keeps every pinned version current: the dev tools, Claude Code and omp for CI
and the evals, Bun and the actions. It proposes updates after the same 14 days,
one pull request a week per group, and security fixes at once. CI fails on an
open advisory, on a package without a valid registry signature, and on a pull
request that adds a vulnerable dependency or a license outside the permissive
list in `.github/workflows/dependency-review.yml`.

`scripts/calibrate.ts` is a developer tool that needs Node 22.18 or 23.6 or later. Claude Code never
runs it. It takes the TypeSafe key from a masked prompt or stdin and sends
`calibration.jsonl`, twenty-one labelled briefs, to the same endpoint. Its
optional argument names the Jev model, `jev-latest` by default. It exits 1 when tier or work agreement falls below 85%. A miss is fixed by
rewording a tier or work-level text in `shared/core.ts`, then running `npm run sync`, never by lowering
the bar. The masked prompt keeps the key out of command lines and shell
history. Pipe it only from a source that does not put the key in the command
line.

CI runs the tests, `claude plugin validate`, a check that the mod's hooks and
engine calls match `tools/surface.json`, `tsc -p scripts`, `biome ci`, and
Anthropic's plugin policy scan with the prompt in `.github/policy/`. A pull
request merges only when all of them pass.
