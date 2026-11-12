# About this repository's design

This page explains why the repository is built the way it is.
The client facts behind each reason are in [How each client loads a package](clients.md), with their sources.
Every other fact here names its kind: a file or a run of this repository's CI, or documentation read on 2026-11-05.
The build follows the one-source principle of the public repository [Akurganow/pegboard](https://github.com/Akurganow/pegboard).

## One source for every copy

The clients read the same facts from different files.
Claude Code reads `.claude-plugin/plugin.json` and the catalogue `.claude-plugin/marketplace.json` ([Claude Code](clients.md#manifest), [catalogue](clients.md#catalogue)).
omp reads the `omp` block of `package.json` and the catalogue `.omp-plugin/marketplace.json`, with `.claude-plugin/marketplace.json` as a fallback ([omp manifest](clients.md#omp-manifest-and-settings), [omp catalogue](clients.md#omp-catalogue)).
OpenClaw reads `openclaw.plugin.json` at the plugin root and the `openclaw` block of `package.json` ([OpenClaw package files](clients.md#openclaw-package-files)).
Hermes Agent reads `plugin.yaml` at the plugin root ([Hermes package files](clients.md#hermes-package-files)).
So the plugins have six generated manifests and catalogues, and each repeats the name, the licence, the links and a description.
Anthropic's directory reads the privacy policy URL from `plugin.json` only, and omp's catalogue entry carries its own copy ([Claude Code](clients.md#manifest)).
The version sits in three of the four files, because omp upgrades only entries that declare one ([omp install and update](clients.md#omp-install-and-update)).

A copy kept by hand drifts from its source, and nothing notices until a user does.
So `metadata/source.json` is the only hand-written source of the facts those files repeat.
`metadata/source.schema.json` checks its shape.
The source holds no value list.
The value lists in the manifests come from `src/`, so a manifest cannot offer a value the code does not know.
The option texts are prose, so a test holds them to `src/` instead.
Each names every provider or scope value, except omp's provider text, which names `auto` and `openrouter-first` only.
Each character limit in the source states the number `src/brief.ts` enforces.

`scripts/build.ts` reads the source, and the renderers in `scripts/build/` write each copy.
It writes the Claude manifest, both catalogues and the omp `package.json`.
It writes the OpenClaw manifest `plugins/model-router-openclaw/openclaw.plugin.json`.
It writes the Hermes manifest `plugins/model-router-hermes/plugin.yaml`, which holds JSON text, and `constants.json` beside it.
The Python shim reads every limit, table and text from `constants.json` and copies none.
It fills the install region of the root README between `<!-- install:start -->` and `<!-- install:end -->`, with one section for each client.
It builds the four bundles from `src/`: the Claude Code hooks module, the omp extension, the OpenClaw entry `plugins/model-router-openclaw/index.js` and the Node program `plugins/model-router-hermes/route.mjs` that the Hermes shim starts.
Nobody edits a generated file by hand, and [CI](#ci-checks-the-copies-and-the-installation) fails when one differs from the builder's output.

The two clients need their own files, so one file could not serve both.
Claude Code stops loading a plugin whose `userConfig` option holds an unknown key ([Claude Code](clients.md#manifest)).
omp reads settings from a different block with a different schema, and it limits names to letters, digits, hyphens and dots ([omp manifest](clients.md#omp-manifest-and-settings), [omp catalogue](clients.md#omp-catalogue)).
The source keeps the shared facts once, and each renderer shapes them for one client.

Each plugin needs a bundle, because Claude Code loads a hooks module that imports nothing outside the plugin folder except `claude-code` ([Claude Code](clients.md#hooks-module)).
The builder inlines the TypeSafe SDK into every bundle, so each plugin runs on its own.

**The npm tree.**
OpenClaw and omp both install the npm package `@akurganow/model-router`, so one folder serves both: `packages/model-router/`.
The builder writes its `package.json` and `README.md` from the source.
It copies every other file byte for byte from a plugin folder: the licence, both bundles, the OpenClaw manifest and the skills.
Nobody edits the tree by hand, and the `check` job fails when it differs from the builder's output.
OpenClaw's skills sit in `openclaw-skills/`, apart from `skills/`, because omp reads `skills/` of any package it installs ([omp manifest and settings](clients.md#omp-manifest-and-settings)).
Each client then finds only the skills written for it ([OpenClaw package files](clients.md#openclaw-package-files)).
The one package carries one version for both clients.

Three alternatives lost.
Checking only the version, as `node scripts/set-version.ts --check` did before, left every other repeated fact to drift.
One command per kind of copy leaves a contributor to remember which command follows which edit.
A CI job that commits the copies back would put changes on `main` that no pull request showed.

## One version for every manifest

Claude Code gives users a new copy only when the plugin's version changes ([Claude Code](clients.md#install-and-update)).
omp upgrades only catalogue entries that declare a version ([omp install and update](clients.md#omp-install-and-update)).
A version moved by hand in one file leaves users of one client on an old copy.
So the source holds the version once.

`node scripts/set-version.ts X.Y.Z` writes the version into `metadata/source.json`.
The builder carries it to every manifest.
Both commands run as the two `pre_bump_hooks` in `cog.toml`, before `cog bump --auto` makes the version commit.
The version commit therefore holds the new version in every manifest and a bundle built from the released `src/`.
One release covers every plugin, so one version fits all.

`node scripts/set-version.ts --check` stays and checks the source and every manifest.
It catches a manifest changed by hand and a source bumped without a build.
`npm run check` runs it.

## CI checks the copies and the installation

CI runs these checks without a model.
The `check` job runs on Ubuntu and macOS.
The `install` job, the `package` job and the `hermes` job run on Ubuntu.
The `scan` job runs on every change.

**Regeneration.**
The `check` job reruns `node scripts/build.ts`.
It fails when `git status --porcelain` shows a changed or untracked file.
The failure message names `node scripts/build.ts`, the command that repairs it.
`git status --porcelain` also catches a generated file that was never committed.
Running on both systems means a copy that differs by system fails on one of them.

**Installation.**
The `install` job installs both plugins from the checkout, with the commands that `evals.yml` runs.
The job runs no build, because a user installs the committed files.
Claude Code runs `claude plugin marketplace add "$PWD"` and `claude plugin install model-router@model-router`.
omp runs `omp plugin marketplace add "$PWD"` and `omp plugin install model-router@model-router`.
Those commands install from the checkout with no account signed in.
The evals workflow keeps its secrets for the step that runs cases ([Claude Code](clients.md#install-and-update), [omp](clients.md#omp-install-and-update)).
Before the installs, the job runs `claude plugin validate --strict` on the plugin and on the Claude catalogue.
Both an unknown field and a missing catalogue description raise warnings, and `--strict` fails on warnings ([Claude Code](clients.md#catalogue), [validate](clients.md#validate-and-test)).
A validate run on the plugin applies none of the plugin directory's rules for hooks modules ([Claude Code](clients.md#validate-and-test)).
So validation alone does not show that a client finds the plugin through the catalogue.
The install does: omp reads `.omp-plugin/marketplace.json` before the Claude catalogue ([omp catalogue](clients.md#omp-catalogue)).

**Package.**
The npm tree is committed, so the `package` job packs it as it stands.
It compares the files in the tarball with the `files` list of the tree.
It runs `npm publish --dry-run`, which packs and checks the package and sends nothing.
The dry run passes without a registry login, so it does not show that the registry would accept a publish.
It then installs the tarball into a pinned OpenClaw, and checks the install report and that the installed bundle registers its hook, tool and commands against a recording `api`.
It unpacks the tarball and installs the folder into a pinned omp, because omp installs a registry name, a git spec or a folder, not a tarball.
Both harnesses keep their state and config under the runner's temp folder.
The OpenClaw pin tracks the latest release, so a Renovate rule raises it with no age delay ([CONTRIBUTING.md](../CONTRIBUTING.md#dependencies)).
The OpenClaw facts behind these steps are in [OpenClaw install and update](clients.md#openclaw-install-and-update) and [OpenClaw entry and registration](clients.md#openclaw-entry-and-registration).

**Deviation: no Gateway in the package job.**
The job calls the installed bundle's `register()` on a recording API in each of OpenClaw's six registration modes.
It does not start a Gateway.
No Gateway or model provider runs in CI.
`openclaw plugins inspect --runtime` loads the plugin in `tool-discovery` mode, where it registers only its config tool ([OpenClaw install and update](clients.md#openclaw-install-and-update)).
So the job shows that the bundle registers its hook, tool and commands in the modes that hold them, and nothing in the others.
It does not show that a running Gateway accepts them.

**Hermes.**
The `hermes` job runs on Ubuntu.
It installs the latest Hermes release at its tag and checks the commit the tag points at ([CONTRIBUTING.md](../CONTRIBUTING.md#dependencies)).
It runs the plugin's Python tests on Python 3.11 and 3.14, validates the plugin, installs it from the checkout and sets the backend ([Hermes CI](clients.md#hermes-ci)).
It then runs the tests again under Hermes's own interpreter, where one test compares the plugin's default route with Hermes's bundled default backend.
The plugin uses Hermes modules that Hermes does not publish for plugins, and the validate step warns about them ([Hermes install scan and validate](clients.md#hermes-install-scan-and-validate)).
So the job runs against the latest release, to catch a release that moves one.
No Hermes session or model provider runs in CI, and no key is set.

**Publication.**
The release workflow's `publish` job runs after a release, with npm trusted publishing and no stored token.
It publishes only while the `NPM_PUBLISH` variable is `true` and the registry lacks the version, so a rerun does nothing.
[Publishing to npm](../CONTRIBUTING.md#publishing-to-npm) has the conditions and the first publication by hand.

**Owner-setup scan.**
The repository is public.
The `scan` job checks the added lines of a pull request and every generated file for two markers.
One is an absolute home path, in the macOS, Linux or Windows form, also after `file://`.
The other is a key-shaped string with the `sk-` or `Bearer` prefix that the redaction in `src/brief.ts` masks.
The scan keeps these two of the redaction's shapes because the others, such as a password in a URL, also match the repository's own texts and tests.
Paths written from `~` pass.
The `Bearer` rule departs from the redaction on purpose.
The redaction masks any token after `Bearer`, in any case.
The scan also ignores case, but it needs a token of 16 or more characters with a digit.
Without that, the manifest's "the bearer token" and the masked form `Bearer ***` would fail it.
When a push names a base the clone lacks, the scan reads what HEAD adds over its merge base with `origin/main`.
When that merge base is HEAD itself, or `origin/main` is absent, it reads only the last commit, and its note says so.
Run locally without `--base`, the scan reads what the branch adds over its merge base with `origin/main`.
The builder rewrites generated files whole, so the scan reads each of them in full.

## What this repository does not take from pegboard

Pegboard releases each package on its own and keeps more tools around its builder.
This repository releases one version for every plugin, so three of its practices have no work to do here.

**Per-commit rebuild and commit-message checks.**
Pegboard runs its builder on each pull request commit that changes a package, and checks those commit messages.
Its release counts the commits and builds that touch a package's paths.
A build that lands in a later commit leaves the earlier commit with nothing to release.
Here `cog bump` rebuilds everything in the version commit, and one version covers every plugin.
No package's build can land in a later commit, so no per-commit run is needed.
The local `commit-msg` hook from `cog.toml` stays, and CI adds no message check ([CONTRIBUTING.md](../CONTRIBUTING.md#commits)).

**Icons rendered from SVG.**
Pegboard keeps an SVG source for each icon and renders the PNG on every build with one pinned renderer.
That needs a pinned version, a digest and an exclusion from the tree comparison.
Here only the Claude plugin has an icon, the committed file `plugins/model-router/.claude-plugin/icon.png`.
A render step for one file costs more than it saves.

**`jq` and `doctoc`.**
Pegboard fills its README regions and tables of contents with `jq` and `doctoc`, then runs a separate builder.
It splits them because its release job has `jq` and no Node.js.
Here the release job sets up Node.js, and `cog.toml` calls `node` in its hooks.
The Node builder fills the one README region.
The README has no generated table of contents, so `doctoc` has nothing to do.
One command, `node scripts/build.ts`, repairs every copy.
