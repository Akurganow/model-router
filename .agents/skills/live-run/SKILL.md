---
name: live-run
description: Use only when the maintainer asked for a live run of a harness with a model-router plugin, or when a change needs a fact about a harness that no test, no document in this repository and no wiki record gives. Do not use it for an ordinary fix, a failing test or a build.
---

# Live run

A live run starts a real harness with a model-router plugin and reads what it does.
Follow the steps in order.

## Look for the fact first

1. Search the tests for the fact with `git grep`.
2. List the headings of `docs/clients.md` with `grep -n '^#' docs/clients.md`.
3. Read only the sections whose headings match; never read the file whole.
4. Clone the wiki with `git clone https://github.com/Akurganow/model-router.wiki.git`.
5. Search the client's page for the client version, as [Before a run](https://github.com/Akurganow/model-router/wiki#before-a-run) says.
6. Stop when a test, a section or a wiki entry states the fact.

## Ask first

7. Ask the maintainer before a run that calls a paid model.
   [Paid runs](../../../CONTRIBUTING.md#paid-runs) says what is exempt.

## Keep it cheap

8. Run one case.
9. Use the cheapest model that shows the behaviour, such as the case's model in `evals/cases.json`.
10. Cap the turns, for example with `--max-turns` in Claude Code.
11. For Claude Code and omp, run the evals workflow on a clean runner before a local run.
12. Run that workflow by hand only after a change to `src/`, a plugin folder or a pinned client version.
13. Set its `clients` input to the clients the change touches, for example `gh workflow run evals.yml -f clients=omp`.

## Isolate the harness

14. Run the harness against a copy of its configuration folder or a fresh home.
15. Never change a user's settings, auto-update choice or installed plugin versions.
16. Never restore a settings file whole.
17. Revert only the keys the run set, after you check each one.
18. Never start an interactive harness session from an agent session.
19. For Claude Code, point it at a copy of its configuration folder, never at an empty home.
20. Stop at a login prompt and hand the run to the maintainer.

## Keep keys secret

21. Pass each key from the environment by its variable name.
22. Never print, log or write a key to a file.
23. Never put a key into a brief, a commit or a wiki entry.

## Run the harness

24. Take the command for the harness from its line below.

- Claude Code: `claude -p --model <model> --output-format stream-json --verbose --plugin-dir plugins/model-router`, as [Subagent events](../../../docs/clients.md#subagent-events) ran it.
  The mod writes the routing line through `$.ui.log`, as [What this mod can reach](../../../plugins/model-router/README.md#what-this-mod-can-reach) lists.
- omp: `omp -p`, as [omp tool_call cost and timeout](../../../docs/clients.md#omp-tool_call-cost-and-timeout) ran it.
  With no UI, omp prints the routing line to standard error, as [The batch line](../../../plugins/model-router-omp/README.md#the-batch-line) says.
- OpenClaw: link the plugin as [Try the OpenClaw plugin from a checkout](../../../CONTRIBUTING.md#try-the-openclaw-plugin-from-a-checkout) says.
  Then send `POST /tools/invoke` with `sessions_spawn` on a copy of the state folder, with `gateway.tools.allow` naming it, as [OpenClaw hook and spawn](../../../docs/clients.md#openclaw-hook-and-spawn) ran it.
  Read the routing line with `openclaw logs --follow --plain`, as [The log line](../../../plugins/model-router-openclaw/README.md#the-log-line) says.
- Hermes: install with `hermes plugins install "file://<clone>#plugins/model-router-hermes" --enable` on a fresh Hermes home.
  Then run `hermes -z "<prompt>" -m <model> --provider <provider> -t delegation --ignore-rules --usage-file <file>`, as [Hermes task parameters](../../../docs/clients.md#hermes-task-parameters) ran it.
  Read the routing line in the task's `route.label`, as [Hermes routing and refusals](../../../docs/clients.md#hermes-routing-and-refusals) shows.
  `agent.log` in the `logs` folder of the Hermes home holds it too, unless the plugin host drops INFO lines, as [Hermes runtime, logs and environment](../../../docs/clients.md#hermes-runtime-logs-and-environment) says.

## Record the run

25. Clone the wiki, or reuse the clone from step 4.
26. Write the entry from the template under [Adding an entry](https://github.com/Akurganow/model-router/wiki#adding-an-entry).
27. Put the entry at the top of the client's page.
28. Check the entry against [What an entry never holds](https://github.com/Akurganow/model-router/wiki#what-an-entry-never-holds).
29. Set the clone's author to the one its history holds: `git config user.name "$(git log -1 --format=%an)"`.
30. Set the email the same way: `git config user.email "$(git log -1 --format=%ae)"`.
31. Make one commit with the entry.
32. Push once.
33. Without push rights, put the entry's text into your report instead.
