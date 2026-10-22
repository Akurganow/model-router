# model-router for Oh My Pi

An [Oh My Pi](https://github.com/can1357/oh-my-pi) (omp) plugin that picks a model role for each `task` subagent. It asks [TypeSafe Jev](https://docs.typesafe.ai) how much judgment the task needs. It then gives omp's bundled `task` agent the `smol` or `slow` role for that spawn.

## What it does

- It scores each eligible `task` item through TypeSafe Jev, using the `jev-latest` alias. Jev answers one question: how much judgment the task needs. Jev does not score effort.
- At spawn, it returns `@smol` for level 0 and `@slow` for level 2 to omp's bundled `task` agent. Level 1 changes nothing.
- The bundled `task` agent runs with thinking set to `auto`, so omp picks the effort for each prompt. The plugin sets no effort and changes no setting.
- It never changes the tool input. A named agent, such as `scout`, keeps its own model.
- An item is eligible when its `agent` is absent or `task`, and its `task` text is not empty.

## Install

The [repository README](../../README.md#oh-my-pi) gives the install steps.

The catalog is `.omp-plugin/marketplace.json` at the repository root. It lists this plugin only.

## Key

The plugin reads the key from two places, in this order:

1. omp's own TypeSafe credential, which `/login typesafe` stores.
2. The `TYPESAFE_API_KEY` environment variable.

Get a key from [TypeSafe](https://console.typesafe.ai/keys). The plugin sends the key to TypeSafe only. With no key, every batch reports `key unset`.

## Set up

Ask omp to run the `model-router-setup` skill. The skill:

- Checks the key without reading or showing it.
- Lists each reason routing is off.
- Offers, with your consent, to set `smol` and `slow` when they do not resolve.
- Ends with a routing check.

The skill writes nothing without your consent. It never writes the `task` model role or the `task` entry in `task.agentModelOverrides`, because either one turns routing off.

## Routing

| Level | Judgment the task needs | Role given to the spawn |
| --- | --- | --- |
| 0 | Lookup or transcription | `@smol` |
| 1 | Bounded judgment | none, no change |
| 2 | Open judgment | `@slow` |

The plugin picks the level with the highest probability. A higher level within 0.10 of the best probability wins.

At spawn, the plugin returns the role for the item's level. It returns nothing when:

- The spawn already names a model role.
- A gate is closed at spawn time.
- The role does not resolve.
- No decision matches the spawn.

## The batch line

The plugin prints one line per batch. The line starts with `model-router`. It goes to omp's notice area, or to standard error when omp has no UI. Each eligible item adds one entry, numbered by its position in the call.

```text
model-router task 1: L0 @smol · p=0.91 | task 2: L1 no change · p=0.62 | task 3: skipped, timeout
```

A routed entry reads `L<level> <role or no change> · p=<probability>`. The probability belongs to the chosen level. When the reply carries them, the entry also names the Jev model and the token counts.

omp's task view shows the same decision as the spawn's routing note, without the item number.

A skipped entry reads `task <n>: skipped, <reason>`. The item then runs as omp would run it without the plugin.

### Gate reasons

A closed gate skips every eligible item with the same reason. The gates run in this order:

1. `key unset`: neither key source holds a key.
2. `settings unreadable`: omp's model roles, task model overrides or disabled agents cannot be read.
3. `task model role set`: the `task` model role is set. omp's own routing decides.
4. `task model override set`: `task.agentModelOverrides` has an entry for `task`.
5. `task agent disabled`: `task.disabledAgents` lists `task`.
6. `custom task agent`: the `task` agent is not omp's bundled one, or omp's agent discovery fails.
7. `no @smol or @slow model`: neither role resolves.

### Item reasons

After the gates pass, one item can still skip:

- `timeout`: the 8 s scoring limit ran out. Items still waiting skip too.
- `HTTP <status>`: TypeSafe returned an error status, after any retries. For example, `HTTP 401` means TypeSafe refused the key.
- `network error`: the request could not connect, after any retries.
- `rejected request`: the SDK raised a TypeSafe error that is neither an HTTP error nor a network error.
- `bad reply`: the reply holds no valid score for the question.
- `failed`: any other error.

## Which agent counts as `task`

The plugin calls `pi.pi.discoverAgents`, a typed omp API that the docs prose does not name. It uses the call to tell omp's bundled `task` agent from a user, project or plugin agent with the same name.

## Limits and retries

- One fixed limit of 8 s covers the scoring of a batch, retries included. At most four items are scored at once.
- The SDK retries HTTP 408, 429 and 5xx responses, connection errors and timeouts. It makes up to three attempts in all.
- The SDK honours a `Retry-After` of up to 60 s. The batch limit still stops the wait at 8 s. A 429 with a long `Retry-After` can hold a batch up to 8 s.
- Keep `extensionHandlers.toolCallTimeoutMs` at its default of 30 s. omp fails closed when a `tool_call` handler passes that timeout. A value below 8 s can block a task.

Repeated task names, or same-name items in parallel calls in sync mode, may run unrouted, never misrouted. The plugin matches a spawn to its decision by name or by child id. When two decisions share a name, neither matches.

The plugin prints no line when the call has no eligible item. A call with `task.batch` off has no `tasks` list. The plugin then routes nothing and prints no line.

## What the plugin reads

- omp's settings: `modelRoles`, `task.agentModelOverrides` and `task.disabledAgents`.
- Whether `@smol` and `@slow` resolve, through omp's model resolution.
- The agent list, through `pi.pi.discoverAgents`.
- The items and the batch `context` of each `task` call.
- The key, from omp's TypeSafe credential first and then `TYPESAFE_API_KEY`. The plugin reads no other environment variable.

## What leaves the machine

For each eligible item, the plugin sends one HTTPS POST to `https://api.typesafe.ai/v1/systemone`. The key goes as a bearer token. No environment variable changes the endpoint.

The request body holds:

- The item's task text and the batch `context`. Together they stay within 12,000 characters, and the context takes at most 3,000 of them.
- The item's name, sent as the description.
- A fixed role name, the `jev-latest` alias, and one fixed question about judgment.

Before sending, the plugin condenses the text. It replaces each fenced code block with a line count. It masks Bearer tokens, `sk-` keys, and values assigned to names that end in KEY, TOKEN, SECRET or PASSWORD.

The request leaves when omp prepares the `task` call, before omp's approval gate runs. [PRIVACY.md](PRIVACY.md) has the full list.

A failed request leaves the call unchanged. The item skips with its reason, and omp runs it without a model from the plugin.

## Turn it off

[Turn off and uninstall](../../README.md#turn-off-and-uninstall) in the repository README gives the steps.

Removing the key also stops routing. Every batch then reports `key unset`.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
