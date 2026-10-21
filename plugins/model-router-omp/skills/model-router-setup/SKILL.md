---
name: model-router-setup
description: >
  Use when the user wants to set up or change model-router in Oh My Pi (omp):
  its model roles, effort mode, Jev alias, or a check that routing works.
---

# model-router setup for Oh My Pi

model-router routes each generic `task` spawn to one of three agents, `router_light`,
`router_mid` and `router_heavy`. Each agent runs the model of its own role. This
interview points those roles at the user's models and picks who decides effort.

## Rules

- Ask one question at a time. Wait for the answer before the next step.
- Write nothing without consent. Show the target file and the exact content, ask, and wait for a yes.
- Never ask for the TypeSafe key in chat. Never print it.
- Never run `omp token`. It prints credentials.
- Run only the commands this skill names.
- Skip a step the user declines. Name the skipped steps in the closing summary.
- Keep each message short. Show command output only when the user needs it.

The interview writes three things and nothing else:

- the three router roles, in the store that `modelRoleStorage` names;
- `task.enableEffort` and `task.maxEffort`, only in router-effort mode;
- `MODEL_ROUTER_JEV`, in omp's agent `.env` file.

## Step 1. Check the TypeSafe key

1. Run `omp models --kind judge --json`.
2. Look for rows whose `provider` is `typesafe`. Read no other field.
3. If such rows exist, say that omp holds a TypeSafe credential. Go to step 2.
4. Otherwise, run `test -n "$TYPESAFE_API_KEY" && echo set || echo unset`. It prints no value.
5. If both checks fail, tell the user to run `/login typesafe` in omp.
6. Offer the other route: the user adds `TYPESAFE_API_KEY` to the agent `.env` file themselves.
7. Say that routing skips every batch until a key exists.
8. Say that a failed network call can also hide the rows.
9. Ask the user to say when the key is in place, then repeat the checks.

## Step 2. Detect omp auto thinking

omp's `auto` thinking level asks a judge model, Jev by default, for an effort on each turn. The result informs step 3.

1. Ask: "To test auto thinking I will spawn one small subagent. It spends a little model usage. May I?"
2. On a no, record "auto thinking: unknown" and go to step 3.
3. Spawn one `task` with one item and no `agent`.
4. Use the task text "Reply with the single word ok."
5. Run `find "$(omp config path)/sessions" -path '*/sessions/*/*/*.jsonl' -mmin -10 -exec grep -l '"purpose":"auto-thinking"' {} +`.
6. If a file is listed, it holds a `model_usage` record with that purpose. Record "auto thinking: runs for spawns".
7. If nothing is listed, record "auto thinking: no record found".
8. Mention that `--session-dir` moves the session files.

## Step 3. Choose who decides effort

Explain both modes in plain words, then ask which one decides.

- **Router's effort.** The router writes `lo`, `med` or `hi` for each item from Jev's work score. The setup turns on `task.enableEffort` and caps it with `task.maxEffort` at `high`.
- **omp's auto.** Leave `task.enableEffort` off. The router then writes no effort. Each router agent runs at its `auto` level, which omp's own classifier picks.

Add the step 2 result. If auto thinking runs for spawns, omp already pays for one judge call per spawn.

Ask: "Should the router decide effort, or omp's auto?" Record the answer.

## Step 4. Propose a model for each role

An unset `smol` or `slow` inherits `default`. An unset `task` uses the session model.

1. Run `omp config get modelRoles --json`.
2. Note the current `smol`, `task` and `slow` values.
3. Run `omp models --json`.
4. Keep the rows whose `kind` is `chat`.
5. Group the rows into model families by name, such as Claude Haiku or Gemini Flash.
6. Keep only the newest version of each family, judged by the version in its name.
7. Drop `:batch` variants and moving aliases such as `~…-latest`.
8. Show the kept rows with `selector`, `thinking` levels and `cost.input`, grouped by provider.
9. Propose one `selector` per role, starting from the current `smol`, `task` and `slow`.
10. Never propose an older version of a family unless the user asks for it.
11. Use a plain selector with no `:level` suffix. The effort setting handles levels.
12. Ask the user to accept or change each of the three picks.

The roles map to work like this:

- `router_light` takes lookup and transcription work, from the `smol` side.
- `router_mid` takes bounded judgment, from the `task` side.
- `router_heavy` takes open judgment, from the `slow` side.

The flagship model never goes into a role unless the user asks for it.

## Step 5. Warn about a single model

1. Compare the three chosen selectors.
2. If all three match, warn: "All three roles use one model. Routing then changes only effort."
3. Ask whether to keep going or to pick different models.
4. On a change, return to step 4.

## Step 6. Write the roles

1. Run `omp config get modelRoleStorage`. The value is `global` or `project`.
2. If the value is `global`, run `omp config get modelRoles --json` and read `value`.
3. Merge `router_light`, `router_mid` and `router_heavy` into that object.
4. Keep every other role unchanged.
5. Show the merged JSON and the target, the global `config.yml` in the folder `omp config path` prints.
6. Warn that `get` returns effective roles, so project roles also land in the global file.
7. Ask for consent.
8. After a yes, run `omp config set modelRoles '<merged JSON>'`. The command replaces the whole record.
9. If the value is `project`, show the three lines to add under `modelRoles:` in `.omp/config.yml` in the working directory.
10. Keep the existing roles in that file. Create the file if it is missing.
11. Ask for consent, then edit the file.
12. Run `omp config get modelRoles --json` and confirm the three roles appear.

## Step 7. Set the effort cap

Run this step only in router-effort mode. In omp-auto mode, skip to the note below.

1. Run `omp config get task.enableEffort` and `omp config get task.maxEffort`.
2. Tell the user that both settings go together, because `enableEffort` alone leaves the ceiling at `max`.
3. Ask for consent to set both in the global `config.yml`.
4. Run `omp config set task.maxEffort high`.
5. Run `omp config set task.enableEffort true`.
6. Read both values back.

Never leave `task.enableEffort` true while `task.maxEffort` is not `high`.

In omp-auto mode, run `omp config get task.enableEffort` instead. If it is true, someone enabled it, possibly without the cap. Offer to set `task.maxEffort` to `high` or to turn the setting off.

## Step 8. Choose the Jev alias

1. Run `test -n "$MODEL_ROUTER_JEV" && echo set || echo unset`. A shell value wins over every `.env` file.
2. Ask: "Which Jev alias should the router use, `jev-latest` or `jev-preview`? The default is `jev-latest`."
3. Run `omp config path`. The agent `.env` file is `.env` in that folder.
4. Show the line `MODEL_ROUTER_JEV=<alias>` and the target file.
5. If the file already sets `MODEL_ROUTER_JEV`, show that line and offer to replace it.
6. Keep every other line of the file.
7. Ask for consent, then write or append the line.
8. If step 1 printed `set`, warn that the shell value overrides the file.
9. Warn that a `.env` in the working directory also overrides the agent file.
10. Tell the user that omp reads the file at start, so a restart applies the change.

## Step 9. Check for conflicts

A conflict makes the extension skip the batch or blocks its rewrite.

1. Run `test -e "$(omp config path)/agents/task.md" && echo found || echo none`.
2. Run `d="$PWD"; while [ ! -d "$d/.omp/agents" ] && [ "$d" != / ]; do d="$(dirname "$d")"; done; test -e "$d/.omp/agents/task.md" && echo found || echo none`.
3. Run `omp config get task.disabledAgents --json`.
4. Run `omp config get task.batch`.
5. Run `omp plugin list` and find the model-router entry.

Read the results:

- A custom `task.md` in the user folder or the nearest project folder makes the router skip every batch. `omp agents unpack` creates the user file.
- A `task.disabledAgents` entry named `task`, `router_light`, `router_mid` or `router_heavy` blocks the rewrite.
- A `false` value for `task.batch` removes the `tasks` list that the router reads.

If any check found a conflict:

1. Name the conflict and its file or setting.
2. Say that routing must stay off while the conflict stands.
3. Skip step 10.
4. Tell the user to remove the conflict, or to disable the plugin with `omp plugin disable <id>`.
5. Offer to run the disable command, and run it only after a yes.

## Step 10. Smoke test

1. Ask: "To confirm routing I will spawn one small subagent. It spends a little model usage. May I?"
2. If this session changed anything, ask the user to restart omp and request the smoke test again.
3. Spawn one `task` with one item, no `agent`, and the text "Reply with the single word ok."
4. Read the notification. It is one line that starts with `model-router`.
5. Check that each entry starts with the item's position and names a tier and an effort.
6. If an entry names a skip reason, stop and report it. `api_key unset` points to step 1, a custom agent to step 9.
7. Run `find "$(omp config path)/sessions" -path '*/sessions/*/*/*.jsonl' -mmin -10`.
8. Pick the newest file in the output.
9. Read its `model_change` line. The `model` should match the role of the tier on the batch line.
10. Read its `thinking_level_change` line.
11. In router-effort mode, check that `thinkingLevel` is `minimal`, `low`, `medium` or `high`.
12. If it is `xhigh` or `max`, stop and report it.
13. Offer to set `task.enableEffort` to `false` until the cause is clear.

In omp-auto mode, report the level without a pass or fail. A level above `high` comes from omp's classifier, not from the router.

## Closing summary

List what the interview wrote, with the target file for each item. List the skipped steps. Include no key value and no home-directory path.
