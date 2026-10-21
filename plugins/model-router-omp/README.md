# model-router for Oh My Pi

An [Oh My Pi](https://github.com/can1357/oh-my-pi) (omp) plugin that picks the
cheapest model and effort for each `task` subagent. On every batch it routes,
the plugin asks [TypeSafe Jev](https://docs.typesafe.ai) two questions per
item: how much judgment and how much work the task needs. Then it sets the
item's `agent` and, when you allow it, its `effort`.

The plugin ships three agents, `router_light`, `router_mid` and
`router_heavy`. Each is a copy of omp's bundled `task` agent that runs on a
model role of its own. You point those roles at your models once, with the
setup skill.

## Install

You need omp and a TypeSafe API key from https://console.typesafe.ai/keys.

```
omp plugin marketplace add Akurganow/model-router
omp plugin install model-router@model-router
```

Restart omp. It loads extension modules at start.

The catalog is `.omp-plugin/marketplace.json` at the repository root. It lists
this plugin only.

## Set up

Ask omp to run the `model-router-setup` skill. The interview asks one question
at a time and writes nothing without your consent. It:

1. checks that a TypeSafe key exists, without printing it
2. detects whether omp's auto thinking runs for spawns, with your consent,
   because it spawns one `task`
3. asks who decides effort
4. proposes a model for each router role
5. warns when all three roles resolve to one model
6. writes the roles, and the effort settings if you chose router's effort
7. stores the Jev alias in omp's agent `.env` file
8. checks for conflicts
9. runs a smoke test, with your consent, because it spawns one `task`

The key comes from omp's own TypeSafe credential (`/login typesafe`) or from
the environment variable `TYPESAFE_API_KEY`. The interview never asks for it
in chat.

## Routing

For each routed item the plugin sets:

| Jev tier | Agent | Model role, then fallback |
| --- | --- | --- |
| 0, lookup or transcription | `router_light` | `router_light`, then `smol` |
| 1, bounded judgment | `router_mid` | `router_mid`, then `task` |
| 2, open judgment | `router_heavy` | `router_heavy`, then `slow` |

An unset `smol` or `slow` role inherits your `default` model, and an unset
`task` role uses the session model. With only `default` set, all three tiers
run one model, and routing changes only effort.

The plugin routes an item when its `agent` is absent or `task` and its `task`
text is a non-empty string. It leaves every other item alone: named
agents, items with no task text, calls with no `tasks` list or an empty one.
It handles the `task` tool only.

The plugin never overrides a choice that omp, the orchestrator or you made. An
item that names another agent, such as `scout`, keeps that agent with its own
model, prompt and tools. omp sets no model per item, so the only way to route
an item is to swap the generic `task` agent for a router agent.

A subagent runs its own copy of the plugin. A `task` call that a subagent
makes gets routed too.

## Effort

Jev's second answer, the work index, maps to an effort:

| Work index | `router_mid`, `router_heavy` | `router_light` |
| --- | --- | --- |
| 0, a short task | `lo` | `med` |
| 1, an ordinary task | `med` | `med` |
| 2, a long or delicate task | `hi` | `hi` |

The light tier never runs at the model's lowest level, because a small model
there stops early. omp maps `med` to the middle level, the lower one of two on
a model with an even count, so on a short list `med` can land on the lowest
level. The router then asks for `hi` instead. When your cap pins `hi` there
too, the request stays as it was. An `effort` the caller set is kept, and the line says
`caller effort`. The plugin never sets `max`.

omp decides what happens to the effort. The setup asks you to pick one of two
modes.

### Router's effort

The setup turns on `task.enableEffort` and caps it with `task.maxEffort` at
`high`. omp applies the router's effort, and the cap keeps it from
passing `high`. The cap applies in this mode only.

The extension reads both settings once per batch and writes an effort only
when `task.enableEffort` is on. It leaves your cap as it is. If you turn on
`task.enableEffort` by hand and leave `task.maxEffort` at its default, omp
maps the router's `hi` to the model's highest level, which can be `max`, and
the line shows it. The setup always sets both settings together. Set them
together by hand too.

On a model that lists only `low`, `high` and `max`, omp maps `med` to `low`
for the mid and heavy tiers.
When the cap sits below the model's lowest level, omp would fail the spawn,
so the plugin writes no effort for that item and the line shows `auto`.

### omp's auto

`task.enableEffort` stays off, and the router writes no effort. Each router
agent runs at thinking level `auto`, and omp's own classifier picks the level.
That classifier may choose `xhigh`. The `high` ceiling does not apply here.
The line shows `auto`. The plugin also treats settings it cannot read as this
mode.

## The line

The plugin shows one notification per batch. It is one line that starts with
`model-router`. One entry per routed item follows, joined by ` | `. Each entry
starts with the item's position in the batch:

```
model-router task 1: L0 router_light · med→medium · p=0.91/0.62 · jev jev-1.14.0 · 812/9 tok | task 2: L2 router_heavy · caller effort · p=0.84/0.71 · jev jev-1.14.0 · 806/9 tok
```

An entry reads `L<tier> <agent> · <effort> · p=<tier>/<work>`. The effort
part is one of these:

- `<request>→<level>`: the router's `lo`, `med` or `hi`, and the level omp
  applies on the model of the agent's role, after `task.maxEffort`;
- `<request>` alone: the role's model is unknown or has no effort levels;
- `auto`: the router wrote no effort, and omp's `auto` decides;
- `caller effort`: the item already had an effort, and it stays.

The two numbers are the probabilities of the chosen tier and the chosen work index.
The suffix names the Jev model that answered and its token counts, when the
answer carries them.

A skipped entry reads `task <n>: skipped, <reason>`:

- `api_key unset`: no key found. The batch stays unrouted.
- `custom task agent`: a `task.md` override exists. The batch stays unrouted.
- `HTTP <status>`: TypeSafe refused the request, for example `HTTP 401` for a
  bad key.
- `no answer in 8000 ms`: the deadline passed.
- `network error` or `malformed answer`: the request or the answer failed.

A skipped item keeps its original agent. Without a UI, omp in print or RPC
mode, the line goes to standard error.

## Conflicts

- **A custom `task` agent.** A `task.md` file in the `agents` folder of your
  omp agent directory or in the nearest project `.omp/agents` replaces omp's bundled `task` agent. The
  router would swap your agent out, so it skips the whole batch and says so
  in the line. Remove the file or disable the plugin.
- **Other extensions that rewrite task items.** omp runs every `tool_call`
  handler against the original input. When two handlers return `input`, the
  last one wins, and the other rewrite is lost. Disable the other extension,
  or accept that the result depends on load order.
- **`task.disabledAgents`.** An entry named `task` or a router agent blocks the
  rewrite.
- **`task.batch` set to `false`.** The call has no `tasks` list, so the
  plugin has nothing to route.

## What the plugin reads

Files, one check per batch:

- `agents/task.md` in the omp agent directory: the folder that
  `PI_CODING_AGENT_DIR` names, which omp sets for a profile, or else
  `~/.omp/agent`
- `.omp/agents/task.md` in the nearest project folder that has `.omp/agents`

The plugin checks these paths for existence and reads no content.

Settings, once per batch: `task.enableEffort` and `task.maxEffort`. omp gives
extensions no settings API, so the extension runs
`omp config get <key> --json` with the omp it runs in, in the working
directory. The answer covers your global and project settings and your
profile. A run-time `--config` overlay is not visible to it.

Variables:

- `TYPESAFE_API_KEY`, the key when omp's own TypeSafe credential is empty
- `PI_CODING_AGENT_DIR`, the omp agent directory, set by omp for a profile
- `MODEL_ROUTER_JEV`, the Jev alias. `jev-preview` selects the preview. Any
  other value, or none, selects `jev-latest`

The plugin also asks omp for its stored TypeSafe credential, and it reads
nothing else. The setup stores `MODEL_ROUTER_JEV` in omp's agent `.env` file,
which omp loads at start.

## What leaves the machine

On each routed item the plugin sends one HTTPS POST to
https://api.typesafe.ai/v1/systemone, with your TypeSafe key as the bearer
token. The endpoint is fixed. No variable or setting changes it, and the key
goes nowhere else.

The body holds the task text, a capped part of the batch `context`, the role
`general-purpose`, the item's `name` as the description, the Jev alias and two
fixed scoring questions. Redaction masks token-shaped strings, and fenced code
blocks become a size note. [PRIVACY.md](PRIVACY.md) has the full list.

The request leaves before omp's approval for the `task` call.

A failure leaves the call unchanged. The deadline is 8 seconds for the whole
batch, retry included. A network error and HTTP 408, 429 and 5xx get one
retry after 300 ms. At most four items are scored at once.

## Turn it off

Disable the plugin and nothing is sent:

```
omp plugin disable model-router@model-router
```

Removing the key also stops routing. Every batch then reports `api_key unset`.
Uninstall with `omp plugin uninstall model-router@model-router`.

## Attribution

The three agents copy the body, tools and spawn policy of omp's bundled `task`
agent, which is MIT licensed, at tag v18.2.8. Each agent file carries the
attribution line.

## Support

Questions and bug reports go to
https://github.com/Akurganow/model-router/issues.
