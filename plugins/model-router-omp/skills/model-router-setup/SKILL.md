---
name: model-router-setup
description: >
  Use when the user wants to set up or configure model-router in Oh My Pi (omp),
  to choose its provider, to add an OpenRouter key, to find out why routing is
  off, or to check that routing works.
---

# model-router setup for Oh My Pi

model-router scores each generic `task` spawn with Jev, on TypeSafe or OpenRouter. It gives omp's bundled `task` agent the `smol` role for lookup work, or the `slow` role for open judgment. This interview asks which provider scores each task and checks its keys. It finds the reasons routing is off. It offers to set the `smol` and `slow` roles, and it ends with a routing check.

## Rules

- Ask one question at a time. Wait for the answer before the next step.
- Write nothing without consent. Show the target and the exact change, ask, and wait for a yes.
- Never ask for the TypeSafe key or the OpenRouter key in chat. Never display either key or any other credential.
- Use omp's own settings and documentation to read and change settings. This skill names what to check, not how.
- Write only the global `provider` setting. Never write a project override.
- Never write the `task` model role or `task.agentModelOverrides.task`. Either one turns routing off.
- Skip a step the user declines. Name the skipped steps in the closing summary.
- Keep each message short. Show raw output only when the user needs it.

The skill writes at most three settings: the global `provider` plugin setting and the `smol` and `slow` model roles.

## Step 1. Choose the provider

The `provider` setting names the providers that may score a task, in order:

- `typesafe` (default): TypeSafe only.
- `openrouter`: OpenRouter only.
- `auto`: TypeSafe, then OpenRouter when TypeSafe fails.
- `openrouter-first`: OpenRouter, then TypeSafe when OpenRouter fails.

With `auto` or `openrouter-first` and one key, that key's provider scores alone. With both keys, one task may reach both companies.

1. Read the global `provider` value. An unset or unknown value counts as `typesafe`.
2. Check whether the project overrides `provider`. A project value only narrows `auto` or `openrouter-first` to one provider. The plugin ignores any other project value.
3. Check which providers have a key, as step 2 does. Read no value.
4. Show the current value, its order, and a project value that narrows it.
5. Ask which value the user wants. When both providers have a key, list `auto` first as the suggested value.
6. If the user keeps the current value, go to step 2.
7. Show the change: the global `provider` setting, from the current value to the new one.
8. Ask for consent.
9. After a yes, run `omp plugin config set model-router-omp provider <value>`. It writes the global setting.
10. Read the value back with `omp plugin config get model-router-omp provider`.
11. If either command fails, ask the user to set `provider` in omp's `/settings` → Plugins.
12. After the user sets it, read the value back.

## Step 2. Check the keys

The plugin reads keys only for the providers the chosen value allows. For each one it checks omp's credential first, then the variable. Check in the same order. Read no value.

1. For each provider the value allows, check whether omp holds that provider's credential: `typesafe` or `openrouter`.
2. If not, check whether its variable is set: `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`.
3. If no allowed provider has a key, say that every batch skips with `key unset` until one exists.
4. If `auto` or `openrouter-first` finds one key, say that its provider scores alone.
5. For each missing key, offer the two routes: log in to that provider in omp, or set its variable where omp reads it.
6. Ask the user to say when the key is in place. Then check again.

## Step 3. List the reasons routing is off

Check each reason below. The keys are checked in step 2. Report every reason that holds, not only the first.

- The `task` model role is set. The gate reason is `task model role set`.
- `task.agentModelOverrides` has an entry for `task`. The reason is `task model override set`.
- The `task` agent is not omp's bundled one. A user, project or plugin agent has that name. The reason is `custom task agent`.
- `task.disabledAgents` lists `task`. The reason is `task agent disabled`.
- `task.batch` is off. The call has no `tasks` list, so the plugin prints no line.
- Neither `smol` nor `slow` resolves. The reason is `no @smol or @slow model`.
- The settings cannot be read. The reason is `settings unreadable`.

Check whether `smol` and `slow` resolve, not only whether they are set. An unset role can still resolve through omp's `default` role or its built-in list. Level 0 needs `smol`. Level 2 needs `slow`.

For each reason that holds, tell the user which setting to change, and where. This skill changes none of them. The only writes are the provider in step 1 and the roles in step 4.

## Step 4. Offer to set smol and slow

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

## Step 5. Routing check

1. If the plugin was just enabled or installed, ask the user to restart omp. Then return to this step.
2. Ask: "To check routing I will spawn one small subagent. It spends a little model usage. May I?"
3. On a no, record "routing check: skipped" and go to the closing summary.
4. Spawn one `task` item with no `agent` and the text "Reply with the single word ok."
5. Read the batch line. It starts with `model-router`. If no line appears, check `task.batch` and that the plugin is enabled.
6. Check that the entry names a level and either a role or `no change`. After a fallback, it ends with ` · via <provider> (<first provider> <reason>)`.
7. If the entry names a skip reason, stop and report it. `key unset` points to step 2. A settings reason, `settings unreadable` included, points to step 3. `timeout`, `network error` or an HTTP status points to the provider or the network. After two attempts the entry names each provider with its reason, for example `skipped, typesafe HTTP 503, openrouter timeout`.
8. If omp records the model the subagent ran on, check that it matches the role the entry names. For `no change`, check that it runs the model omp uses without routing.
9. Report the result in one line.

## Closing summary

List what the interview changed, and where each change went. List the reasons that still turn routing off, and the skipped steps. Include no key value and no home-directory path.
