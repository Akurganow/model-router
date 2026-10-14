# model-router

This repository holds the model-router plugin for Claude Code and the tools
that check it. The plugin is the folder [plugins/model-router](plugins/model-router):
its [README](plugins/model-router/README.md) says what it does and how to
install it.

The plugin folder is what Claude Code installs, so it holds no `package.json`.
The development tools live at the repository root: Claude Code installs the
packages of a lockfile in a plugin's root onto every user's machine, and
Anthropic's directory holds such a plugin for a reviewer.

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
repository's `scripts/` with `tsc` and runs Biome, lint and formatting.
`npm run fix` formats and applies the safe lint fixes.

The hooks and tests are checked against the declarations Claude Code writes
into `plugins/model-router/.claude-plugin/types/` when it loads the mod. Run
`claude --plugin-dir plugins/model-router` once in an interactive session and
quit; `tsconfig.json` extends the tsconfig written there. No command writes
the declarations without a session, so CI type-checks `scripts/` only.

Dependencies are exact versions in `package.json` and `package-lock.json`.
`.npmrc` installs a version 14 days after its release at the earliest and runs
no install scripts. Dependabot proposes updates after the same 14 days, one
pull request a week per ecosystem, and security fixes at once. CI fails on an
open advisory, on a package without a valid registry signature, and on a pull
request that adds a vulnerable dependency or a license outside the permissive
list in `.github/workflows/dependency-review.yml`.

`scripts/calibrate.ts` is a developer tool that needs Node 22.18 or 23.6 or later. Claude Code never
runs it. It takes the TypeSafe key from a masked prompt or stdin and sends
`calibration.jsonl`, twenty-one labelled briefs, to the same endpoint. It
exits 1 when tier or work agreement falls below 85%. A miss is fixed by
rewording a tier or work-level text in `plugins/model-router/hooks/router.ts`, never by lowering
the bar. The masked prompt keeps the key out of command lines and shell
history. Pipe it only from a source that does not put the key in the command
line.

CI runs the tests, `claude plugin validate`, a check that the mod's hooks and
engine calls match `tools/surface.json`, `tsc -p scripts`, `biome ci`, and
Anthropic's plugin policy scan with the prompt in `.github/policy/`. A pull
request merges only when all of them pass.
