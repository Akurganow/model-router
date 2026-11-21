---
name: add-provider
description: Use when adding a provider that answers the scoring questions, which is a new value of the `provider` setting. Not for a new gateway, not for a new harness, and not for a calibration of the existing questions alone.
---

# Add a scoring provider

A scoring provider is a maker: a company whose model answers the questions `tier` and `work` for a task.
The `provider` setting names the maker, and the `gateway` setting says whether OpenRouter is used.
Every maker has both paths, its own API and OpenRouter, with one row of `ENDPOINTS` for each.
Both present endpoints speak System One, the wire format that `SYSTEM_ONE` holds.
Both serve Jev, the model the questions are fitted to.
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
3. Find whether an answer comes within the 2 s that a first attempt gets.
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
Choose that name now, as the present rows are named: no README names one yet.

13. Ask the maintainer before the request, with the host, the model and the question, as [Ask first](../live-run/SKILL.md#ask-first) says.
14. Send the request, and handle the key as [Keep keys secret](../live-run/SKILL.md#keep-keys-secret) says.
15. Record it as an entry of the kind `hosts`, by [Adding an entry](https://github.com/Akurganow/model-router/wiki#adding-an-entry) on the wiki's Home page.
16. Put the entry on the scoring hosts page, and push it as [Record the run](../live-run/SKILL.md#record-the-run) says.

The stop below holds with or without a request.

17. Stop and report to the maintainer when one request cannot give both answers and their probabilities within 2 s.

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
    That name serves Claude Code and OpenClaw. Hermes builds its own, `<provider>_api_key`.

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
- For a model other than Jev: may the calibration run against it? [Paid runs](../../../CONTRIBUTING.md#paid-runs) exempts Jev calls only.

## The wire format

A provider that speaks System One reuses `SYSTEM_ONE` and adds no format.

The next six steps hold only for another API.

28. Add a file in `src/core/scoring/formats/` that exports a `Format`.
29. Write its unit test first, with literal bodies and replies, as `src/core/__tests__/unit/system-one.test.ts` does.
30. Write `body` and `read` as the comment on `Format` in `src/core/scoring/formats/format.ts` says.
31. Return `MALFORMED` from `read` for a reply it cannot read.
32. Map the API's question, answer and token shapes inside the format, and leave `Part` as it is.
33. Import only what [Repository layout](../../../CONTRIBUTING.md#repository-layout) allows `formats/`; Biome reports any other import.

`type: "score"` in `Part` is System One's wire literal, which another format translates.

`ask` in `src/core/scoring/ask.ts` sends every provider the headers that [The request](../../../docs/providers.md#the-request) lists.
No check reports a provider that needs another request.
The next four steps hold only for such a provider.

34. For another key header, give the row its own `keyHeader`. For a model in the URL or a wait the body names, add a field to `Endpoint`.
35. Read the field in `ask`, or in `src/core/scoring/transport/` when it changes a retry or a wait.
36. Change [The request](../../../docs/providers.md#the-request) when a header or the body changes for any provider.
37. Change [Retries and the second attempt](../../../docs/providers.md#retries-and-the-second-attempt) when a retry or a wait changes.

`FALLBACK_STATUSES` serves every provider.
The next step holds only when the maintainer sent a new status on to the next attempt.

38. Add the status to `FALLBACK_STATUSES`, with its failing row first, and to the statuses in [The provider and the gateway](../../../docs/providers.md#the-provider-and-the-gateway).

## Let the type check lead

`KEY_HOLDERS` follows `MAKERS`, so one new name there starts the type errors.

39. Add the name to `MAKERS` in `src/core/providers/provider.ts`.

No test reads the URL of a row of `ENDPOINTS`, and a wrong one sends the key and the task text to another host.
So the provider's own rows fail first, as [Tests](../../../AGENTS.md#tests) asks.

40. Give `ADDRESSES` in `src/core/__tests__/integration/route.test.ts` a row for each new `ENDPOINTS` row. It plans for `typesafe` only today.
41. Add a test with a URL constant like `TYPESAFE_URL` in `plugins/model-router/tests/keys.test.ts`, one for each new address.
42. Add the new key to `SECRETS` and to the tuple of sentinels in `plugins/model-router-hermes/tests/test_sentinel.py`, which passes without it.
    Add it to the expected keys of a case only when the `provider` and `gateway` that case stores ask it.
43. Run `npx tsc -p src` and `npx tsc -p scripts`.
44. Fill each place an error names, and run both again until both pass.

The errors name each place. They do not say this:

- In `keyVariable` in `src/adapters/claude/keys.ts`, the provider gets its own `$.env.get` call with the variable's name as a literal.
- The key field of `Options` in `src/adapters/claude/host.ts` shows only after that `switch` is filled.
- `LOOKED_UP` in `src/core/__tests__/unit/provider.test.ts` shows because `npx tsc -p src` reads the tests too.
- The maker's row of `ENDPOINTS` holds one endpoint for each path, `direct` and `openrouter`. Each takes the URL, the format, the model name it takes, the key header and each field of the section before.
- `HOLDER_NAMES` and `CHOICES` in `scripts/calibrate.ts` show under `scripts/`. `CHOICES` maps the new key holder to its maker and the gateway `direct`.
- `FIXTURE` in `scripts/build-shape.test.ts` shows first under `scripts/`, for the Hermes setting `<provider>_api_key`. `scripts/build/hermes.ts` and the `Source` type build that name from `KEY_HOLDERS`, so neither needs an edit.
- The Hermes hint goes under `hermes.settings` in `metadata/source.json` and into `metadata/source.schema.json` in the same edit as the row of `FIXTURE`. Without the hint the build stops in `scripts/build/hermes.ts` and names no setting.

## The model behind the provider

`main` in `scripts/calibrate.ts` takes the name of a key holder and maps it through `CHOICES` to a choice.
`plan` builds the attempt from that choice, so the new row of `CHOICES` gives the run its endpoint.

45. Let the guard of `main` take the new name, and name the provider and its URL in `USAGE`.
46. Change the command line under [Calibration](../../../CONTRIBUTING.md#calibration).

`fitWarnings` in `scripts/jev-fit.ts` drops the vendor prefix of a reply's model name, the text up to the last `/`.
It compares the rest with `FITTED_ON` as text.

47. When a reply names the fitted model in another form, tell the maintainer that the warning prints on every run.

The question texts and the factors of the pick rule in `src/core/parts/tier.ts` and `src/core/parts/work.ts` are fitted to Jev.
One set serves every provider, and a provider that serves Jev leaves it as it is.
The next two steps hold only for another model, and only after the maintainer agreed to the run.

48. Run the calibration of [Calibration](../../../CONTRIBUTING.md#calibration) against the new provider. The row `openrouter` of `CHOICES` reaches `typesafe` only, so name the maker's own key holder.
49. When the run misses the bar that section sets, stop and report to the maintainer.

## Let the tests lead

50. Run `node scripts/build.ts`, then `npm test`.
51. Run `python3 -m unittest discover -s plugins/model-router-hermes/tests` and `claude plugin test plugins/model-router`, which `npm test` leaves out.
52. Add what each failure names, rebuild, and run every suite again until all pass.

The failures name each place. They do not say this:

- The Claude Code and OpenClaw key's places come one after another: `metadata/source.json`, then `metadata/source.schema.json`, then the `Source` type in `scripts/build/source.ts`, then `FIXTURE` in `scripts/build-shape.test.ts`.
- In `metadata/source.json` the key is an option under `claude.userConfig.keys` and a hint under `openclaw.uiHints`.
- Most failing rows pin a literal, which stays a literal: write the new one out.
- `plugins/model-router-hermes/tests/test_config_tool.py` holds `SECRETS` and, beside it, the expected key lines, both written by hand.
- `scripts/build-texts.test.ts` fails until each text under `options.provider.descriptions` in `metadata/source.json` names the value as `value: consequence`, for all four harnesses.
- `plugins/model-router-hermes/tests/test_defaults_and_gates.py` holds the key holders of each gateway value as a table, written by hand.
- The build writes the bundles, the npm tree, the manifests and `plugins/model-router-hermes/constants.json`. The Hermes Python source needs no edit.
- A new maker reaches the choices of `provider` in `plugins/model-router-hermes/plugin.yaml`, and the `settings` and `choices` of `constants.json`. `scripts/build/hermes.ts` needs no edit.
- The literal tables of `constants.json` and `plugin.yaml` in `scripts/build-hermes.test.ts` fail until you write the new value out.
- Hermes asks a new maker like the other three harnesses, once a user stores it as `provider`.
- Biome reports no place that lacks the provider. It checks the format, so run `npm run fix` after a hand edit.

A choice asks the key holders of its maker and OpenRouter, so no one choice asks every key holder.

53. In `src/adapters/claude/__tests__/unit/keys.test.ts`, read the key variables under choices that together hold every key holder.

The next step holds only when a setting gets a fifth value.
Then only `claude plugin test` fails, at the dialog, and the adapter's unit test passes with its fake engine.

54. Offer the values in the Claude Code dialog as the maintainer answered.

## What nothing reports

Each place below keeps its old text while every check passes.

### The label of the value

The type check does not read `consequences`, so a missing label prints as `undefined`.

55. Add the value to `consequences` under `provider` in `TEXTS` in `src/core/options/settings.ts`.
56. Write the same text after the value's name in each text under `options.provider.descriptions` in `metadata/source.json`, and rebuild.

### OpenClaw

57. Correct what `plugins/model-router-openclaw/PRIVACY.md` says a `.env` file can supply, by what you stated under [OpenClaw runtime, logs and environment](../../../docs/clients.md#openclaw-runtime-logs-and-environment).

### Hermes

Hermes stores each key's secret setting under the key's variable.
The next two steps hold only when a provider of Hermes's own reads that variable.

58. Say in the setting's help in `metadata/source.json` what a key saved there changes in Hermes itself, not only the variable, and rebuild.
59. Say the same under the table of [Keys](../../../plugins/model-router-hermes/README.md#keys) and in the keys list of `plugins/model-router-hermes/skills/model-router-setup/SKILL.md`.
    Correct "but one" in `plugins/model-router-hermes/PRIVACY.md`, which a second shared variable makes false.

### Claude Code

60. In [What this mod can reach](../../../plugins/model-router/README.md#what-this-mod-can-reach), add the variable and the provider to the rows of `$.env.get` and `$.http.fetch`.
61. Name the key and the provider in the answers on secrets and on usage above the table.
62. Run `claude plugin validate --strict plugins/model-router`, and compare the variables it prints with the row of `$.env.get`.

`node scripts/check-surface.ts` still passes: it compares engine calls, not variable names.

### Evals

No eval sets `provider` or `gateway` today, so each client asks the default maker, `typesafe`, on its own API.
Claude Code keeps it under `pluginConfigs` in `settings.json`, as [Manifest](../../../docs/clients.md#manifest) says.
omp keeps it in its lockfile, as [omp manifest and settings](../../../docs/clients.md#omp-manifest-and-settings) says, and a project never changes it.
`MODEL_SEGMENT` in `scripts/evals/stream.ts` reads the decision line: it accepts any name of `KEY_HOLDERS` and keeps only the model.
So a case passes whichever key holder answered.

The next four steps hold only when the evals score through the new provider.

63. Pass its key in `clientEnv` in `scripts/evals/scrub.ts`, and require it in `missingKeys` in `scripts/evals/run.ts`.
64. Name its secret in `.github/workflows/evals.yml`.
65. In each client's job of that workflow, set `provider` to the new maker in the client's own store after the plugin's install.
66. Make the eval read the key holder from the decision line, and fail a case that another key holder answered.

### Key shapes

`scripts/scan-owner-setup.ts` knows some key shapes, and so does the masking in `src/core/brief/brief.ts`.
[The task text](../../../docs/providers.md#the-task-text) lists the shapes of the masking and changes with it.

67. Check that both know the shape of the new provider's keys, and add a missing shape to each.

## The texts that name the provider

No test reads these texts for a provider's name.
A new provider is a new company that receives the task text.
Each search below reads every Markdown file and `metadata/source.json`.

68. Run `git grep -n -i -E 'typesafe|openrouter' -- '*.md' metadata/source.json ':!CHANGELOG.md' ':!packages'`, and read each hit.
69. In each of the four `PRIVACY.md` under `plugins/`, name the company, its host and its privacy policy.
70. In each of the four READMEs under `plugins/`, add the key, its variable and the new value of `provider`.
71. Name the key's setting in each README whose harness has one; the others say where the key comes from.
72. In the root `README.md`, change the set-up steps and "What leaves the machine".
73. In each of the four `model-router-setup/SKILL.md` under `plugins/`, add the key and the new value of `provider`.
74. In `docs/providers.md`, change these sections:
    - [Keys](../../../docs/providers.md#keys);
    - [What each company does with the text](../../../docs/providers.md#what-each-company-does-with-the-text);
    - [Your choices](../../../docs/providers.md#your-choices);
    - the names and the examples of [The routing line](../../../docs/providers.md#the-routing-line);
    - the sentence of [The request](../../../docs/providers.md#the-request) on who accepts an image reference.
75. Change the plugin descriptions in `metadata/source.json` that name the hosts.

A line that counts providers, keys or variables names none of them, so the first search misses it.

76. Run `git grep -n -i -w -E 'both|either|two|second|other provider|four' -- '*.md' metadata/source.json ':!CHANGELOG.md' ':!packages'`, and correct each hit the change makes false.

The next step holds only for a model other than Jev.

77. Run `git grep -n 'Jev' -- '*.md' metadata/source.json src/adapters/hermes/texts.ts ':!CHANGELOG.md' ':!packages'`, and correct each hit the new model makes false.

The rebuild holds for every change.

78. Rebuild with `node scripts/build.ts`, because this section changed `metadata/source.json`.

## Before the pull request

79. For each file the change touched, name the check or the step of this skill that led you there.
80. Key by `KeyHolder` or `Maker` each place neither led to, or add it to this skill in the same pull request.
81. Name the commit and the pull request `feat`, as [Commits and pull requests](../../../AGENTS.md#commits-and-pull-requests) says.
82. Cite the page behind each API fact in the pull request text.
83. List each harness whose path of the new key no test and no section of `docs/clients.md` proves.
84. Ask the maintainer for a live run of each, with its question, as [the live-run skill](../live-run/SKILL.md) says.
