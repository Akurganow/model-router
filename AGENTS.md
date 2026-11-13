# Rules for agents

These rules bind every coding agent that works in this repository.
`CLAUDE.md` is a symbolic link to this file, so both names give one text.

[CONTRIBUTING.md](CONTRIBUTING.md) holds the rules for every contributor.
This file adds what an agent gets wrong without being told. Where
CONTRIBUTING.md already states a rule, this file links to it.

## Read first

- [CONTRIBUTING.md](CONTRIBUTING.md): the layout, the build, the checks and
  the commits.
- [docs/design.md](docs/design.md): why the build and CI are shaped as they
  are.
- [docs/clients.md](docs/clients.md): the cited facts about each harness.
- The README of each plugin you change.

## What the plugins do and never do

- They route subagents only. They never change the model of the main session.
- They never override a model or an effort the user set.
- They track no spend and no cost budget.
- The routing code is TypeScript in `src/`. The Python of the Hermes plugin
  is a shim, as [Repository layout](CONTRIBUTING.md#repository-layout) says.
  Put no routing logic into it.
- The effort ladder is one table in the core.
  [model-choice.md](plugins/model-router/docs/model-choice.md) explains it.
  Add no effort rule for one harness alone.

## Four harnesses, one behaviour

- The Claude Code, omp, OpenClaw and Hermes plugins behave the same: options,
  defaults, wording and setup steps.
- When you change one adapter, check the other three. Change them in the same
  pull request, or say in its text why one differs.
- Shared logic lives once.
  [Repository layout](CONTRIBUTING.md#repository-layout) says where.
- A claim about a harness needs a source: a permalink at a pinned commit, or
  a run recorded in [docs/clients.md](docs/clients.md).

## A rule about the source goes to Biome first

- A rule about what the source text may hold is a lint rule, not a test:
  which file imports what, which call takes a literal, which form a statement
  may take.
- Build it as [Repository layout](CONTRIBUTING.md#repository-layout)
  describes: `overrides` in `biome.json`, or a GritQL plugin in
  `scripts/lint/`, and a planted fault in `scripts/lint.test.ts`. A pattern
  that matches nothing would otherwise switch the rule off unseen.
- Write a test for such a rule only when Biome cannot hold it cheaply:
  - the rule needs a value the code computes, as the reason scan in
    `src/core/reasons.test.ts` does;
  - the rule counts across files;
  - Biome does not read the file: a generated bundle, a manifest, a workflow.
- Behaviour stays with tests: what the code returns, prints or sends.

## Tests

- Write the failing test first.
- An expected value is a literal. Never build it with the function under
  test.
- Each call site of a shared predicate keeps its own edge rows: a blank
  string, a string of spaces and `null`. A table in the predicate's own test
  does not prove that a caller calls it.
- Before you delete a test as a repeat, name the test that still holds its
  fact, and check that a wrong implementation still fails.

## Generated files

- Follow [Generated files](CONTRIBUTING.md#generated-files).
- Follow [No package.json in the Claude Code plugin][no-package-json].

## Before you push

- Run every command of [Build and check](CONTRIBUTING.md#build-and-check),
  the Hermes Python tests too when you touched that plugin.
- Run `node scripts/scan-owner-setup.ts` and `cog check --from-latest-tag`.

## Commits and pull requests

- [Commits](CONTRIBUTING.md#commits) states the format.
- A change that a plugin user can see is `fix` or `feat`, in the commit and in
  the pull request title. `build`, `ci`, `chore`, `docs`, `refactor` and
  `test` release nothing. Never put a user-visible change under them.
- Never force-push. Never amend a pushed commit. Take a newer `main` with a
  merge commit, then rebuild.
- Keep a pull request at 100 reviewable files or fewer, counted after the
  filters of `.coderabbit.yaml`. Split a larger change into pull requests.
  Never drop a part of the change to fit.
- The pull request text says what changed, why, and the verification
  commands with their results. It holds no session history.

## Nothing about anyone's own setup

- No file, comment, test, commit, pull request, issue or review comment holds
  a fact about the setup of the maintainer or of your own run: a key, an
  account, which key or account ran something, a budget, an employer, the
  state of a machine, a local path, an installed tool.
- Describe work by what was done and measured: models, samples, dates, the
  shape of a request, commands and their output.
- [Continuous integration](CONTRIBUTING.md#continuous-integration) says what
  the scan reads and where CI runs it.

## Live runs

- [Paid runs](CONTRIBUTING.md#paid-runs) says when a run that calls a paid
  model is worth it. Ask the maintainer before one.
- Run a harness against a copy of its configuration folder. Never change a
  user's settings, auto-update choice or installed plugin versions, and never
  restore a settings file whole.
- Never start an interactive harness session from an agent session.

## Writing

- One copy of each text. Every other place links to it.
- Tracked files, commits and pull request text are in English.
- A code comment explains a why that the code does not show.

[no-package-json]: CONTRIBUTING.md#no-packagejson-in-the-claude-code-plugin
