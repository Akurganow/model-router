---
name: add-provider
description: Use when adding a provider that answers the scoring questions, or a new value of the `provider` setting. Not for a new harness, and not for a calibration of the existing questions alone.
---

# Add a scoring provider

A scoring provider is an endpoint that answers the questions `tier` and `work` for a task.
Both present providers speak System One, the wire format that `SYSTEM_ONE` holds.
Both serve Jev, the model the questions are fitted to.
[Repository layout](../../../CONTRIBUTING.md#repository-layout) says what each folder of `src/core/` holds.
[docs/providers.md](../../../docs/providers.md) says what the plugins do with a provider.

Follow the steps in order.
A new value of the `provider` setting alone starts at [Ask the maintainer once](#ask-the-maintainer-once).
It skips [The wire format](#the-wire-format), [The model behind the provider](#the-model-behind-the-provider) and each step about a name, a key or a company.
The type check and the tests name some of the places that change.
No check names the rest, and most of this skill lists them.
The change also follows [Build and check](../../../CONTRIBUTING.md#build-and-check), [Before you push](../../../AGENTS.md#before-you-push) and [Four harnesses, one behaviour](../../../AGENTS.md#four-harnesses-one-behaviour).
So every check runs again after the last edit.

## Check the provider's API first

This skill holds no fact about any provider's API.
Each such fact comes from the provider's documentation, or from a recorded request to its host.

1. Read the provider's documentation for the address, the key header, the request body and the reply.
2. Find whether one request answers both questions, with a probability for each of the three levels.
3. Find whether an answer comes within the 2 s that a first attempt gets.
4. Find the models the endpoint takes, whether it serves Jev, and the model name and token counts a reply gives.
5. Find which statuses and headers ask for a retry or a wait.
6. Find which statuses mean a failed key or a spent quota.
7. Find whether the provider accepts a task text that quotes an image reference, as [The request](../../../docs/providers.md#the-request) describes one.
8. Read the provider's privacy policy for what it keeps of a request.
9. Note the address of the page behind each fact, for the documents and the pull request text.
10. Search [Runs against the scoring hosts](https://github.com/Akurganow/model-router/wiki/Runs-scoring-hosts) on the wiki for a recorded request to that host.
11. Where neither the documentation nor a recorded request settles a fact, plan one request sent straight to the host.

The next four steps hold only for such a request.
Their links were written for a run of a harness, and such a request has no harness and no cap to state.
Its key comes from the variable the provider will have in `KEY_VARIABLES` in `src/core/providers/provider.ts`.
Choose that name now, as the present rows are named: no README names one yet.

12. Ask the maintainer before the request, with the host, the model and the question, as [Ask first](../live-run/SKILL.md#ask-first) says.
13. Send the request, and handle the key as [Keep keys secret](../live-run/SKILL.md#keep-keys-secret) says.
14. Record it as an entry of the kind `hosts`, by [Adding an entry](https://github.com/Akurganow/model-router/wiki#adding-an-entry) on the wiki's Home page.
15. Put the entry on the scoring hosts page, and push it as [Record the run](../live-run/SKILL.md#record-the-run) says.

The stop below holds with or without a request.

16. Stop and report to the maintainer when one request cannot give both answers and their probabilities within 2 s.

## Look up what the harnesses need

`findKey` in `src/adapters/omp/settings.ts` passes our provider name to omp's `getApiKeyForProvider`.
So the name must be the id that omp gives the provider.

17. Find that id in omp's source or documentation.
18. Find whether OpenClaw's list of credential variables holds the provider's usual key variable.
19. Find whether a provider of Hermes's own reads the provider's usual key variable. Search Hermes's source for the variable's name: its provider registry does not list every reader, as OpenRouter shows.
    [Hermes registration and settings](../../../docs/clients.md#hermes-registration-and-settings) says how Hermes stores a secret setting.
20. State the omp id, or that omp has none, as one plain sentence under [omp model roles](../../../docs/clients.md#omp-model-roles).
21. State what OpenClaw's list holds under [OpenClaw runtime, logs and environment](../../../docs/clients.md#openclaw-runtime-logs-and-environment), which says what OpenClaw does with a listed one.
22. State whether a provider of Hermes's own reads the provider's usual key variable, under [Hermes registration and settings](../../../docs/clients.md#hermes-registration-and-settings).
23. Put the source of each new sentence on the client's evidence page of the wiki, as [Adding evidence](https://github.com/Akurganow/model-router/wiki#adding-evidence) says.
24. Take the omp id as the name, or with no such id the provider's own name in lower case.
25. Choose the key's setting name, and its variable if not yet chosen, after `KEY_VARIABLES` and `KEY_FIELDS` in `src/core/providers/provider.ts`.
    That name serves Claude Code and OpenClaw. Hermes builds its own, `<provider>_api_key`.

The `provider` setting, the key lines and the routing line print the name as `PROVIDERS` spells it.

## Ask the maintainer once

No question below needs code first, and a late answer throws edits away.
With the provider in `auto`, the tests ask for every `auto` literal anew.

26. Send the maintainer one message with every question below that applies, and wait before the first edit of the code.

The questions:

- Which values of `provider` does the provider get: its own, and which orders with another provider? A provider runs only under a value whose order holds it.
- Does `auto` take the provider, and at which place?
- When that makes a fifth value: how does Claude Code offer it? The setting has four values, and [Hooks module](../../../docs/clients.md#hooks-module) states the limit of the dialog that `choose` in `src/adapters/claude/config.ts` opens.
- Does a status of a failed key or a spent quota reach the next provider? `FALLBACK_STATUSES` in `src/core/scoring/failure.ts` holds the statuses that do.
- Do the evals score through the new provider?
- For a model other than Jev: may the calibration run against it? [Paid runs](../../../CONTRIBUTING.md#paid-runs) exempts Jev calls only.
- When a value orders three providers: what does the routing line say after two failures? Today it names the first failed provider only, `firstFailed` in `src/core/scoring/route.ts`.

## The wire format

A provider that speaks System One reuses `SYSTEM_ONE` and adds no format.

The next six steps hold only for another API.

27. Add a file in `src/core/scoring/formats/` that exports a `Format`.
28. Write its unit test first, with literal bodies and replies, as `src/core/__tests__/unit/system-one.test.ts` does.
29. Write `body` and `read` as the comment on `Format` in `src/core/scoring/formats/format.ts` says.
30. Return `MALFORMED` from `read` for a reply it cannot read.
31. Map the API's question, answer and token shapes inside the format, and leave `Part` as it is.
32. Import only what [Repository layout](../../../CONTRIBUTING.md#repository-layout) allows `formats/`; Biome reports any other import.

`type: "score"` in `Part` is System One's wire literal, which another format translates.

`ask` in `src/core/scoring/ask.ts` sends every provider the headers that [The request](../../../docs/providers.md#the-request) lists.
No check reports a provider that needs another request.
The next four steps hold only for such a provider.

33. For another key header, a model in the URL or a wait the body names, add a field to `Endpoint`.
34. Read the field in `ask`, or in `src/core/scoring/transport/` when it changes a retry or a wait.
35. Change [The request](../../../docs/providers.md#the-request) when a header or the body changes for any provider.
36. Change [Retries and the second provider](../../../docs/providers.md#retries-and-the-second-provider) when a retry or a wait changes.

`FALLBACK_STATUSES` serves every provider.
The next step holds only when the maintainer sent a new status on to the next provider.

37. Add the status to `FALLBACK_STATUSES`, with its failing row first, and to the statuses in [Which provider gets a task](../../../docs/providers.md#which-provider-gets-a-task).

## Let the type check lead

`ORDER.auto` is `PROVIDERS` itself, so a provider joins `auto` at its place in that list.

38. Add the name to `PROVIDERS` in `src/core/providers/provider.ts`, at its place in `auto`, or last when `auto` leaves it out.
39. When `auto` leaves the provider out, write the `auto` row of `ORDER` out as a list without it.
40. Add each new value to `PROVIDER_VALUES` in the same file.

No test reads the URL of a row of `ENDPOINTS`, and a wrong one sends the key and the task text to another host.
So the provider's own rows fail first, as [Tests](../../../AGENTS.md#tests) asks.

41. Add a row that pins the new key to its own address, in `src/core/__tests__/integration/route.test.ts` and in `plugins/model-router/tests/keys.test.ts`.
42. Add the new key to the hand-written lists of `plugins/model-router-hermes/tests/test_sentinel.py`, which passes without it.
    A provider that `auto` leaves out gets its own run of that test under a value that allows it.
43. Run `npx tsc -p src` and `npx tsc -p scripts`.
44. Fill each place an error names, and run both again until both pass.

The errors name each place. They do not say this:

- In `keyVariable` in `src/adapters/claude/keys.ts`, the provider gets its own `$.env.get` call with the variable's name as a literal.
- The key field of `Options` in `src/adapters/claude/host.ts` shows only after that `switch` is filled.
- `LOOKED_UP` in `src/core/__tests__/unit/provider.test.ts` shows because `npx tsc -p src` reads the tests too.
- The row of `MODELS` takes the model name the endpoint takes.
- The row of `ENDPOINTS` takes the URL, the format and each field of the section before.
- A value gets its row of `ORDER` from the type check, and the rest from the tests.
- `FIXTURE` in `scripts/build-shape.test.ts` shows first under `scripts/`, for the Hermes setting `<provider>_api_key`. `scripts/build/hermes.ts` and the `Source` type build that name from `PROVIDERS`, so neither needs an edit.
- The Hermes hint goes under `hermes.settings` in `metadata/source.json` and into `metadata/source.schema.json` in the same edit as the row of `FIXTURE`. Without the hint the build stops in `scripts/build/hermes.ts` and names no setting.

## The model behind the provider

`main` in `scripts/calibrate.ts` takes two provider names and passes the name to `plan` as a value of the setting.
So a provider with no value of its own name gets no attempt, and every case reads `key unset`.

45. Let the guard of `main` take the new name, and name the provider and its URL in `USAGE`.
46. Unless the provider has a value of its own name, make `main` build the provider's attempt itself.
47. Change the command line under [Calibration](../../../CONTRIBUTING.md#calibration).

`fitWarnings` in `scripts/jev-fit.ts` drops the vendor prefix of a reply's model name, the text up to the last `/`.
It compares the rest with `FITTED_ON` as text.

48. When a reply names the fitted model in another form, tell the maintainer that the warning prints on every run.

The question texts and the factors of the pick rule in `src/core/parts/tier.ts` and `src/core/parts/work.ts` are fitted to Jev.
One set serves every provider, and a provider that serves Jev leaves it as it is.
The next two steps hold only for another model, and only after the maintainer agreed to the run.

49. Run the calibration of [Calibration](../../../CONTRIBUTING.md#calibration) against the new provider.
50. When the run misses the bar that section sets, stop and report to the maintainer.

## Let the tests lead

51. Run `node scripts/build.ts`, then `npm test`.
52. Run `python3 -m unittest discover -s plugins/model-router-hermes/tests` and `claude plugin test plugins/model-router`, which `npm test` leaves out.
53. Add what each failure names, rebuild, and run every suite again until all pass.

The failures name each place. They do not say this:

- The Claude Code and OpenClaw key's places come one after another: `metadata/source.json`, then `metadata/source.schema.json`, then the `Source` type in `scripts/build/source.ts`, then `FIXTURE` in `scripts/build-shape.test.ts`.
- In `metadata/source.json` the key is an option under `claude.userConfig.keys` and a hint under `openclaw.uiHints`.
- Most failing rows pin a literal, which stays a literal: write the new one out.
- `plugins/model-router-hermes/tests/test_config_tool.py` holds `SECRETS` and, beside it, the expected key lines, both written by hand.
- The option texts of omp, OpenClaw and Hermes leave the single-provider values out. Add such a value to `UNNAMED` in `scripts/build-texts.test.ts`, not to those texts.
- The build writes the bundles, the npm tree, the manifests and `plugins/model-router-hermes/constants.json`. The Hermes Python source needs no edit.
- Biome reports no place that lacks the provider. It checks the format, so run `npm run fix` after a hand edit.

The next step holds only when `auto` is written out without the provider.

54. In `src/adapters/claude/__tests__/unit/keys.test.ts`, read the key variables under values that together hold every provider, not under `auto` alone.

The next step holds only when the setting gets a fifth value.
Then only `claude plugin test` fails, at the dialog, and the adapter's unit test passes with its fake engine.

55. Offer the values in the Claude Code dialog as the maintainer answered.

## What nothing reports

Each place below keeps its old text while every check passes.

### The order of `auto`

The next two steps hold only when the order of `auto` changed.

56. Change the `auto` label in `consequences` in `src/core/options/settings.ts` to the new order.
57. Change the `auto` texts under `options.provider.descriptions` in `metadata/source.json` the same way, and rebuild.

### Three providers in one order

The next two steps hold only when a value orders three providers.
`plan` gives every attempt but the last 2 s and no retry.
So one task sends one request more, and the last attempt keeps 2 s less of the routing limit.

58. Rewrite the counts and the times in these sections of `docs/providers.md`:
    - [Which provider gets a task](../../../docs/providers.md#which-provider-gets-a-task);
    - [Retries and the second provider](../../../docs/providers.md#retries-and-the-second-provider);
    - [The routing limit and billing](../../../docs/providers.md#the-routing-limit-and-billing).
59. Build the wording the maintainer chose for two failures, from `firstFailed` on, and rewrite [The routing line](../../../docs/providers.md#the-routing-line) to it.

### omp

`NARROWABLE` and `narrow` in `src/adapters/omp/settings.ts` name the values as literals.
A project may only narrow the user's value: it adds no provider, swaps none and changes no order.
Both literals change with any new provider or value.

60. Add to `NARROWABLE` each new value that orders two or more providers.
61. Let `narrow` take a project's value only when the global order holds each of its providers, in the same order.
62. Change the sentence on omp's provider text in [One source for every copy](../../../docs/design.md#one-source-for-every-copy) when that text names other values.

### OpenClaw

63. Correct what `plugins/model-router-openclaw/PRIVACY.md` says a `.env` file can supply, by what you stated under [OpenClaw runtime, logs and environment](../../../docs/clients.md#openclaw-runtime-logs-and-environment).

### Hermes

Hermes stores each key's secret setting under the key's variable.
The next two steps hold only when a provider of Hermes's own reads that variable.

64. Say in the setting's help in `metadata/source.json` what a key saved there changes in Hermes itself, not only the variable, and rebuild.
65. Say the same under the table of [Keys](../../../plugins/model-router-hermes/README.md#keys) and in the keys list of `plugins/model-router-hermes/skills/model-router-setup/SKILL.md`.
    Correct "but one" in `plugins/model-router-hermes/PRIVACY.md`, which a second shared variable makes false.

### Claude Code

66. In [What this mod can reach](../../../plugins/model-router/README.md#what-this-mod-can-reach), add the variable and the provider to the rows of `$.env.get` and `$.http.fetch`.
67. Name the key and the provider in the answers on secrets and on usage above the table.
68. Run `claude plugin validate --strict plugins/model-router`, and compare the variables it prints with the row of `$.env.get`.

`node scripts/check-surface.ts` still passes: it compares engine calls, not variable names.

### Evals

No eval sets a `provider` value today, so each client asks the default, `typesafe`.
Claude Code keeps it under `pluginConfigs` in `settings.json`, as [Manifest](../../../docs/clients.md#manifest) says.
omp keeps it in its lockfile, as [omp manifest and settings](../../../docs/clients.md#omp-manifest-and-settings) says, and a project may only narrow it.
`MODEL_SEGMENT` in `scripts/evals/stream.ts` reads the decision line: it accepts any name of `PROVIDERS` and keeps only the model.
So a case passes whichever provider answered.

The next four steps hold only when the evals score through the new provider.

69. Pass its key in `clientEnv` in `scripts/evals/scrub.ts`, and require it in `missingKeys` in `scripts/evals/run.ts`.
70. Name its secret in `.github/workflows/evals.yml`.
71. In each client's job of that workflow, set the `provider` value in the client's own store after the plugin's install.
72. Make the eval read the provider from the decision line, and fail a case that another provider answered.

### Key shapes

`scripts/scan-owner-setup.ts` knows some key shapes, and so does the masking in `src/core/brief/brief.ts`.
[The task text](../../../docs/providers.md#the-task-text) lists the shapes of the masking and changes with it.

73. Check that both know the shape of the new provider's keys, and add a missing shape to each.

## The texts that name the provider

No test reads these texts for a provider's name.
A new provider is a new company that receives the task text.
Each search below reads every Markdown file and `metadata/source.json`.

74. Run `git grep -n -i -E 'typesafe|openrouter' -- '*.md' metadata/source.json ':!CHANGELOG.md' ':!packages'`, and read each hit.
75. In each of the four `PRIVACY.md` under `plugins/`, name the company, its host and its privacy policy.
76. In each of the four READMEs under `plugins/`, add the key, its variable and the provider's values.
77. Name the key's setting in each README whose harness has one; the others say where the key comes from.
78. In the root `README.md`, change the set-up steps and "What leaves the machine".
79. In each of the four `model-router-setup/SKILL.md` under `plugins/`, add the key and the values.
80. In `docs/providers.md`, change these sections:
    - [Keys](../../../docs/providers.md#keys);
    - [What the providers do with it](../../../docs/providers.md#what-the-providers-do-with-it);
    - [Your choices](../../../docs/providers.md#your-choices);
    - the names and the examples of [The routing line](../../../docs/providers.md#the-routing-line);
    - the sentence of [The request](../../../docs/providers.md#the-request) on who accepts an image reference.
81. Change the plugin descriptions in `metadata/source.json` that name the hosts.

A line that counts providers, keys or variables names none of them, so the first search misses it.

82. Run `git grep -n -i -w -E 'both|either|two|second|other provider|four' -- '*.md' metadata/source.json ':!CHANGELOG.md' ':!packages'`, and correct each hit the change makes false.

The next step holds only for a model other than Jev.

83. Run `git grep -n 'Jev' -- '*.md' metadata/source.json src/adapters/hermes/texts.ts ':!CHANGELOG.md' ':!packages'`, and correct each hit the new model makes false.

The rebuild holds for every change.

84. Rebuild with `node scripts/build.ts`, because this section changed `metadata/source.json`.

## Before the pull request

85. For each file the change touched, name the check or the step of this skill that led you there.
86. Key by `Provider` each place neither led to, or add it to this skill in the same pull request.
87. Name the commit and the pull request `feat`, as [Commits and pull requests](../../../AGENTS.md#commits-and-pull-requests) says.
88. Cite the page behind each API fact in the pull request text.
89. List each harness whose path of the new key no test and no section of `docs/clients.md` proves.
90. Ask the maintainer for a live run of each, with its question, as [the live-run skill](../live-run/SKILL.md) says.
