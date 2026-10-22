---
name: model-router-setup
description: >
  Use when the user wants to set up model-router in Oh My Pi (omp), to find out
  why routing is off, or to check that routing works.
---

# model-router setup for Oh My Pi

model-router scores each generic `task` spawn with TypeSafe Jev. It gives omp's bundled `task` agent the `smol` role for lookup work, or the `slow` role for open judgment. This interview finds the reasons routing is off. It offers to set the `smol` and `slow` roles, and it ends with a routing check.

## Rules

- Ask one question at a time. Wait for the answer before the next step.
- Write nothing without consent. Show the target and the exact change, ask, and wait for a yes.
- Never ask for the TypeSafe key in chat. Never display it or any other credential.
- Use omp's own settings and documentation to read and change settings. This skill names what to check, not how.
- Never write the `task` model role or `task.agentModelOverrides.task`. Either one turns routing off.
- Skip a step the user declines. Name the skipped steps in the closing summary.
- Keep each message short. Show raw output only when the user needs it.

The skill writes at most two settings: the `smol` and `slow` model roles.

## Step 1. Check the TypeSafe key

The plugin checks omp's credential first, then the variable. Check in the same order. Read no value.

1. Check whether omp holds a TypeSafe credential.
2. If not, check whether `TYPESAFE_API_KEY` is set.
3. If neither holds a key, say that every batch skips with `key unset` until one exists.
4. Offer the two routes: log in to TypeSafe in omp, or set `TYPESAFE_API_KEY` where omp reads it.
5. Ask the user to say when the key is in place. Then check again.

## Step 2. List the reasons routing is off

Check each reason below. The key is checked in step 1. Report every reason that holds, not only the first.

- The `task` model role is set. The gate reason is `task model role set`.
- `task.agentModelOverrides` has an entry for `task`. The reason is `task model override set`.
- The `task` agent is not omp's bundled one. A user, project or plugin agent has that name. The reason is `custom task agent`.
- `task.disabledAgents` lists `task`. The reason is `task agent disabled`.
- `task.batch` is off. The call has no `tasks` list, so the plugin prints no line.
- Neither `smol` nor `slow` resolves. The reason is `no @smol or @slow model`.
- The settings cannot be read. The reason is `settings unreadable`.

Check whether `smol` and `slow` resolve, not only whether they are set. An unset role can still resolve through omp's `default` role or its built-in list. Level 0 needs `smol`. Level 2 needs `slow`.

For each reason that holds, tell the user which setting to change, and where. This skill changes none of them. The only writes are the roles in step 3.

## Step 3. Offer to set smol and slow

Run this step only for a role that does not resolve. Skip it when both roles resolve.

1. Read which chat models omp can use.
2. Keep the newest version of each model family. Drop batch variants and moving aliases.
3. Propose one plain model for each missing role, with no thinking suffix. omp's `auto` thinking picks the level.
4. Never propose a flagship model unless the user asks for it.
5. Ask the user to accept or change each pick.
6. Find out where omp stores model roles, global or project, through `modelRoleStorage`.
7. Show the two roles and the place each one goes. Every other role stays as it is.
8. Ask for consent.
9. After a yes, set the two roles there.
10. Read the roles back and confirm that both resolve.

If both roles would get one model, warn: "Both roles use one model. Routing then sends the same model for both levels." Ask whether to keep going or to pick different models.

## Step 4. Routing check

1. If the plugin was just enabled or installed, ask the user to restart omp. Then return to this step.
2. Ask: "To check routing I will spawn one small subagent. It spends a little model usage. May I?"
3. On a no, record "routing check: skipped" and go to the closing summary.
4. Spawn one `task` item with no `agent` and the text "Reply with the single word ok."
5. Read the batch line. It starts with `model-router`. If no line appears, check `task.batch` and that the plugin is enabled.
6. Check that the entry names a level and either a role or `no change`.
7. If the entry names a skip reason, stop and report it. `key unset` points to step 1. A settings reason points to step 2. `timeout`, `network error` or an HTTP status points to the TypeSafe service or the network.
8. If omp records the model the subagent ran on, check that it matches the role the entry names. For `no change`, check that it runs the model omp uses without routing.
9. Report the result in one line.

## Closing summary

List what the interview changed, and where each change went. List the reasons that still turn routing off, and the skipped steps. Include no key value and no home-directory path.
