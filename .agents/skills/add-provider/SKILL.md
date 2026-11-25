---
name: add-provider
description: Use when adding a provider that answers the scoring questions, which is a new value of the `provider` setting, or when a provider releases a model that OpenRouter serves. Not for a new gateway, not for a new harness, and not for a calibration of the existing questions alone.
---

# Add a scoring provider

A scoring provider is a maker: a company whose model answers the questions `tier` and `work` for a task.
The `provider` setting names the maker, and the `gateway` setting says whether OpenRouter is used.
Every maker has both paths, its own API and OpenRouter.
Its module in `src/core/scoring/makers/` holds one endpoint for each path.
Each endpoint names the wire format that it speaks and the model it takes.
`src/core/scoring/formats/` holds the formats.
Jev is the model the questions are fitted to, and only some paths serve it.
[Repository layout](../../../CONTRIBUTING.md#repository-layout) says what each folder of `src/core/` holds.
[docs/providers.md](../../../docs/providers.md) says what the plugins do with a provider.

Follow the steps in order.
The type check and the tests name some of the places that change.
No check names the rest, and most of this skill lists them.
The change also follows [Build and check](../../../CONTRIBUTING.md#build-and-check), [Before you push](../../../AGENTS.md#before-you-push) and [Four harnesses, one behaviour](../../../AGENTS.md#four-harnesses-one-behaviour).
So every check runs again after the last edit.

## Check the provider's API first

This skill holds no fact about any provider's API.
Each such fact comes from the provider's documentation, or from a recorded request to its host.

1. Read the provider's documentation for the address, the key header, the request body and the reply.
2. Find whether one request answers both questions, with a probability for each of the three levels.
3. Find whether an answer comes within the 5 s that a first attempt gets.
4. Find the models the endpoint takes, whether it serves Jev, and the model name and token counts a reply gives.
5. Find whether OpenRouter serves the model, and its address and model name there.
6. Find which statuses and headers ask for a retry or a wait.
7. Find which statuses mean a failed key or a spent quota.
8. Find whether the provider accepts a task text that quotes an image reference, as [The request](../../../docs/providers.md#the-request) describes one.
9. Read the provider's privacy policy for what it keeps of a request.
10. Note the address of the page behind each fact, for the documents and the pull request text.
11. Search [Runs against the scoring hosts](https://github.com/Akurganow/model-router/wiki/Runs-scoring-hosts) on the wiki for a recorded request to that host.
12. Where neither the documentation nor a recorded request settles a fact, plan one request sent straight to the host.

The next four steps hold only for such a request.
Their links were written for a run of a harness, and such a request has no harness and no cap to state.
Its key comes from the variable the provider will have in `KEY_VARIABLES` in `src/core/providers/provider.ts`.
Choose that name now, as the present variables are named: no README names one yet.

13. Ask the maintainer before the request, with the host, the model and the question, as [Ask first](../live-run/SKILL.md#ask-first) says.
14. Send the request, and handle the key as [Keep keys secret](../live-run/SKILL.md#keep-keys-secret) says.
15. Record it as an entry of the kind `hosts`, by [Adding an entry](https://github.com/Akurganow/model-router/wiki#adding-an-entry) on the wiki's Home page.
16. Put the entry on the scoring hosts page, and push it as [Record the run](../live-run/SKILL.md#record-the-run) says.

The stop below holds with or without a request.

17. Stop and report to the maintainer when one request cannot give both answers and their probabilities within 5 s.

## Look up what the harnesses need

`findKey` in `src/adapters/omp/settings.ts` passes each key holder's name to omp's `getApiKeyForProvider`.
So the maker's name must be the id that omp gives the provider.

18. Find that id in omp's source or documentation.
19. Find whether OpenClaw's list of credential variables holds the provider's usual key variable.
20. Find whether a provider of Hermes's own reads the provider's usual key variable. Search Hermes's source for the variable's name: its provider registry does not list every reader, as OpenRouter shows.
    [Hermes registration and settings](../../../docs/clients.md#hermes-registration-and-settings) says how Hermes stores a secret setting.
21. State the omp id, or that omp has none, as one plain sentence under [omp model roles](../../../docs/clients.md#omp-model-roles).
22. State what OpenClaw's list holds under [OpenClaw runtime, logs and environment](../../../docs/clients.md#openclaw-runtime-logs-and-environment), which says what OpenClaw does with a listed one.
23. State whether a provider of Hermes's own reads the provider's usual key variable, under [Hermes registration and settings](../../../docs/clients.md#hermes-registration-and-settings).
24. Put the source of each new sentence on the client's evidence page of the wiki, as [Adding evidence](https://github.com/Akurganow/model-router/wiki#adding-evidence) says.
25. Take the omp id as the name, or with no such id the provider's own name in lower case.
26. Choose the key's setting name, and its variable if not yet chosen, after `KEY_VARIABLES` and `KEY_FIELDS` in `src/core/providers/provider.ts`.
    That name serves Claude Code, OpenClaw and Hermes.

The value of `provider` is the name in `MAKERS`. The key lines and the routing line print the key holder's name as `KEY_HOLDERS` spells it.

## Ask the maintainer once

A provider with a model of its own is a maker.
`steps` in `src/core/providers/provider.ts` asks the maker of the choice on each path of its gateway.
So a maker gets its attempts once `MAKERS` holds it and a user sets `provider` to it.

A second gateway, a provider with a key and no model of its own, and a maker that OpenRouter does not serve have no step in this skill: stop and report each.

No question below needs code first, and a late answer throws edits away.

27. Send the maintainer one message with every question below that applies, and wait before the first edit of the code.

The questions:

- Is the provider a value of `provider`, and at which place of `MAKERS`? The first value is the default.
- What label does the value take? `consequences` under `provider` in `TEXTS` in `src/core/options/settings.ts` holds it.
- When `MAKERS` gets a fifth maker: how does Claude Code offer it? [Hooks module](../../../docs/clients.md#hooks-module) states the limit of the dialog that `choose` in `src/adapters/claude/config.ts` opens.
- Does a status of a failed key or a spent quota reach the next attempt? `FALLBACK_STATUSES` in `src/core/scoring/failure.ts` holds the statuses that do.
- Do the evals score through the new provider?
- Does the calibration run against the new maker? `MAKER` in `scripts/calibrate.ts` names the one maker it asks, so a run means changing it. [Paid runs](../../../CONTRIBUTING.md#paid-runs) exempts Jev calls only.

## The wire format

A provider whose endpoint speaks a format that `src/core/scoring/formats/` holds reuses it and adds no format.
An `Endpoint` names the format of its path, so the two paths of a maker can differ.

The next six steps hold only for another API.

28. Add a file in `src/core/scoring/formats/` that exports a `Format`.
29. Write its unit test first, with literal bodies, as `src/core/__tests__/unit/system-one.test.ts` does. Record a reply of the endpoint as a constant in `src/core/__tests__/support/replies.ts`, and read it in the test.
30. Write `body` and `read` as the comment on `Format` in `src/core/scoring/formats/format.ts` says, and build `read` with `replyReader` from `shared.ts`.
31. Return `MALFORMED` from `read` for a reply it cannot read.
32. Map the API's question, answer and token shapes inside the format, and leave `Part` as it is. A reply shaped like the map of `mapAnswer` needs only the names of its token counts.
33. Import only what [Repository layout](../../../CONTRIBUTING.md#repository-layout) allows `formats/`; Biome reports any other import.

`type: "score"` in `Part` is System One's wire literal, which another format translates.

Every provider takes the next seven steps.

34. Create `src/core/scoring/makers/<maker>.ts` in the form of `openai.ts`, and export one `MakerModule` constant named after the maker.
35. Give it an `Endpoint` for `direct` and `openrouter`, each with `url`, `format`, `model` and `keyHeader`.
36. Give `MODULES` in `src/core/scoring/maker-registry.ts` its entry. The type check fails on it until `MAKERS` holds the name.
37. Set `vendor` to the company that OpenRouter names in the slugs of this maker.
38. Set `openrouterRoute` to `system-one` when OpenRouter's route takes a bare name, and to `decisions` when it takes `vendor/name`.
39. Fill `openrouterNames` with each model name that the provider's API takes, and the slug OpenRouter gives it in its catalog.
40. Check that the vendor test in `src/core/__tests__/unit/registry.test.ts` covers the new module. It loops over `MAKERS`, so a module with a wrong prefix fails it.

[The import and branching rules of `scoring/`](../../../CONTRIBUTING.md#repository-layout) bind the module.

`ask` in `src/core/scoring/ask.ts` sends every provider the headers that [The request](../../../docs/providers.md#the-request) lists.
It puts the key in the header that the endpoint's `keyHeader` names, with its prefix.
No check reports a provider that needs another request.

41. For a key header other than `BEARER`, put its constant into the new module, as `GOOGLE_KEY` is in `google.ts`. Move it to `src/core/scoring/maker-module.ts` once a second module needs it.

The next four steps hold only for another request than the one `ask` builds.

42. For a model in the URL or a wait the body names, add a field to `Endpoint` in `src/core/scoring/maker-module.ts`.
43. Read the field in `ask`, or in `src/core/scoring/transport/` when it changes a retry or a wait.
44. Change [The request](../../../docs/providers.md#the-request) when a header or the body changes for any provider.
45. Change [Retries and the second attempt](../../../docs/providers.md#retries-and-the-second-attempt) when a retry or a wait changes.

`FALLBACK_STATUSES` serves every provider.
The next step holds only when the maintainer sent a new status on to the next attempt.

46. Add the status to `FALLBACK_STATUSES`, with its failing row first, and to the statuses in [The provider and the gateway](../../../docs/providers.md#the-provider-and-the-gateway).

## Let the type check lead

`KEY_HOLDERS` follows `MAKERS`, so one new name there starts the type errors.

47. Add the name to `MAKERS` in `src/core/providers/provider.ts`.

The route test pins the address of a path only once its `ADDRESSES` row exists, and a wrong address sends the key and the task text to another host.
So the provider's own address rows come first, as [Tests](../../../AGENTS.md#tests) asks.

48. Give `ADDRESSES` in `src/core/__tests__/integration/route.test.ts` a row for each new path of the module. A row holds the address, the model name sent, the key header as a name and value pair, a reply in the endpoint's own format, and the model and token counts the decision then holds. Formats that read a map-shaped reply can differ only in the names of the token counts, so the row holds the reply and the counts.
49. Add a test with a URL constant like `TYPESAFE_URL` in `plugins/model-router/tests/keys.test.ts`, one for each new address. A reply that the harness's default System One map does not satisfy needs a `text` of its own, as `OPENAI_ANSWER` is.
50. For a key header other than `Authorization`, add its name to the headers of `Request` in `plugins/model-router/tests/harness.ts`, which now lists `Authorization` and `x-goog-api-key`, and read it through `h.request.init?.headers`. `h.auth` holds `Authorization` only.
51. Add the new key to `SECRETS` and to the tuple of sentinels in `plugins/model-router-hermes/tests/test_sentinel.py`, which passes without it.
    Add it to the expected keys of a case only when the `provider` and `gateway` that case stores ask it.
52. Run `npx tsc -p src` and `npx tsc -p scripts`.
53. Fill each place an error names, and run both again until both pass.

The errors name each place. They do not say this:

- In `keyVariable` in `src/adapters/claude/keys.ts`, the provider gets its own `$.env.get` call with the variable's name as a literal.
- `Options` in `src/adapters/claude/host.ts` derives its key members from `KEY_FIELDS`, so it needs no edit.
- `LOOKED_UP` in `src/core/__tests__/unit/provider.test.ts` shows because `npx tsc -p src` reads the tests too.
- The error at `consequences` under `provider` in `TEXTS` in `src/core/options/settings.ts` asks for the value's label: the text that follows the value's name wherever a harness lists the values.
- `scripts/calibrate.ts` shows nothing and gains no row. It asks one maker by design, and [The model behind the provider](#the-model-behind-the-provider) says when that changes.
- `FIXTURE` in `scripts/build-shape.test.ts` shows first under `scripts/`: its `keys` record takes a row for the key holder.
  `scripts/build/` maps a key holder to its setting through `KEY_FIELDS` for all three harnesses, so no builder and no type needs an edit.

## The model behind the provider

The calibration asks one maker.
`MAKER` in `scripts/calibrate.ts` names it, and the script derives from it the two key holders it takes: the maker's own and `openrouter`.
The question texts and the factors of the pick rule in `src/core/parts/tier.ts` and `src/core/parts/work.ts` are fitted to the answers of that maker.
One set serves every provider, so a new provider adds no row to the script and changes neither `MAKER` nor the factors, unless a run against the new maker is agreed.
The three steps below then change `MAKER` and nothing else.

`fitWarnings` in `scripts/jev-fit.ts` drops the vendor prefix of a reply's model name, the text up to the last `/`.
It compares the rest with `FITTED_ON` as text.

54. When a reply of a provider that serves Jev names the fitted model in another form, tell the maintainer that the warning prints on every run.

The next three steps hold only for a run against the new maker, and only after the maintainer agreed to it.

55. Change `MAKER` in `scripts/calibrate.ts` to the new maker, and read the key holders of its usage text.
56. Change the command line under [Calibration](../../../CONTRIBUTING.md#calibration) to those key holders, and run the calibration it describes.
57. When the run misses the bar that section sets, stop and report to the maintainer.

## Let the tests lead

58. Run `node scripts/build.ts`, then `npm test`.
59. Run `python3 -m unittest discover -s plugins/model-router-hermes/tests` and `claude plugin test plugins/model-router`, which `npm test` leaves out.
60. Add what each failure names, rebuild, and run every suite again until all pass.

The failures name each place. They do not say this:

- The key's title and text are one record in `metadata/source.json`, `keys.<holder>`, and Claude Code, OpenClaw and Hermes all show it.
  `loadSource` in `scripts/build/source.ts` runs `keyHolderProblems` after the schema, and the build stops with the holder that is missing or extra.
  The schema and the `Source` type need no edit.
- Most failing rows pin a literal, which stays a literal: write the new one out.
  Among them are the `use one of` and label texts in `src/core/__tests__/unit/settings.test.ts`, `HINTS` in `src/adapters/claude/__tests__/integration/manifest.test.ts` and the dialog test in `plugins/model-router/tests/config.test.ts`.
- `plugins/model-router-hermes/tests/test_config_tool.py` holds `SECRETS` and, beside it, the expected key lines, both written by hand.
- `scripts/build-texts.test.ts` fails until `options.provider.description` in `metadata/source.json` and the `models` text name the value as a whole word, in every harness that shows them.
- `plugins/model-router-hermes/tests/test_defaults_and_gates.py` holds the key holders of each gateway value as a table, written by hand.
- The build writes the bundles, the npm tree, the manifests and `plugins/model-router-hermes/constants.json`. The Hermes Python source needs no edit.
- A new maker reaches the choices of `provider` in `plugins/model-router-hermes/plugin.yaml`, and the `settings` and `choices` of `constants.json`. `scripts/build/hermes.ts` needs no edit.
- The literal tables of `constants.json` and `plugin.yaml` in `scripts/build-hermes.test.ts` fail until you write the new value out in each list of makers. Its `choices` literal keeps the openai block only, so the new maker needs no block.
- `src/adapters/claude/__tests__/unit/keys.test.ts` loops over `MAKERS` and fails until `keyVariable` reads the new variable.
- Hermes asks a new maker like the other three harnesses, once a user stores it as `provider`.
- Biome reports no place that lacks the provider. It checks the format, so run `npm run fix` after a hand edit.
- A test that stands in for a value that is not valid with a company's name breaks when that company becomes a maker, as `src/adapters/omp/__tests__/unit/settings.test.ts` did with `"openai"`. Pick a stand-in that no maker will take.

Each test below holds a rule that every maker shares in one row, so a new maker adds no row to it:

- `src/core/__tests__/unit/provider.test.ts` holds that the maker's own key is the first holder of its direct path, in one `plan` row and one `collectKeysSync` row of openai.
- `src/core/__tests__/integration/decide.test.ts` holds one row for each line shape: openai direct, openai through OpenRouter and google direct. A shape no row holds, such as a reply with no model name, adds one.
- `src/core/__tests__/unit/settings.test.ts` holds one `settingsReport` row of openai, which `docs/providers.md` quotes.
- The edge rows of a blank key, spaces and `null` stay with the typesafe rows of each harness's key test.

61. Add `plugins/model-router-hermes/tests/fixtures/<provider>-direct.json` only when the provider's request differs in shape from `google-direct.json`.

`google-direct.json` is the one fixture of a maker other than typesafe.
Its replay in `src/adapters/hermes/__tests__/integration/index.test.ts` shows that `provider` passes through.

The next step holds only when a setting gets a fifth value.
Then only `claude plugin test` fails, at the dialog, and the adapter's unit test passes with its fake engine.

62. Offer the values in the Claude Code dialog as the maintainer answered.

## What nothing reports

Each place below keeps its old text while every check passes.

### OpenClaw

63. Correct what `plugins/model-router-openclaw/PRIVACY.md` says a `.env` file can supply, by what you stated under [OpenClaw runtime, logs and environment](../../../docs/clients.md#openclaw-runtime-logs-and-environment).

### Hermes

Hermes stores each key's secret setting under the key's variable.
The next three steps hold only when a provider of Hermes's own reads that variable.

64. State the full effect once, under the table of [Keys](../../../plugins/model-router-hermes/README.md#keys) in the Hermes README.
65. In `plugins/model-router-hermes/PRIVACY.md`, say in one sentence what a key saved in the form changes in Hermes itself, and link that Keys section.
66. In the keys list of `plugins/model-router-hermes/skills/model-router-setup/SKILL.md`, say the same one sentence and link that Keys section.

### Claude Code

67. In [What this mod can reach](../../../plugins/model-router/README.md#what-this-mod-can-reach), add the variable and the provider to the rows of `$.env.get` and `$.http.fetch`.
68. Name the key and the provider in the answers on secrets and on usage above the table.
69. Run `claude plugin validate --strict plugins/model-router`, and compare the variables it prints with the row of `$.env.get`.

`node scripts/check-surface.ts` still passes: it compares engine calls, not variable names.

### Evals

No eval sets `provider` or `gateway` today, so each client asks the default maker, `typesafe`, on its own API.
Claude Code keeps it under `pluginConfigs` in `settings.json`, as [Manifest](../../../docs/clients.md#manifest) says.
omp keeps it in its lockfile, as [omp manifest and settings](../../../docs/clients.md#omp-manifest-and-settings) says, and a project never changes it.
`MODEL_SEGMENT` in `scripts/evals/stream.ts` reads the decision line: it accepts any name of `KEY_HOLDERS` and keeps only the model.
So a case passes whichever key holder answered.

The next four steps hold only when the evals score through the new provider.

70. Pass its key in `clientEnv` in `scripts/evals/scrub.ts`, and require it in `missingKeys` in `scripts/evals/run.ts`.
71. Name its secret in `.github/workflows/evals.yml`.
72. In each client's job of that workflow, set `provider` to the new maker in the client's own store after the plugin's install.
73. Make the eval read the key holder from the decision line, and fail a case that another key holder answered.

### Key shapes

`scripts/scan-owner-setup.ts` knows some key shapes, and so does the masking in `src/core/brief/brief.ts`.
[The task text](../../../docs/providers.md#the-task-text) lists the shapes of the masking and changes with it.

74. Check that both know the shape of the new provider's keys, and add a missing shape to each.

## The texts that name the provider

No test reads these texts for a provider's name.
A new provider is a new company that receives the task text.
Each search below reads every Markdown file, `metadata/source.json` and `scripts/build/npm.ts`.

75. Run `git grep -n -i -E 'typesafe|openrouter' -- '*.md' metadata/source.json scripts/build/npm.ts ':!CHANGELOG.md' ':!packages'`, and read each hit. Each hit that lists the makers, their keys, their variables or their hosts takes the new one, whether or not a step below names its file.
76. In the company table of each of the four `PRIVACY.md` under `plugins/`, name the company, its host and its privacy policy.
77. In each of the four READMEs under `plugins/`, add the key and its variable.
78. In the same READMEs, add the new value to the usage of the `provider` command. Add no label: the table in `docs/providers.md` holds it.
79. Name the key's setting in each README whose harness has one; the others say where the key comes from.
80. In the root `README.md`, change the first screen and "What leaves the machine". In the Claude Code and omp guides, change the steps under "Set up".
81. In the list of values of `provider` in each of the four `model-router-setup/SKILL.md` under `plugins/`, add the key, the new value and its label.
82. In `docs/providers.md`, change these sections:
    - the table of [The provider and the gateway](../../../docs/providers.md#the-provider-and-the-gateway), which holds each value's label;
    - [Keys](../../../docs/providers.md#keys);
    - [What each company does with the text](../../../docs/providers.md#what-each-company-does-with-the-text);
    - [Your choices](../../../docs/providers.md#your-choices);
    - the names and the examples of [The routing line](../../../docs/providers.md#the-routing-line);
    - the table of [The request](../../../docs/providers.md#the-request), with a row for each path, and its sentences on the key header and on who accepts an image reference;
    - the example of [The report lines](../../../docs/providers.md#the-report-lines), which holds a line for each provider.
83. Change the plugin descriptions under `descriptions` in `metadata/source.json`: they name the hosts of the providers' own APIs. In `scripts/build/npm.ts`, change the lead of the npm README: it names every provider.
84. Write the key's text in `keys.<holder>` of `metadata/source.json` in the one shape of every holder: "Sent to <company> only, when provider is <maker> and gateway is not openrouter."

A line that counts providers, keys or variables names none of them, so the first search misses it.

85. Run `git grep -n -i -w -E 'both|either|two|three|second|other provider|four' -- '*.md' metadata/source.json scripts/build/npm.ts ':!CHANGELOG.md' ':!packages'`, and correct each hit the change makes false.

A text says Jev only where it means Jev itself: the `typesafe` label, the calibration, the evals and the fit. Elsewhere it says "the scoring model".

86. Run `git grep -n 'Jev' -- '*.md' metadata/source.json scripts/build/npm.ts src ':!CHANGELOG.md' ':!packages'`, and reword each hit that says Jev where the scoring model is meant.

The rebuild holds for every change.

87. Rebuild with `node scripts/build.ts`, because this section changed `metadata/source.json`.

## Keep the OpenRouter names current

A provider that releases a model needs no new module.
The step below holds for each such release.

88. Read OpenRouter's catalog, and refresh `openrouterNames` in each module with the new model names and their slugs.

`docs/providers.md` lists no name. The module holds the names, and the config tool prints each provider's OpenRouter model.
A name that the catalog lacks stays out of `openrouterNames`, and OpenRouter answers it with HTTP 400.

## Before the pull request

89. For each file the change touched, name the check or the step of this skill that led you there.
90. Key by `KeyHolder` or `Maker` each place neither led to, or add it to this skill in the same pull request.
91. Name the commit and the pull request `feat`, as [Commits and pull requests](../../../AGENTS.md#commits-and-pull-requests) says.
92. Cite the page behind each API fact in the pull request text.
93. List each harness whose path of the new key no test and no section of `docs/clients.md` proves.
94. Ask the maintainer for a live run of each, with its question, as [the live-run skill](../live-run/SKILL.md) says.
