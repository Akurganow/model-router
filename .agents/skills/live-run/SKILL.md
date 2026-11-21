---
name: live-run
description: Use when the maintainer asked for a live run of a harness with a model-router plugin, or when you are about to tell the maintainer that a fact about a harness needs one. Not for an ordinary fix, a failing test or a build.
---

# Live run

A live run starts a real harness with a model-router plugin and reads what it does.
Follow the steps in order.
The bans of [Live runs](../../../AGENTS.md#live-runs) in `AGENTS.md` hold at every step.

## Look for the fact first

1. Search the tests for the fact with `git grep`.
2. List the headings of `docs/clients.md` with `grep -n '^#' docs/clients.md`.
3. Read only the sections whose headings match.
4. Clone the wiki outside the repository: `wiki="$(mktemp -d)/wiki" && git clone https://github.com/Akurganow/model-router.wiki.git "$wiki"`.
5. Search the client's page in that clone as "Before a run" in its `Home.md` says.
6. Stop when a test, a section or an entry records the fact on the client version in use, and say where.
7. When the maintainer asked for the run and the fact is recorded, ask whether to run it anyway.

## Plan the cost

8. Plan one case.
9. Pick the model: `haiku` in Claude Code, the omp case's model in `evals/cases.json`.
10. For OpenClaw and Hermes, pick the models of that client's latest recorded run, unless the maintainer names others.
11. Cap the turns, for example with `--max-turns` in Claude Code.
12. Run a harness that has no turn cap under a time limit.
13. For Hermes under a fresh home, plan 20 minutes for the first command, because it builds the home's dependency environment, as [Hermes project skills and home](../../../docs/clients.md#hermes-project-skills-and-home) says.
14. For Claude Code and omp, when the question is whether the first spawn routes after a change to `src/`, a plugin folder or a pinned client version, plan the evals workflow instead of a local run.
15. Plan it for the clients the change touches: `gh workflow run evals.yml --ref <branch> -f clients=omp`.
16. Add `-f omp=minimum` to test the minimum omp pin.
17. For any other question, plan a local run.

## Ask first

No live run starts without the maintainer's word, paid or free, the evals workflow included.
A request that already names the harness and its version, the model, the cap and the question is that word.
The word covers the run and its entry on the wiki.
[Paid runs](../../../CONTRIBUTING.md#paid-runs) says what needs no clearance.

18. Ask the maintainer, and state the harness and its version, the model, the cap and the question the run answers.
19. For Hermes under a fresh home, state that dependency build and its time limit too.

## Isolate the harness

Install or update no harness.
Never restore a settings file whole; when a run changed one by mistake, revert only the entries it set, after checking each.

20. Use the installed harness, and note its version for the entry.
21. Ask the maintainer when the harness is absent or the question needs another version.
22. Point the harness at a copy of its configuration folder or a fresh home, as its recipe below says; give Claude Code a copy, because an empty home starts a login.
23. Stop at a login prompt, and hand the run to the maintainer.
24. When isolation cannot serve the run, stop and ask the maintainer.

## Keep keys secret

Never print or log a key, and never put one into a brief, a commit or a wiki entry.

25. Take each key from the environment by the variable name its plugin README gives: [Claude Code](../../../plugins/model-router/README.md#what-this-mod-can-reach), [omp](../../../plugins/model-router-omp/README.md#key), [OpenClaw](../../../plugins/model-router-openclaw/README.md#keys), [Hermes](../../../plugins/model-router-hermes/README.md#keys).
26. Take the harness's own provider key from the environment the same way.
27. Write a key only where the harness reads it, inside the isolated copy.
28. Delete the copy after the run.

## Run the harness

29. Fill the four slots of the harness in order: load, isolate, run, read the line.

### Claude Code

- Load: `--plugin-dir plugins/model-router`, as the [Subagent events](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#subagent-events) run loaded it.
- Isolate: `CLAUDE_CONFIG_DIR=<copy>`, as [Claude Code project skills and configuration](../../../docs/clients.md#claude-code-project-skills-and-configuration) says.
- Run: `claude -p "<prompt>" --model haiku --max-turns <n> --output-format stream-json --verbose --debug-file <log>`, as the [Subagent events](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#subagent-events) run ran it without the cap and the log.
  A sign-in error that ends a turn is not the login prompt of the step "Stop at a login prompt": the turn has ended, and nothing waits for input.
  After such an error read the debug log anyway, because the turn has loaded the hooks module and run `session.start`, as [Hooks module](../../../docs/clients.md#hooks-module) says.
  Stop and hand the run to the maintainer when the check needs more than that load and that hook.
- Read the line: the debug log at `<log>` holds the routing line, as the [Subagent events](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#subagent-events) run and [`--debug-file`](../../../docs/clients.md#claude-code-project-skills-and-configuration) show.

### omp

- Load: `omp plugin marketplace add <checkout>`, then `omp plugin install model-router@model-router`, as the [omp install and update](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-install-and-update) run did.
- Isolate: `PI_CONFIG_DIR=<folder relative to home>` and `PI_CODING_AGENT_DIR=<copy>/agent`, as [omp project skills and folders](../../../docs/clients.md#omp-project-skills-and-folders) says.
  Add `PI_NATIVES_DIR=<absolute path in scratch>` when the real configuration folder must stay untouched, because a start can touch its `natives/<version>` entry, as the same section says.
- Run: `omp -p --model <provider/model-id> "<prompt>"`, as the [omp tool_call cost and timeout](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-tool_call-cost-and-timeout) run ran it, with the planned model, because [omp project skills and folders](../../../docs/clients.md#omp-project-skills-and-folders) puts an explicit model before the saved default.
- Read the line: with no UI, omp prints it to standard error, as [The batch line](../../../plugins/model-router-omp/README.md#the-batch-line) says.

### OpenClaw

- Load: link the plugin as [Try the OpenClaw plugin from a checkout](../../../CONTRIBUTING.md#try-the-openclaw-plugin-from-a-checkout) says, then set it up as [Set up](../../../plugins/model-router-openclaw/README.md#set-up) says.
- Isolate: `OPENCLAW_HOME`, `OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH` on the copy, as [OpenClaw project skills and the Gateway](../../../docs/clients.md#openclaw-project-skills-and-the-gateway) says.
  Set `logging.file` to a path inside the home before the other commands, because the default file log lies outside it, as [OpenClaw runtime, logs and environment](../../../docs/clients.md#openclaw-runtime-logs-and-environment) says.
  For a run with no channel and no model, set `OPENCLAW_DISABLE_BONJOUR=1`, `OPENCLAW_NO_RESPAWN=1`, `OPENCLAW_SKIP_CHANNELS=1`, `OPENCLAW_SKIP_CRON=1` and `OPENCLAW_NO_AUTO_UPDATE=1`; [OpenClaw runtime, logs and environment](../../../docs/clients.md#openclaw-runtime-logs-and-environment) says what each switches off.
  Start that run's Gateway with `--bind loopback --auth token` and the token in `OPENCLAW_GATEWAY_TOKEN`, as [OpenClaw project skills and the Gateway](../../../docs/clients.md#openclaw-project-skills-and-the-gateway) says.
- Run: start the Gateway with `openclaw gateway run`, with `gateway.tools.allow` naming `sessions_spawn`, then send `POST /tools/invoke` with `tool` `sessions_spawn` and its `args`, as [OpenClaw project skills and the Gateway](../../../docs/clients.md#openclaw-project-skills-and-the-gateway) says and the [OpenClaw hook and spawn](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-hook-and-spawn) runs ran it.
- Read the line: `openclaw logs --follow --plain`, as [The log line](../../../plugins/model-router-openclaw/README.md#the-log-line) says.
- After the run: send `SIGINT` or `SIGTERM` to the Gateway process this run started, and wait for it to exit before you delete the copy, as [OpenClaw project skills and the Gateway](../../../docs/clients.md#openclaw-project-skills-and-the-gateway) says.
  Stop no Gateway the run did not start.

### Hermes

- Load: commit the change, then run `hermes plugins install "file://<checkout>#plugins/model-router-hermes" --enable`, because the install takes the committed `HEAD`, as [Hermes project skills and home](../../../docs/clients.md#hermes-project-skills-and-home) says.
- Then set `hermes config set delegation.backend model-router`, as [Install](../../../README.md#hermes-agent) says, and the slot models, as [Set up](../../../plugins/model-router-hermes/README.md#set-up) says.
- Isolate: `HERMES_HOME=<fresh home>` for every command after the version check, as [Hermes project skills and home](../../../docs/clients.md#hermes-project-skills-and-home) says.
  Take the version from `hermes --version` with no `HERMES_HOME`.
  Run no `hermes --version` or `hermes --help` command as the first one under the fresh home: each skips the build of the home's dependency environment and exits with `no dependency environment is committed for this install`, as the same section says.
  Run no `hermes pm` command there either: it skips that build too, and it manages the install, which a live run leaves alone.
  Give the first command under the fresh home the 20 minutes the plan holds.
  Remove `HERMES_DISABLE_LAZY_INSTALLS` from the environment of the commands, because with it a command skips the build and exits with the same message.
- Run: `hermes -z "<prompt>" -m <model> --provider <provider> -t delegation --ignore-rules --usage-file <file>`, as the [Hermes task parameters](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-task-parameters) run ran it.
- Read the line: `agent.log` in the `logs` folder of the home, unless the plugin host drops INFO lines, as [Hermes runtime, logs and environment](../../../docs/clients.md#hermes-runtime-logs-and-environment) says.
  The task's `route.label` carries it too, as [Hermes routing and refusals](../../../docs/clients.md#hermes-routing-and-refusals) shows; where a `hermes -z` run shows it is not documented.
- After the run: `hermes gateway stop` with the same `HERMES_HOME`, because a `hermes -z` turn starts a gateway, as [Hermes runtime, logs and environment](../../../docs/clients.md#hermes-runtime-logs-and-environment) says.

## Drive a check by a script

A script may run the harness's commands and read what they print, with or without a model turn.
These steps add to the recipe of the script's harness.

30. Name the script's option for a file of keys anything but `--env-file`: Node reads that option even after the script's name, and exits when the file is missing, as measured on Node v26.10.0.
31. Make the script's pass or fail line name each known harmless diagnostic it passes over, so that an expected warning prints no `FAIL`.
32. In OpenClaw, when the script puts the plugin into `plugins.load.paths` with no install, pass over the trust warning and fail on any other diagnostic, as [OpenClaw entry and registration](../../../docs/clients.md#openclaw-entry-and-registration) says.
33. In OpenClaw, run a control that writes an undeclared key into the config file only after the Gateway has stopped, because such a file stops the Gateway from starting, as [OpenClaw package files](../../../docs/clients.md#openclaw-package-files) says.
34. In Hermes, run a Python step that imports Hermes on the interpreter that the home's `facts.json` names, as [Hermes project skills and home](../../../docs/clients.md#hermes-project-skills-and-home) says.
35. In Hermes, give a check that needs `register` a turn or a load of its own, because the install does not call `register`, as [Hermes install and update](../../../docs/clients.md#hermes-install-and-update) says.

## Record the run

36. Write the entry in the wiki clone from the template under "Adding an entry" in its `Home.md`.
37. Give a run of the evals workflow the kind `evals`, and link no run.
38. Put the entry at the top of the client's page.
39. Check the entry against "What an entry never holds" in `Home.md`.
40. Add a harness fact the run shows to `docs/clients.md` as one plain sentence, by the rules of [Adding evidence](https://github.com/Akurganow/model-router/wiki#adding-evidence).
41. Put its evidence on the client's evidence page in the wiki clone, as "Adding evidence" in its `Home.md` says.
42. Set the clone's author to the one its history holds, because the wiki is public and the commit must not carry the machine's identity:

    ```sh
    git -C "$wiki" config user.name "$(git -C "$wiki" log -1 --format=%an)"
    git -C "$wiki" config user.email "$(git -C "$wiki" log -1 --format=%ae)"
    ```

43. Make one commit with the entry and the evidence, and push once.
44. Without push rights, put the text of the entry and the evidence into your report.
