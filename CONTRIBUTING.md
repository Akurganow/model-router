# Contributing

Report problems in
[the issue tracker](https://github.com/Akurganow/model-router/issues). Write
every commit as a [conventional commit](#commits).

## Repository layout

- `src/` holds the parts, the composer, the client, the brief and the two
  adapters. Its tests sit beside the sources as `src/*.test.ts`.
- `src/model.ts` holds the tier texts, and `src/effort.ts` holds the work
  texts. Neither imports the other.
- `src/part.ts` holds the shared types and the answer check. `src/model.ts`
  and `src/effort.ts` both build on it.
- `plugins/model-router` is the Claude Code plugin.
- `plugins/model-router-omp` is the omp plugin.
- `.claude-plugin/marketplace.json` is the Claude Code catalog.
- `.omp-plugin/marketplace.json` is the omp catalog. Each harness reads only
  its own catalog.
- `scripts/build.ts` builds the bundle of each plugin from `src/`. Both
  bundles inline the TypeSafe SDK, so each plugin runs on its own.
- `scripts/manifests.ts` lists the files that carry the plugin version.
  `node scripts/set-version.ts VERSION` writes the version `VERSION` to them.
  `VERSION` stands for the new version, such as `0.14.0`.
  `node scripts/set-version.ts --check` fails when they differ.
- `evals/` and `scripts/evals.ts` run real clients against the plugins.

Claude Code installs the `plugins/model-router` folder, so that folder holds
no `package.json`. Claude Code installs the packages of a lockfile in a
plugin's root onto every user's machine. Anthropic's directory holds such a
plugin for a reviewer. The development tools therefore live at the repository
root.

## Build and check

Run these commands from the repository root:

```sh
npm ci
node scripts/build.ts
claude plugin validate --strict plugins/model-router
node scripts/check-surface.ts
claude plugin test plugins/model-router
npm run check
```

- `npm ci` installs the development tools.
- `node scripts/build.ts` builds the hooks module,
  `plugins/model-router/hooks/register.js`, from `src/claude.ts` and checks
  its shape. It also writes `plugins/model-router-omp/extension/index.js`
  from `src/`, the only file omp loads. The plugins load these bundles, so
  build before you validate or test.
- `claude plugin validate --strict plugins/model-router` lists the hooks and
  engine calls of the mod. `--strict` fails on warnings too.
- `node scripts/check-surface.ts` compares that list with
  `tools/surface.json`.
- `claude plugin test plugins/model-router` runs the tests in
  `plugins/model-router/tests/`, with no network.
- `npm run check` runs these checks:
  - `tsc` type-checks the plugin tests, `src/` and `scripts/`.
  - `node scripts/set-version.ts --check` checks that the plugin versions
    agree.
  - `node --test` runs the tests of `src/`, `scripts/` and the omp plugin.
  - Biome runs with warnings as errors.
- `npm run check` runs neither `claude plugin validate` nor
  `node scripts/check-surface.ts`. It runs no `claude plugin test` either.
- `npm run fix` formats the code and applies the safe lint fixes.

The type-check of the plugin tests needs the steps under
[Type declarations](#type-declarations).

## Type declarations

`npx tsc -p src` type-checks the sources. They declare the few mod types they
use, so they need nothing else.

`npx tsc -p .` type-checks the plugin tests. The hooks and tests check against
the declarations that Claude Code writes into
`plugins/model-router/.claude-plugin/types/` when it loads the mod. The root
`tsconfig.json` extends the tsconfig written there.

1. Run `claude --plugin-dir plugins/model-router` once in an interactive session.
2. Quit the session.

No command writes the declarations without a session. CI therefore
type-checks only `src/` and `scripts/`.

## Calibration

```sh
node scripts/calibrate.ts <typesafe|openrouter> [model]
```

`scripts/calibrate.ts` is a developer tool, and Claude Code never runs it. It
needs Node 22.18 or 23.6 or later. Its first argument names the provider. It
reads that provider's key from a masked prompt or from stdin. The prompt names
the host that gets the key, for example
`OpenRouter API key for https://openrouter.ai/api:`. The script sends
`calibration.jsonl`, twenty-one labelled briefs, to the endpoint that the
plugins use for that provider. Its optional second argument names the Jev
model and defaults to `jev-latest`. It exits 1 when tier or work
agreement falls below 85%.

Fix a miss by rewording a tier text in `src/model.ts` or a work-level text in
`src/effort.ts`. Then rebuild with `node scripts/build.ts`. Never lower the
bar.

The masked prompt keeps the key out of command lines and shell history. Pipe
the key only from a source that keeps it out of the command line.

## Commits

Every commit is a [conventional commit](https://www.conventionalcommits.org),
because the release reads the commit types since the last tag. Run this once
in a clone:

```sh
cog install-hook commit-msg
```

The hook from `cog.toml` then refuses a non-conforming message at commit time.

In a git worktree the command fails, because `.git` there is a file. Install
the hook by hand instead:

1. Run `git rev-parse --git-common-dir` to find the shared git folder.
2. Copy the hook's script from `cog.toml` into `hooks/commit-msg` in that folder.
3. Make `hooks/commit-msg` executable.

## Dependencies

`package.json` and `package-lock.json` pin every dependency to an exact
version. `.npmrc` installs a version 14 days after its release at the
earliest, and it runs no install scripts. These settings need npm 11.10.0 or
later. `npm ci` refuses an older npm, which would ignore the window.

Renovate (`.github/renovate.json`) keeps every pinned version current:

- the development tools
- Claude Code and omp for CI and the evals
- Bun
- the actions

Renovate proposes updates after the same 14 days, one pull request a week per
group. It proposes security fixes at once.

CI fails on any of these:

- an open advisory
- a package without a valid registry signature
- a pull request that adds a vulnerable dependency
- a pull request that adds a license outside the permissive list in
  `.github/workflows/dependency-review.yml`

## Continuous integration

CI runs these checks:

- the tests
- `claude plugin validate --strict plugins/model-router`
- `node scripts/check-surface.ts`, which checks that the hooks and engine
  calls of the mod match `tools/surface.json`
- `tsc -p src` and `tsc -p scripts`
- `biome ci`
- Anthropic's plugin policy scan, with the prompt in `.github/policy/`

A pull request merges only when all of them pass.

A new hook or engine call changes what Anthropic's directory and users see.
Update `tools/surface.json` and the surface table in
[plugins/model-router/README.md](plugins/model-router/README.md) in the same
change.
