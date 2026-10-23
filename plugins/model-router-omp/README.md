# model-router for Oh My Pi

An [Oh My Pi](https://github.com/can1357/oh-my-pi) (omp) plugin that picks a model role for each `task` subagent. It asks [Jev](https://docs.typesafe.ai), on TypeSafe or OpenRouter, how much judgment the task needs. It then gives omp's bundled `task` agent the `smol` or `slow` role for that spawn.

## What it does

- It scores each eligible `task` item through Jev, using the `jev-latest` alias. Jev answers one question: how much judgment the task needs. Jev does not score effort.
- At spawn, it returns `@smol` for level 0 and `@slow` for level 2 to omp's bundled `task` agent. Level 1 changes nothing.
- The bundled `task` agent runs with thinking set to `auto`, so omp picks the effort for each prompt. The plugin sets no effort and changes no setting.
- It never changes the tool input. A named agent, such as `scout`, keeps its own model.
- An item is eligible when its `agent` is absent or `task`, and its `task` text is not empty.

## Install

The [repository README](../../README.md#oh-my-pi) gives the install steps.

The catalog is `.omp-plugin/marketplace.json` at the repository root. It lists this plugin only.

## Key

The plugin reads a key only for a provider the [`provider` setting](#provider) allows. For each one it checks two places, in this order:

- TypeSafe: omp's stored `typesafe` credential, which `/login typesafe` stores, then the `TYPESAFE_API_KEY` environment variable.
- OpenRouter: omp's stored `openrouter` credential, then the `OPENROUTER_API_KEY` environment variable.

Get a key from [TypeSafe](https://console.typesafe.ai/keys) or from [OpenRouter](https://openrouter.ai). Each key goes only to its own provider. With no key for any allowed provider, every batch reports `key unset`.

## Provider

The `provider` plugin setting picks which providers judge each task, and in which order:

| Value | Providers |
| --- | --- |
| `typesafe` (default) | TypeSafe only |
| `openrouter` | OpenRouter only |
| `auto` | TypeSafe, then OpenRouter |
| `openrouter-first` | OpenRouter, then TypeSafe |

With `auto` or `openrouter-first` and only one key, that key's provider judges alone. A value outside the four counts as `typesafe`. [PRIVACY.md](PRIVACY.md) says which company receives the task under each value.

Switch it in omp's `/settings` → Plugins, under `model-router-omp`. The plugin reads the setting on every batch, so a change reaches the next batch with no reload.

A project's plugin settings may only narrow your global value: from `auto` or `openrouter-first` to `typesafe` or `openrouter`. The plugin ignores any other project value and uses the global one.

Both providers get the `jev-latest` alias. OpenRouter routes it to its own alias for the newest Jev release.

## Set up

Ask omp to run the `model-router-setup` skill. The skill:

- Shows the current `provider` and offers, with your consent, to change your global value.
- Checks the keys that value needs without reading or showing them.
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

A routed entry reads `L<level> <role or no change> · p=<probability>`. The probability belongs to the chosen level. When the reply carries them, the entry also names the Jev model and the token counts. After a fallback, the entry ends with the provider that answered and why the first one failed, for example ` · via openrouter (typesafe HTTP 503)`.

omp's task view shows the same decision as the spawn's routing note, without the item number.

A skipped entry reads `task <n>: skipped, <reason>`. After two attempts, the reason names each provider with its own reason, in attempt order, for example `skipped, typesafe HTTP 503, openrouter timeout`. The item then runs as omp would run it without the plugin.

### Gate reasons

A closed gate skips every eligible item with the same reason. The gates run in this order:

1. `settings unreadable`: the `provider` setting or the plugins lockfile cannot be read.
2. `key unset`: no provider the `provider` setting allows has a key.
3. `settings unreadable`: omp's model roles, task model overrides or disabled agents cannot be read.
4. `task model role set`: the `task` model role is set. omp's own routing decides.
5. `task model override set`: `task.agentModelOverrides` has an entry for `task`.
6. `task agent disabled`: `task.disabledAgents` lists `task`.
7. `custom task agent`: the `task` agent is not omp's bundled one, or omp's agent discovery fails.
8. `no @smol or @slow model`: neither role resolves.

### Item reasons

After the gates pass, one item can still skip:

- `timeout`: a first attempt got no answer in 2 s, or the 8 s scoring limit ran out. When the limit runs out, items still waiting skip too.
- `HTTP <status>`: the provider returned an error status, after any retries. For example, `HTTP 401` means the provider refused the key.
- `network error`: the request could not connect, after any retries.
- `rejected request`: the SDK raised a TypeSafe error that is neither an HTTP error nor a network error.
- `bad reply`: the reply holds no valid score for the question.
- `failed`: any other error.

## Which agent counts as `task`

The plugin calls `pi.pi.discoverAgents`, a typed omp API that the docs prose does not name. It uses the call to tell omp's bundled `task` agent from a user, project or plugin agent with the same name.

## Limits and retries

- One fixed limit of 8 s covers the scoring of a batch, retries and second providers included. At most four items are scored at once.
- With one provider, the SDK retries HTTP 408, 429 and 5xx responses, connection errors and timeouts. It makes up to three attempts in all.
- With two providers, an item's first attempt gets 2 s and no retries. The plugin moves to the second provider after a connection error, a timeout, or HTTP 401, 402, 403, 404, 408, 429 or 5xx. It never moves after HTTP 400 or 422, the 8 s limit or a bad reply. The second provider gets the rest of the limit and the SDK's retries. An item therefore sends at most four requests.
- Inside one batch, a provider whose first attempt for an item failed and fell back is passed over: items that start later in that batch go straight to the other provider. The next batch tries both again.
- The SDK honours a `Retry-After` of up to 60 s. The batch limit still stops the wait at 8 s. A 429 with a long `Retry-After` can hold a batch up to 8 s.
- Keep `extensionHandlers.toolCallTimeoutMs` at its default of 30 s. omp fails closed when a `tool_call` handler passes that timeout. A value below 8 s can block a task.

Repeated task names, or same-name items in parallel calls in sync mode, may run unrouted, never misrouted. The plugin matches a spawn to its decision by name or by child id. When two decisions share a name, neither matches.

The plugin prints no line when the call has no eligible item. A call with `task.batch` off has no `tasks` list. The plugin then routes nothing and prints no line.

## What the plugin reads

- omp's settings: `modelRoles`, `task.agentModelOverrides` and `task.disabledAgents`.
- Its own `provider` plugin setting, through omp's plugin settings loader, and the plugins lockfile that holds your global value. The project value may only narrow it, as [Provider](#provider) says.
- Whether `@smol` and `@slow` resolve, through omp's model resolution.
- The agent list, through `pi.pi.discoverAgents`.
- The items and the batch `context` of each `task` call.
- The key of each provider the `provider` setting allows, from omp's stored credential first and then `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`. The plugin reads no other environment variable.

## What leaves the machine

For each eligible item, the plugin sends an HTTPS POST to the first provider in the `provider` order:

- TypeSafe: `https://api.typesafe.ai/v1/systemone`, with your TypeSafe key as a bearer token.
- OpenRouter: `https://openrouter.ai/api/v1/systemone`, with your OpenRouter key as a bearer token.

The second provider gets a request only after the first fails, as [Limits and retries](#limits-and-retries) says. No environment variable changes either endpoint.

The request body holds:

- The item's task text and the batch `context`. Together they stay within 12,000 characters, and the context takes at most 3,000 of them.
- The item's name, sent as the description.
- A fixed role name, the `jev-latest` alias, and one fixed question about judgment.

Before sending, the plugin condenses the text. It replaces each fenced code block with a line count. It masks Bearer tokens, `sk-` keys, and values assigned to names that end in KEY, TOKEN, SECRET or PASSWORD.

The request leaves when omp prepares the `task` call, before omp's approval gate runs. [PRIVACY.md](PRIVACY.md) has the full list.

A failed request leaves the call unchanged. The item skips with its reason, and omp runs it without a model from the plugin.

## Turn it off

[Turn off and uninstall](../../README.md#turn-off-and-uninstall) in the repository README gives the steps.

Removing the key of every provider the `provider` setting allows also stops routing. Every batch then reports `key unset`.

## Support

Questions and bug reports go to https://github.com/Akurganow/model-router/issues.
