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
- `plugins/model-router-openclaw` is the OpenClaw plugin.
- `plugins/model-router-hermes` is the Hermes Agent plugin: a Python shim
  that starts the generated Node bundle `route.mjs` once per delegated task.
  Its Python uses the standard library only, so it has no `pyproject.toml`
  and no requirements file. The builder writes its `plugin.yaml`,
  `constants.json` and `route.mjs`; the Python reads every limit, table and
  text from `constants.json`.
- `packages/model-router` is the npm package that OpenClaw and omp install.
  The builder writes it, and CI packs the committed tree. Never edit it by
  hand.
- `.claude-plugin/marketplace.json` is the Claude Code catalog.
- `.omp-plugin/marketplace.json` is the omp catalog. Each harness reads only
  its own catalog.
- `metadata/` holds the one hand-written source of the manifests, the
  catalogues and the README install region. `metadata/source.json` is the
  source, and `metadata/source.schema.json` checks it.
- `scripts/build.ts` reads the source and writes every generated file. It also
  builds the bundle of each plugin from `src/`. Every bundle inlines the
  TypeSafe SDK, so each plugin runs on its own.
- `scripts/build/` holds the renderers, one for each harness's manifest and
  catalogue and one for the README install region, and their shared helpers:
  the JSON writer, the schema check, the source loader, the values taken from
  `src/` and the list of generated files.
- `scripts/manifests.ts` lists the generated manifests that carry the plugin
  version. `node scripts/set-version.ts VERSION` writes the version `VERSION`
  to `metadata/source.json` only. `VERSION` stands for the new version, such
  as `0.14.0`. `node scripts/set-version.ts --check` fails when the source and
  a manifest differ.
- `scripts/scan-owner-setup.ts` scans for owner-setup facts. See
  [Continuous integration](#continuous-integration).
- `docs/clients.md` cites how each client loads a package.
  `docs/design.md` gives the reasons for this layout and for the CI checks.
  `docs/providers.md` holds what the four plugins do the same way when they ask Jev.
- `evals/` and `scripts/evals.ts` run real clients against the plugins.

### Generated files

Edit metadata only in `metadata/source.json`. Then run
`node scripts/build.ts` and commit the generated files with the change.
Never edit a generated file by hand. CI fails when one differs from the
builder's output. `generatedFiles` in `scripts/build/copies.ts` lists the
generated files. In the README only the region between
`<!-- install:start -->` and `<!-- install:end -->` is generated.

### No package.json in the Claude Code plugin

The `plugins/model-router` folder holds no `package.json`. Claude Code
installs dependencies for a plugin whose root holds a `package.json` and a
lockfile. [docs/clients.md](docs/clients.md#package-files) cites the
condition. The development tools therefore live at the repository root.

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
- `node scripts/build.ts` writes the manifests, the catalogues and the README
  install region from `metadata/source.json`. It also builds the four
  bundles from `src/` and writes the npm tree and the Hermes plugin's
  `plugin.yaml` and `constants.json`. The Claude Code bundle is
  `plugins/model-router/hooks/register.js`, and its shape is checked. The omp
  bundle is `plugins/model-router-omp/extension/index.js`, the only file omp
  loads. The OpenClaw bundle is `plugins/model-router-openclaw/index.js`, next
  to the generated manifest `openclaw.plugin.json`. The Hermes bundle is the
  Node program `plugins/model-router-hermes/route.mjs`. Build before you
  validate or test.
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
  - `npm test` runs the tests of `src/`, `scripts/` and every
    `plugins/model-router-*/tests` folder, each with a 60-second limit. CI
    runs the same script.
  - Biome runs with warnings as errors.
- `npm run check` runs neither `claude plugin validate` nor
  `node scripts/check-surface.ts`. It runs no `claude plugin test` either.
- `npm run fix` formats the code and applies the safe lint fixes.

The type-check of the plugin tests needs the steps under
[Type declarations](#type-declarations).

`npm run check` does not run the Hermes plugin's Python tests. Run them with
any Python from 3.11 to 3.14:

```sh
python3 -m unittest discover -s plugins/model-router-hermes/tests
```

### Try the OpenClaw plugin from a checkout

Link the plugin folder in place of installing from npm:

```bash
openclaw plugins install --link ./plugins/model-router-openclaw --force --accept-capabilities
```

The link adds the folder to `plugins.load.paths`. The folder holds the generated
manifest and bundle, so run `node scripts/build.ts` before you link and after
each edit of `src/`. Then run `openclaw plugins reload model-router-openclaw`.
[docs/clients.md](docs/clients.md#openclaw-install-and-update) cites the
link and reload commands.

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
`calibration.jsonl`, 172 labelled cases, to the endpoint that the
plugins use for that provider. Its optional second argument names the Jev
model and defaults to `jev-latest`. It exits 1 when tier or work
agreement falls below 85%. This script, `scripts/compare-rules.ts` and
`scripts/evals.ts` warn on stderr when Jev answers as another model than
`FITTED_ON` in `scripts/jev-fit.ts`, the one the factors were fitted on.

Add `--record <file>` to write each case's labels and probabilities to a JSONL
file. Then compare rule modules offline on that file:

```sh
node scripts/compare-rules.ts <record.jsonl> <rule.ts>...
```

`scripts/compare-rules.ts` scores each rule module named on the command line
with 5-fold cross-validation, fitting its parameters on the training folds
only. A rule module default-exports a `Rule`. In `scripts/rules/`,
`threshold.ts` and `doubt.ts` are helpers, not rules. It prints
agreement, under-routing and over-routing for the tier and the work index.

Each case in `calibration.jsonl` names its source, its license and the basis
of its label. For a label that the brief supports both ways, set the array
`contested` to `["expected"]`, `["work"]` or both.

Fix a miss by rewording a tier text in `src/model.ts` or a work-level text in
`src/effort.ts`. Then rebuild with `node scripts/build.ts`. Never lower the
bar.

The masked prompt keeps the key out of command lines and shell history. Pipe
the key only from a source that keeps it out of the command line.

## Paid runs

A run that calls a paid model needs a question that no free check answers.
Jev calls, such as calibration, are cheap and exempt.

- Look in [docs/clients.md](docs/clients.md) first. Skip the run when it
  records the fact with a cited run on the same client version.
- Run one case on the cheapest model that shows the behaviour: `haiku` in
  Claude Code, the omp case's model from `evals/cases.json` in omp. Cap the
  turns, for example with `--max-turns` in Claude Code.
- Record the result in `docs/clients.md` with the client version, the date and
  the command, so the fact needs no second run.
- Run the evals workflow by hand only after a change to `src/`, a plugin
  folder or a pinned client version. Run it only for the clients that change
  touches, with its `clients` input.

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
- OpenClaw for CI
- Hermes Agent for CI
- Bun
- the actions, and the `uv` that `setup-hermes` installs

Renovate proposes updates after the same 14 days, one pull request a week per
group. It proposes security fixes at once.

Two pins are exceptions to the 14-day rule, both in the `setup-openclaw`
action that installs OpenClaw for CI only:

- OpenClaw itself. CI installs the latest OpenClaw release, so a Renovate rule
  raises the pin at any time with no age delay.
- The npm that OpenClaw bundles there. OpenClaw pins an exact npm, and the
  action overrides it with a newer npm release when the pinned one carries
  advisories. A Renovate rule raises that override with no age delay too. No
  other package and no other npm in the repository has this exception.

The action installs from a copy under the runner's temp folder, because the age
rule in `.npmrc` would refuse a new version. The lockfile still locks every
package by digest, and no install script runs.

Hermes Agent is the third exception. The `setup-hermes` action installs it for
CI only. CI installs the latest Hermes release at its tag and checks the
commit the tag points at, so a Renovate rule raises the tag and the commit
together at any time with no age delay. The action clones Hermes under the
runner's temp folder, and `uv sync --frozen --no-build` installs only the
wheels that Hermes's own `uv.lock` locks, so no package runs code at install
time. The `uv` it uses and the action that installs `uv` keep the 14-day rule.

CI fails on any of these:

- an open advisory
- a package without a valid registry signature
- a pull request that adds a vulnerable dependency
- a pull request that adds a license outside the permissive list in
  `.github/workflows/dependency-review.yml`

The license check exempts some packages by name: Claude Code and its platform
packages, and the packages of the OpenClaw install whose license is off the
list. Only CI installs them, in `.github/actions/setup-claude-code` and
`.github/actions/setup-openclaw`, and no plugin ships them. Any other package
with an off-list license still fails the check.

## Continuous integration

CI runs these checks:

- the tests
- `claude plugin validate --strict plugins/model-router`
- `node scripts/check-surface.ts`, which checks that the hooks and engine
  calls of the mod match `tools/surface.json`
- `tsc -p src` and `tsc -p scripts`
- `biome ci`
- Anthropic's plugin policy scan, with the prompt in `.github/policy/`. It skips
  drafts, so keep a pull request as a draft while it changes.
- the generated-file check, on Ubuntu and macOS
- the install of both plugins from the checkout
- the `package` job: it packs `packages/model-router` and compares the packed
  files with its `files` list, runs `npm publish --dry-run`, and installs the
  tarball into the pinned OpenClaw and omp
- the `hermes` job: it runs the Hermes plugin's tests on Python 3.11 and 3.14,
  validates the plugin with the pinned Hermes, installs it from the checkout,
  and runs the tests again under Hermes's interpreter
- the owner-setup scan, `node scripts/scan-owner-setup.ts --base <commit>`,
  where CI passes the commit the change starts from. Without `--base` it reads
  what your branch adds over its merge base with `origin/main`, and with no
  `origin/main` the generated files only.

A pull request merges only when all of them pass.
[docs/design.md](docs/design.md#ci-checks-the-copies-and-the-installation)
says what the last four check and why. A test that needs a home path or a
key-shaped sample builds it at run time, so the scan does not flag the test.

A new hook or engine call changes what Anthropic's directory and users see.
Update `tools/surface.json` and the surface table in
[plugins/model-router/README.md](plugins/model-router/README.md) in the same
change.

## Publishing to npm

The release workflow publishes `@akurganow/model-router` with npm trusted
publishing, so no token is stored. The `publish` job runs after a release, and
only when the repository variable `NPM_PUBLISH` is `true`.

The owner publishes the first version by hand from its tag, because npm
accepts a trusted publisher only for a package that exists. Then, within 2
days before a release that publishes:

1. Set a trusted publisher in the package's settings on npmjs.com for this
   repository and the workflow file `release.yml`.
2. Set `NPM_PUBLISH` to `true`.

A trusted publisher that sees no publication within 2 days of its setup
expires. Set it again if that happens. Every later version publishes from CI.
