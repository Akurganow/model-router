---
name: add-provider
description: Use when adding a provider that answers the scoring questions, or a new value of the `provider` setting. Not for a new harness, and not for a calibration of the existing questions alone.
---

# Add a scoring provider

A scoring provider is an endpoint that answers the questions `tier` and `work` for a task.
[Repository layout](../../../CONTRIBUTING.md#repository-layout) says what each folder of `src/core/` holds.
[docs/providers.md](../../../docs/providers.md) says what the plugins do with a provider.
Follow the steps in order.
The type check and the tests name some of the places that change.
No check names the rest, and most of this skill lists them.

## Check the provider's API first

This skill holds no fact about any provider's API.
Each such fact comes from the provider's documentation, or from a recorded request to its host.

1. Read the provider's documentation for the address, the key header, the request body and the reply.
2. Find how a reply gives a probability for each of the three levels of a question.
3. Find the model names the endpoint takes, and the model name and token counts a reply gives.
4. Find which statuses and headers ask for a retry or a wait.
5. Read the provider's privacy policy for what it keeps of a request.
6. Note the address of the page behind each fact, for the documents and the pull request text.
7. Search [Runs against the scoring hosts](https://github.com/Akurganow/model-router/wiki/Runs-scoring-hosts) on the wiki for a recorded request to that host.
8. Where the documentation leaves a fact open, plan one request sent straight to the host.

The next four steps hold only for such a request.

9. Ask the maintainer before that request, as [Ask first](../live-run/SKILL.md#ask-first) says.
10. Send the request, and handle the key as [Keep keys secret](../live-run/SKILL.md#keep-keys-secret) says.
11. Record the request as an entry of the kind `hosts`, by [Adding an entry](https://github.com/Akurganow/model-router/wiki#adding-an-entry) on the wiki's Home page.
12. Put the entry on the scoring hosts page, and push it as [Record the run](../live-run/SKILL.md#record-the-run) says.

For a model other than Jev, read [The model behind the provider](#the-model-behind-the-provider) before any code.

## Let the type check lead

13. Find the id omp gives the provider, in omp's source or documentation; [omp](#omp) says why.
14. Take that id as the name, or with no such id the provider's own name in lower case.
15. Add the name at the end of `PROVIDERS` in `src/core/providers/provider.ts`.
16. Run `npx tsc -p src` and `npx tsc -p scripts`.
17. Fill each place an error names, and run both again until both pass.

The `provider` setting, the key lines and the routing line print the name.
The place in `PROVIDERS` is the provider's place in `auto`, until [A new value of the `provider` setting](#a-new-value-of-the-provider-setting) settles it.

The type check names these places:

- `KEY_VARIABLES`, `KEY_FIELDS` and `MODELS` in `src/core/providers/provider.ts`: the key's environment variable, the key's setting name and the model the endpoint gets.
- The provider's row of `ENDPOINTS` in `src/core/scoring/endpoints.ts`: its URL and its wire format, which [The wire format](#the-wire-format) fills.
- The `switch` of `keyVariable` in `src/adapters/claude/keys.ts`, and then the key field of `Options` in `src/adapters/claude/host.ts`.
- `PROVIDER_NAMES` in `scripts/calibrate.ts`: the name the key prompt prints.
- `LOOKED_UP` in `src/core/__tests__/unit/provider.test.ts`, because `npx tsc -p src` reads the tests too.

18. In `keyVariable`, give the provider its own `$.env.get` call with the variable's name as a literal.

## The wire format

19. For a provider that speaks System One, set `format: SYSTEM_ONE` in its row of `ENDPOINTS`.
20. For any other API, add a file in `src/core/scoring/formats/` that exports a `Format`.
21. Write its unit test first, with literal bodies and replies, as `src/core/__tests__/unit/system-one.test.ts` does.
22. Write `body` to return the request body as text, from the parts, the state and the model.
23. Write `read` to return each part's three probabilities, the model the reply names and the token counts.
24. Return `MALFORMED` from `read` for a reply it cannot read, because `read` never throws.
25. Map the API's token counts into `Usage` inside the format.
26. Map the API's question and answer shapes inside the format, and leave `Part` as it is.
27. Import only what [Repository layout](../../../CONTRIBUTING.md#repository-layout) allows `formats/`; Biome reports any other import.

`type: "score"` in `Part` is System One's wire literal.
A format for another API translates it and never changes it.

`ask` in `src/core/scoring/ask.ts` sends every provider the same four headers, with the key as `Authorization: Bearer <key>`.
No check reports a provider that needs another request.

28. For another key header, a model in the URL or a wait the body names, add a field to `Endpoint`.
29. Set the field in the provider's row of `ENDPOINTS`.
30. Read the field in `ask`, or in `src/core/scoring/transport/` when it changes a retry or a wait.
31. Change [The request](../../../docs/providers.md#the-request) when a header or the body changes for any provider.
32. Change [Retries and the second provider](../../../docs/providers.md#retries-and-the-second-provider) when a retry or a wait changes.

## Let the tests lead

33. Run `node scripts/build.ts`, then `npm test`.
34. Add what each failing test names, rebuild, and run the tests again until they pass.
35. Run `python3 -m unittest discover -s plugins/model-router-hermes/tests`, which `npm test` leaves out.
36. Add the key's variable to `SECRETS` in `plugins/model-router-hermes/tests/test_config_tool.py`, which the failing tests read.

The build takes these from the tables in `src/`, with no hand edit:

- the four bundles and the npm tree;
- `plugins/model-router-hermes/constants.json`, which the Hermes Python reads, so the Python source needs no edit;
- the key's field in the config schema and in the secret inputs of the OpenClaw manifest;
- the value lists of the Claude Code, omp and Hermes manifests.

Commit the generated files with each change, as [Generated files](../../../CONTRIBUTING.md#generated-files) says.

The tests and the build name these places, one after another:

- `metadata/source.json`: the key's option under `claude.userConfig.keys` and its hint under `openclaw.uiHints`.
- `metadata/source.schema.json`: the build refuses a key of the source that the schema lacks.
- The `Source` type in `scripts/build/source.ts`, and then `FIXTURE` in `scripts/build-shape.test.ts`.
- The literal that a test expects: the settings report, the key lines, the key lookups and the field lists of the OpenClaw config schema.

Those literals stand in the tests of the core, of the Claude Code, omp and OpenClaw adapters, and of the build.
An expected value stays a literal, as [Tests](../../../AGENTS.md#tests) says, so write the new one out.
Biome reports no place that lacks the new provider.
It checks the format, so run `npm run fix` after a hand edit.

## A new value of the `provider` setting

A provider runs only under a value whose row of `ORDER` holds it.
With no value of its own it runs only under `auto`, and outside every row it never runs.

37. Ask the maintainer which values the provider gets: its own, and each order with another provider.
38. Add each value to `PROVIDER_VALUES` in `src/core/providers/provider.ts`.
39. Run the type check: it names the value's row of `ORDER`, and nothing else.
40. Rebuild, and run the tests and the Hermes Python tests.

The tests name these places:

- The value's label in `consequences` in `src/core/options/settings.ts`. Its type forces no row, and a dialog prints `undefined` for a missing one.
- The option texts under `options.provider.descriptions` in `metadata/source.json`, one for each harness, bar the exceptions in `UNNAMED` in `scripts/build-texts.test.ts`.
- The literal that a test expects: the count of values, the order of a dialog and the hint of the command.

No check reports the rest of this section.

`ORDER.auto` is `PROVIDERS` itself, so a new provider joins `auto` at its place in that list.

41. Ask the maintainer whether `auto` takes the new provider, and at which place.
42. To give `auto` another order, or to keep the provider out, write its row of `ORDER` out as a list.
43. Change the `auto` label in `consequences` to the order `auto` now has.
44. Change the `auto` texts in `metadata/source.json` the same way, and rebuild.

`plan` gives every attempt but the last 2 s and no retry.
The last attempt keeps its retries.
So three attempts send up to five requests for one task, where two send four.

45. When a value orders three providers, rewrite the two-provider counts in these sections of `docs/providers.md`:
    - [Which provider gets a task](../../../docs/providers.md#which-provider-gets-a-task);
    - [Retries and the second provider](../../../docs/providers.md#retries-and-the-second-provider);
    - [The routing limit and billing](../../../docs/providers.md#the-routing-limit-and-billing).
46. Search every README, `PRIVACY.md` and setup skill for `four requests`, `both providers`, `both keys` and `second provider`.
47. Correct each hit that the new order makes false.

## What nothing reports

Each place below keeps its old text while every check passes.

### omp

`NARROWABLE` and `narrow` in `src/adapters/omp/settings.ts` name the two-provider values and the single values as literals.

48. When a value orders three providers, ask the maintainer what a project may narrow it to.
49. Add each new value of two or more providers to `NARROWABLE`.
50. Let `narrow` take the new provider's own value from a project.
51. Change the sentence on omp's provider text in [One source for every copy](../../../docs/design.md#one-source-for-every-copy) when that text names other values.

`findKey` in the same file passes our provider name to omp's `getApiKeyForProvider`.
So the name must be the id that omp gives the provider.

52. State that id in `docs/clients.md` with its source, as [Four harnesses, one behaviour](../../../AGENTS.md#four-harnesses-one-behaviour) says.

### OpenClaw

OpenClaw drops known provider credential variables from a workspace `.env`.
[OpenClaw runtime, logs and environment](../../../docs/clients.md#openclaw-runtime-logs-and-environment) names the variables checked so far.

53. Find whether OpenClaw's list holds the new key's variable, and state the answer in that section with its source.
54. Correct what the OpenClaw `PRIVACY.md` says a `.env` file can supply.

### Hermes

`scripts/build/hermes.ts` builds one secret setting, `typesafe_api_key`.
Its texts stand under `hermes.settings` in `metadata/source.json`.
The plugin reads every other key from its variable alone.

55. Read [Hermes registration and settings](../../../docs/clients.md#hermes-registration-and-settings) for how Hermes stores a secret setting.
56. Put that fact before the maintainer, and ask whether the new key gets a setting of its own.
57. For a setting of its own, add it in `scripts/build/hermes.ts` and its texts under `hermes.settings`.

### Claude Code

58. In [What this mod can reach](../../../plugins/model-router/README.md#what-this-mod-can-reach), add the key's variable to the row of `$.env.get`.
59. Add the provider to the row of `$.http.fetch`.
60. Name the key and the provider in the answers on secrets and on usage above the table.
61. Run `claude plugin validate --strict plugins/model-router`, and check that the table names each variable it lists.

`node scripts/check-surface.ts` still passes: it compares engine calls, not variable names.

### The calibration script

62. In `scripts/calibrate.ts`, let the guard of `main` take the new name.
63. Name the provider and its URL in `USAGE` in that file.
64. Change the command line under [Calibration](../../../CONTRIBUTING.md#calibration).

### Evals

`clientEnv` in `scripts/evals/scrub.ts` hands a client its own model key and the TypeSafe key only.
`.github/workflows/evals.yml` names each secret a job sees.

65. Ask the maintainer whether the evals score through the new provider.
66. If they do, pass its key in `clientEnv` and name its secret in the workflow.

### The routing line

The line's suffix prints the provider's name as `PROVIDERS` spells it, then the model the reply names.
The examples in [The routing line](../../../docs/providers.md#the-routing-line) and in the READMEs name the two present providers.

67. Add the name to the names that [The routing line](../../../docs/providers.md#the-routing-line) lists.
68. Add an example there and in the READMEs when the reply names its model in another form.

## Documents

No test reads these texts for a provider's name.
A new provider is a new company that receives the task text.

69. In each of the four `PRIVACY.md` under `plugins/`, name the company, its address and its privacy policy.
70. In each of the four READMEs under `plugins/`, add the key, its variable, its setting and the provider's values.
71. In the root `README.md`, change the set-up steps and "What leaves the machine".
72. In each of the four `model-router-setup/SKILL.md` under `plugins/`, add the key and the values.
73. In `docs/providers.md`, change these sections:
    - [Keys](../../../docs/providers.md#keys);
    - [What the providers do with it](../../../docs/providers.md#what-the-providers-do-with-it);
    - [Your choices](../../../docs/providers.md#your-choices).
74. Change the plugin descriptions in `metadata/source.json` that name the hosts, and rebuild.
75. Run `git grep -n -i -E 'typesafe|openrouter' -- '*.md' ':!CHANGELOG.md' ':!packages'`, and read each hit.
76. Keep one copy of each text and link to it, as [Writing](../../../AGENTS.md#writing) says.

## The model behind the provider

77. Check that the provider's row of `MODELS` holds the model name its endpoint takes.

The question texts in `src/core/parts/tier.ts` and `src/core/parts/work.ts` are fitted to Jev.
So are the factors of the pick rule in those two files.
One set of texts and factors serves every provider.

78. For a provider that serves Jev, leave the texts and the factors as they are.
79. For another model, plan the run of [Calibration](../../../CONTRIBUTING.md#calibration) against the new provider.
80. Ask the maintainer before that run: [Paid runs](../../../CONTRIBUTING.md#paid-runs) exempts Jev calls only.
81. Treat the model's levels as unknown until that run passes its bar.
82. When the run misses the bar, stop and report; never lower the bar.
83. Correct each text that says Jev scores the task: `docs/providers.md`, the READMEs and the texts in `metadata/source.json`.

`fitWarnings` in `scripts/jev-fit.ts` compares the model name of a reply with `FITTED_ON` as text.
So a provider that names the fitted model in another form gets the warning on every run.

## Before the pull request

84. With the work committed, remove the name from `PROVIDERS` and its values from `PROVIDER_VALUES` in a scratch edit.
85. Run both type checks, and read which places the errors name.

The errors name again `KEY_VARIABLES`, `KEY_FIELDS`, `MODELS`, the rows of `ORDER` and `ENDPOINTS`, the `switch` of `keyVariable` and `PROVIDER_NAMES`.
Going this way, they stay silent about places the first run named: the key field of `Options` and `LOOKED_UP`.
They stay silent too about the `Source` type, both files of `metadata/` and the other literals of the tests.
Read those places yourself.

86. Where your change added a list of providers that the errors miss, key it by `Provider` or name it here.
87. Discard the scratch edit.
88. Run every command of [Build and check](../../../CONTRIBUTING.md#build-and-check), the Hermes Python tests included.
89. Run the two commands of [Before you push](../../../AGENTS.md#before-you-push).
90. Change all four adapters in one pull request, or say in its text why one differs.
91. Name the commit and the pull request `feat`, as [Commits and pull requests](../../../AGENTS.md#commits-and-pull-requests) says.
92. Cite the page behind each API fact in the pull request text.
93. Ask the maintainer for one live run for each harness, and follow [the live-run skill](../live-run/SKILL.md).
