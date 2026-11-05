# About this repository's design

This page explains why the repository is built the way it is.
The client facts behind each reason are in [How each client loads a package](clients.md), with their sources.
Every other fact here names its kind: a file or a run of this repository's CI, or documentation read on 2026-11-05.
The build follows the one-source principle of the public repository [Akurganow/pegboard](https://github.com/Akurganow/pegboard).

## One source for every copy

The two clients read the same facts from different files.
Claude Code reads `.claude-plugin/plugin.json` and the catalogue `.claude-plugin/marketplace.json` ([Claude Code](clients.md#manifest), [catalogue](clients.md#catalogue)).
omp reads the `omp` block of `package.json` and the catalogue `.omp-plugin/marketplace.json`, with `.claude-plugin/marketplace.json` as a fallback ([omp manifest](clients.md#omp-manifest-and-settings), [omp catalogue](clients.md#omp-catalogue)).
So the plugin has four JSON files, and each repeats the name, the licence, the links and a description.
Anthropic's directory reads the privacy policy URL from `plugin.json` only, and omp's catalogue entry carries its own copy ([Claude Code](clients.md#manifest)).
The version sits in three of the four files, because omp upgrades only entries that declare one ([omp install and update](clients.md#omp-install-and-update)).

A copy kept by hand drifts from its source, and nothing notices until a user does.
So `metadata/source.json` is the only hand-written source of the facts the four files repeat.
`metadata/source.schema.json` checks its shape.
The source holds no value list.
The value lists in the manifests come from `src/`, so a manifest cannot offer a value the code does not know.
The option texts are prose, so a test holds them to `src/` instead.
Each names every provider or scope value, except omp's provider text, which names `auto` and `openrouter-first` only.
Each character limit in the source states the number `src/brief.ts` enforces.

`scripts/build.ts` reads the source, and the renderers in `scripts/build/` write each copy.
It writes the Claude manifest, both catalogues and the omp `package.json`.
It fills the install region of the root README between `<!-- install:start -->` and `<!-- install:end -->`.
It builds both bundles from `src/`.
Nobody edits a generated file by hand, and [CI](#ci-checks-the-copies-and-the-installation) fails when one differs from the builder's output.

The two clients need their own files, so one file could not serve both.
Claude Code stops loading a plugin whose `userConfig` option holds an unknown key ([Claude Code](clients.md#manifest)).
omp reads settings from a different block with a different schema, and it limits names to letters, digits, hyphens and dots ([omp manifest](clients.md#omp-manifest-and-settings), [omp catalogue](clients.md#omp-catalogue)).
The source keeps the shared facts once, and each renderer shapes them for one client.

Each plugin needs a bundle, because Claude Code loads a hooks module that imports nothing outside the plugin folder except `claude-code` ([Claude Code](clients.md#hooks-module)).
The builder inlines the TypeSafe SDK into both bundles, so each plugin runs on its own.

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
One release covers both plugins, so one version fits both.

`node scripts/set-version.ts --check` stays and checks the source and every manifest.
It catches a manifest changed by hand and a source bumped without a build.
`npm run check` runs it.

## CI checks the copies and the installation

CI runs these checks without a model.
The `check` job runs on Ubuntu and macOS.
The `install` job runs on Ubuntu.
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

**Owner-setup scan.**
The repository is public.
The `scan` job checks the added lines of a pull request and every generated file for two markers.
One is an absolute home path, in the macOS, Linux or Windows form, also after `file://`.
The other is a key-shaped string with the `sk-` or `Bearer` prefix that the redaction in `src/brief.ts` masks.
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
