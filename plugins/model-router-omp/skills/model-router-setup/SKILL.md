---
name: model-router-setup
description: >
  Use when the user wants to set up or change model-router in Oh My Pi (omp):
  its model roles, effort mode, or a check that routing works.
---

# model-router setup for Oh My Pi

model-router routes each generic `task` spawn to one of three agents, `router_light`,
`router_mid` and `router_heavy`. Each agent runs the model of its own role. This
interview points those roles at the user's models and picks who decides effort.

## Rules

- Ask one question at a time. Wait for the answer before the next step.
- Write nothing without consent. Show the target and the exact change, ask, and wait for a yes.
- Never ask for the TypeSafe key in chat. Never display it or any other credential.
- Use omp's own settings and documentation to read and change settings. This skill names what to check and change, not how.
- Skip a step the user declines. Name the skipped steps in the closing summary.
- Keep each message short. Show raw output only when the user needs it.

The interview changes two things and nothing else:

- the three router roles in omp's model roles, where `modelRoleStorage` says roles are stored;
- the settings `task.enableEffort` and `task.maxEffort`, only in router-effort mode.

## Step 1. Check the TypeSafe key

1. Find out whether omp holds a TypeSafe credential. With one, omp lists TypeSafe judge models.
2. If it does not, find out whether `TYPESAFE_API_KEY` is set, without reading its value.
3. If neither holds, tell the user to log in to TypeSafe in omp.
4. Offer the other route: the user sets `TYPESAFE_API_KEY` where omp reads it.
5. Say that routing skips every batch until a key exists.
6. Ask the user to say when the key is in place, then check again.

## Step 2. Detect omp auto thinking

omp's `auto` thinking level asks its judge model, Jev by default, for an effort. The result informs step 3.

1. Ask: "To test auto thinking I will spawn one small subagent. It spends a little model usage. May I?"
2. On a no, record "auto thinking: unknown" and go to step 3.
3. Spawn one `task` with one item, no `agent`, and the text "Reply with the single word ok."
4. Find out from omp's record of the session whether an auto-thinking judgment ran for that spawn.
5. Record "auto thinking: runs for spawns" or "auto thinking: no record found".

## Step 3. Choose who decides effort

Explain both modes in plain words, then ask which one decides.

- **Router's effort.** The router writes `lo`, `med` or `hi` for each item from Jev's work score. The setup turns on `task.enableEffort` and caps it with `task.maxEffort` at `high`.
- **omp's auto.** Leave `task.enableEffort` off. The router then writes no effort. Each router agent runs at its `auto` level, which omp's own classifier picks.

Add the step 2 result. If auto thinking runs for spawns, omp already pays for one judge call per spawn.

Ask: "Should the router decide effort, or omp's auto?" Record the answer.

## Step 4. Propose a model for each role

An unset `smol` or `slow` role inherits `default`. An unset `task` role uses the session model.

1. Read the current model roles, and note `smol`, `task` and `slow`.
2. List the chat models omp can use.
3. Group them into model families by name, such as Claude Haiku or Gemini Flash.
4. Keep only the newest version of each family, judged by the version in its name.
5. Drop batch variants and moving aliases that point at whatever is latest.
6. Show the kept models with their thinking levels and input cost, grouped by provider.
7. Propose one model per role, starting from the current `smol`, `task` and `slow`.
8. Never propose an older version of a family unless the user asks for it.
9. Propose a plain model with no thinking level attached. The effort setting handles levels.
10. Ask the user to accept or change each of the three picks.

The roles map to work like this:

- `router_light` takes lookup and transcription work, from the `smol` side.
- `router_mid` takes bounded judgment, from the `task` side.
- `router_heavy` takes open judgment, from the `slow` side.

The flagship model never goes into a role unless the user asks for it.

## Step 5. Warn about a single model

1. Compare the three chosen models.
2. If all three match, warn: "All three roles use one model. Routing then changes only effort."
3. Ask whether to keep going or to pick different models.
4. On a change, return to step 4.

## Step 6. Write the roles

1. Find out where omp stores model roles: `modelRoleStorage` is `global` or `project`.
2. Show the three roles to add and the place they go. Every other role stays as it is.
3. Ask for consent.
4. After a yes, set the three roles there.
5. Read the model roles back and confirm the three roles appear.

## Step 7. Set the effort cap

Run this step only in router-effort mode. In omp-auto mode, skip to the note below.

1. Read `task.enableEffort` and `task.maxEffort`.
2. Tell the user that both settings go together, because `task.enableEffort` alone leaves the ceiling at `max`.
3. Ask for consent to set `task.maxEffort` to `high` and `task.enableEffort` to on.
4. After a yes, set both, then read them back.

Never leave `task.enableEffort` on while `task.maxEffort` is not `high`.

In omp-auto mode, read `task.enableEffort` instead. If it is on, someone enabled it, possibly without the cap. Offer to set `task.maxEffort` to `high` or to turn the setting off.

## Step 8. Check for conflicts

A conflict makes the extension skip the batch or blocks its rewrite. Check:

- whether the task tool lists an agent named `task` whose description differs from omp's bundled one. The user's own `task` agent makes the router skip every batch;
- whether `task.disabledAgents` names `task`, `router_light`, `router_mid` or `router_heavy`. That blocks the rewrite;
- whether `task.batch` is off. That removes the `tasks` list the router reads;
- whether the model-router plugin is installed and enabled.

If a check found a conflict:

1. Name the conflict and its agent or setting.
2. Say that routing must stay off while the conflict stands.
3. Skip step 9.
4. Tell the user to remove the conflict, or to disable the plugin.
5. Offer to disable it, and do so only after a yes.

## Step 9. Smoke test

1. Ask: "To confirm routing I will spawn one small subagent. It spends a little model usage. May I?"
2. If this session changed anything, ask the user to restart omp and request the smoke test again.
3. Spawn one `task` with one item, no `agent`, and the text "Reply with the single word ok."
4. Read the notification. It is one line that starts with `model-router`.
5. Check that each entry starts with the item's position and names a tier and an effort.
6. If an entry names a skip reason, stop and report it. `api_key unset` points to step 1, a custom agent to step 8.
7. Find out which model and thinking level the spawned subagent ran on.
8. Check that the model matches the role of the tier on the line.
9. In router-effort mode, check that the level is at most `high`.
10. If it is above `high`, stop, report it, and offer to turn `task.enableEffort` off until the cause is clear.

In omp-auto mode, report the level without a pass or fail. A level above `high` comes from omp's classifier, not from the router.

## Closing summary

List what the interview changed, with where each change went. List the skipped steps. Include no key value and no home-directory path.
