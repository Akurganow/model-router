---
heist: multi-harness
date: 2026-10-21
status: approved
revision: 2
---

# Reconnaissance Dossier: Multi-harness model-router

## Objective

Extend model-router beyond Claude Code to Codex CLI and Oh My Pi (omp), in the same repository. On every subagent spawn the router asks TypeSafe Jev how much judgment and work the task needs, then sets the subagent's model and effort.

For Codex the model list is nearly fixed, as in Claude Code. For omp the list depends on the user's providers and keys, so the user picks three models, one per tier, at setup. The MVP keeps three tiers.

Decisions taken with the Don during discovery:

- Hermes Agent is out of scope for this heist. Its `delegate_task` takes no model or effort per task (see Hermes below).
- The TypeScript router is the one reference implementation. No Rust or Bun binary and no agent-generated scripts.
- Codex runs the TypeScript hook directly with Node 22.18 or later, with Bun as the fallback. A setup interview finds the runtime.
- In omp the router uses its own roles `router_light`, `router_mid` and `router_heavy`, falling back to `@smol`, `@default` and `@slow`. The setup interview writes the chosen models into `modelRoles`.
- In omp only the general `task` agent is routed. Specialised agents keep their own definitions.

Revision 2 adds a live omp verification (13 headless runs), a Codex source read at rust-v0.163.0, a packaging test in isolated harness homes, and a survey of routing prior art. A live Codex run is pending: the Don runs `codex-probe-prompt.md` in this folder on a machine with Codex access.

## Codebase Overview

- `plugins/model-router/hooks/router.ts` holds the harness-neutral core. It contains the tier and work texts, `EFFORT_LADDER`, `TIE_MARGIN`, `WORK_PRIOR`, `condense`, `redact`, the Jev request body, answer parsing, `pickTier` and `pickWork`. The HTTP call is injected as `post`. The file has no runtime imports.
- `plugins/model-router/hooks/register.ts` holds the Claude Code binding. It hooks `tool.call{tool=Agent}`, skips forks, named agents and caller-pinned models, honours `$.tool.check` denials, reads the key from `userConfig.api_key` or `TYPESAFE_API_KEY`, and posts to `https://api.typesafe.ai/v1/systemone` with an 8 s timeout. It imports `type { Register } from "claude-code"`, so it runs only inside Claude Code.
- `EFFORT_LADDER` and the tier models (`haiku`, `sonnet`, `opus`) are Claude-specific constants inside `router.ts`. `route()` picks the model as `TIERS[level].model`.
- Manifests: `plugins/model-router/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. `tools/surface.json` pins the hooks and engine calls.
- `scripts/calibrate.ts` runs `calibration.jsonl`, 21 labelled briefs, against Jev. It already requires Node 22.18 or later.

## Harness Intel

Marks: (run) means seen in a command run, (source) means read in the harness source at the named tag, (docs) means stated by the harness documentation, (community) means a third-party report.

### Codex CLI (source tag rust-v0.163.0)

**Spawn rewrite**

- PreToolUse `updatedInput` replaces the `spawn_agent` arguments before the handler runs. No JSON-schema revalidation happens (source, `core/src/tools/registry.rs:150-182`, `:701-760`). The collaboration tools use this default path. Only `wait`, `write_stdin`, `apply_patch`, MCP and `exec_command` override it.
- `updatedInput` is accepted only with `permissionDecision: "allow"`. `allow` without `updatedInput` is also invalid (source, `hooks/src/engine/output_parser.rs:162-173`).
- The model and effort are validated after the rewrite. An unknown model or an unsupported effort becomes a tool error that the parent model sees. A model without an effort runs at that model's default effort (source, `core/src/agent/child_config.rs:204-258`, `:326`, `:353`).
- A role file's `model` and `model_reasoning_effort` override the requested values (source, `child_config.rs:63-72`; docs, subagents page).
- The handler accepts `model` and `reasoning_effort` even when the model-facing schema hides them. v2 hides them only when `multi_agent_v2.expose_spawn_agent_model_overrides` is false, and the default is true (source, `multi_agents_spec.rs:122-127`, `config/mod.rs:1406`).
- With multi-agent v1 the hook sees `tool_name` `spawn_agent`, and the alias `Agent` matches. With v2 in the default namespace it sees `collaborationspawn_agent`, with no alias (source, `registry.rs:943-952`, `core/src/tools/mod.rs:47-61`). Community runs on 0.160.1 confirm that `^spawn_agent$` and `^Agent$` fire zero times under v2 (community, https://github.com/bioShaun/codex-agent-kit/issues/4).
- A matcher of letters, digits, `_` and `|` only is an exact match. Anything else is a regex search, so `spawn_agent$` covers both names (source, `hooks/src/engine/matcher.rs:12-27`).
- In v2 `message` is marked as an encrypted argument. A community report says the hook saw an opaque string (source, `multi_agents_spec.rs:652-656`; community, issue above). A rewrite must copy `message` back verbatim.
- v1 or v2 is chosen per model by the catalog's `multi_agent_version`, then by feature flags (source, `config/mod.rs:1657-1664`).

**Hook runtime**

- The command runs in the session's shell with non-login args: `zsh|bash|sh -c`, `PowerShell -NoProfile -Command` or `cmd /c`. `commandWindows` replaces `command` on Windows. It runs unsandboxed, in the session cwd (source, `core/src/shell.rs:24-51`, `hooks/src/engine/command_runner.rs:384-437`).
- The hook inherits the Codex process environment, including variables loaded from `~/.codex/.env` (source, `arg0/src/lib.rs:270-295`, `hooks/src/registry.rs:79`). Plugin hooks also get `PLUGIN_ROOT` and `PLUGIN_DATA` (source, `discovery.rs:265-270`).
- The default timeout is 600 s, key `timeout` in seconds. A sync hook blocks the spawn while it runs (source, `discovery.rs:744-766`).
- Failure is fail-open. A crash, timeout, non-zero exit other than 2, or unparsable JSON leaves the call unchanged. Only `deny`, or exit 2 with stderr, blocks it (source, `hooks/src/events/pre_tool_use.rs:210-290`).
- Nested spawns fire hooks with `agent_id` and `agent_type` set (source, `hook_runtime.rs:199`, `:1042-1061`). Grandchild spawns are not tested.

**Trust**

- The trust hash covers the event, matcher and handler config: command string, timeout, `async` and `statusMessage`. It is computed before `${PLUGIN_ROOT}` expands. Script contents are not hashed (source, `hooks/src/engine/discovery.rs:561-571`, `:777-792`).
- In a run, a version bump and a script edit both kept the hash (run). Editing only the `.ts` file never re-prompts. Changing the command, matcher or timeout does.
- Untrusted hooks are listed and skipped. `codex exec` skips them silently unless `--dangerously-bypass-hook-trust` is passed (source, `discovery.rs:702-707`, `utils/cli/src/shared_options.rs:61-64`).

**Models**

- `codex debug models` prints `slug`, `visibility`, `supported_reasoning_levels`, `default_reasoning_level` and `multi_agent_version` (run). Availability depends on plan or API organisation (docs, https://learn.chatgpt.com/docs/models).
- Current line-up: GPT-6 Astra is the flagship, GPT-6.1 Sol is the recommended default, GPT-6 Luna is the efficient model for focused, high-volume work (docs, models page).
- Subagent guidance: Sol for ambiguous, multi-step work, Luna for "clear, repeatable, or high-volume work". Start Luna at `high` and Astra at `low` (docs, https://learn.chatgpt.com/docs/agent-configuration/subagents).

### Oh My Pi (source tag v18.2.8)

**Spawn rewrite**

- `pi.on("tool_call", ...)` fires for `task` with the batch shape `{context, tasks: [{agent, task, name?}]}`. `agent` defaults to `"task"` (run).
- Returning `{ input }` with `tasks[i].agent` set to a router agent runs the subagent on that agent's frontmatter model. The returned input can also add, remove and rewrite tasks (run).
- A handler throw or timeout blocks the `task` call and returns an error to the model. The timeout is `extensionHandlers.toolCallTimeoutMs`, 30 s by default (run, `extensions/runner.ts:1503-1515`). The router must catch its own errors and return nothing.
- Each subagent session loads its own instance of the extension. The parent instance does not see nested calls, and the child instance routes its own `task` calls (run).

**Models and roles**

- `model: "@router_heavy,@slow"` falls through to `@slow` when `router_heavy` is unset. A set `router_heavy` in `modelRoles` is used (run).
- Unset `smol` and `slow` inherit the `default` role. With only `default` configured, all three tiers resolve to one model (run, `model-resolver.ts:1053-1055`).
- `ctx.models.resolve(spec)` accepts role aliases, CSV lists and `:level` suffixes, and returns a `Model` or undefined (run). `ctx.models.list()` returns models whose `thinking.efforts` lists the supported levels. `Model` objects carry `headers`, so they must be whitelisted before logging (run).
- Agents shipped in a package's `agents/` folder are auto-discovered with their `model:` kept. A package that has `.claude-plugin/plugin.json` and no omp manifest is treated as Claude-dialect, and its agents' `model:` is dropped (source, `task/discovery.ts:83-141`, `discovery/agent-plugin-format.ts:566-571`).
- No frontmatter flag hides an agent from the list the model sees. `task.disabledAgents` also blocks the router's own rewrite (run).

**Thinking level**

- Frontmatter `thinking-level` is applied. An unsupported level snaps down silently: `medium` on a model with `[low, high, max]` ran at `low` (run, `catalog/src/model-thinking.ts:35-66`).
- Without `thinking-level`, a subagent runs at its model's `defaultLevel`, not the parent's level (run).
- `effort` injected while `task.enableEffort` is false is dropped silently (run).
- With `task.enableEffort: true`, `lo` maps to the lowest level, `med` to `supported[(n-1)>>1]`, and `hi` to the highest. On a five-level model `med` gave `high` and `hi` gave `max` (run, `tui/src/thinking.ts:287-314`). `effort` beats frontmatter `thinking-level`. `task.maxEffort` caps only `effort` (run).
- The bundled `task` agent uses `thinkingLevel: auto`. Every default spawn already calls Jev to pick its effort: `model_usage` with `purpose: auto-thinking` and `typesafe/jev-latest` appears in each subagent session (run). The classifier asks a choice question over `low`, `medium`, `high` and `xhigh`, falls back to the model's default level on failure, and never fails the turn (source, `session/model-controls.ts:588-660`, `auto-thinking/classifier.ts:40-136`).

**Distribution**

- `.omp-plugin/marketplace.json` is read before `.claude-plugin/marketplace.json`. Entries may use `git-subdir` sources (source, `extensibility/plugins/marketplace/fetcher.ts:209`, `source-resolver.ts:156-180`).
- Extensions load from `package.json` `omp.extensions` (run).

### Hermes Agent (out of scope; source tag 0.22.2)

- `delegate_task` has no per-task model, provider or effort, and extra keys are dropped (source, `run_agent.py:1335-1348`). The child model comes only from the global `delegation.*` config (source, `delegate_tool_config.py`).
- The workarounds are a tool override through `ctx.subagent_lifecycle.launch` (no effort), an `llm_request` middleware rewrite (same provider only), or an upstream PR. None is verified.

## Packaging Intel

- Each harness reads its own catalog first: Codex reads `.agents/plugins/marketplace.json`, omp reads `.omp-plugin/marketplace.json`, and Claude Code reads only `.claude-plugin/marketplace.json`. With all three in a copy of this repository, each harness installed only its own entry (run; source, `codex-rs/core-plugins/src/marketplace.rs:20-25`).
- Today Codex installs `plugins/model-router` from the Claude catalog. It loads no hook and records a warning: `unknown field "modules"` (run, `codex-rs/config/src/hook_config.rs:10-17`). omp installs it and ignores `hooks/hooks.json` silently (run).
- No harness copies sibling folders into its cache. Codex drops symlinks, and omp rewrites them to absolute paths into the source tree (run). Shared code needs a real copy in each plugin folder.
- `claude plugin validate`, also with `--strict`, stays clean with the sibling folders and extra catalogs present (run).
- The Agent Plugins standard covers only skills and MCP. Hooks and agents are outside v1 (https://github.com/agentplugins/agent-plugins-spec, `spec/1.0.0.md:608`).
- Prior multi-harness repos: obra/superpowers (one root, several manifest folders), vshulcz/deja-vu (one folder per harness), mksglu/context-mode (a `.codex-plugin/plugin.json` `hooks` path that keeps Codex off Claude's `hooks/hooks.json`).
- Node strips types without a flag or warning from 22.18.0 and 24.3.0. Enums, runtime namespaces, parameter properties and import aliases are rejected. Imports need the `.ts` extension and `import type` (https://github.com/nodejs/node/blob/main/doc/api/typescript.md). `router.ts` imports and runs under Node 24 and 26 and under Bun (run). `node --check` rejects `.ts` on Node 24, so it cannot serve as a syntax test.

## Prior Art

- **Analogues.** LiteLLM's complexity router has the closest shape: tiers SIMPLE, MEDIUM, COMPLEX and REASONING, a model or a pool per tier, and an escalation phrase (https://docs.litellm.ai/docs/auto_router/recommended_configurations). Arch-Router routes on user-written policies, so models swap without retraining (https://arxiv.org/abs/2506.16655). OpenRouter Auto ranks by popularity, not difficulty.
- **Benchmarks.** LLMRouterBench found that several routers, commercial ones included, fail to beat the best single model reliably (https://arxiv.org/html/2601.07206). RouteLLM kept its quality on one swapped model pair without retraining. Out-of-distribution data needed augmentation (https://lmsys.org/blog/2024-07-01-routellm/).
- **Coding agents.** SWE-Router found prompt-only routing weak, at Route-AUC 0.48 to 0.57, against 0.70 to 0.78 after two exploratory turns (https://arxiv.org/html/2607.00053v1). DeepSWE found weaker configurations verify far less (https://arxiv.org/html/2607.07946).
- **Vendor guidance.** Anthropic names `low` effort for subagents and Haiku for subagent tasks, and says tuning effort is often a better lever than switching models (https://platform.claude.com/docs/en/build-with-claude/effort, https://platform.claude.com/docs/en/about-claude/models/choosing-a-model). OpenAI says effort levels do not map across model generations (docs, models page).
- **Slot set-up.** omp, Aider and LiteLLM all derive unset slots from the main model, and omp takes ordered lists where the first available model wins (https://aider.chat/docs/config/options.html, omp `docs/models.md`).

## Existing Test Coverage

- `plugins/model-router/tests/router.test.ts` holds 15 tests of the core. `plugins/model-router/tests/register.test.ts` holds 25 tests of the Claude Code binding.
- Both import `claude-code/testing` and run with `claude plugin test plugins/model-router`, with no network.
- No test runs the core outside Claude Code. The Codex and omp bindings need a runner without Claude Code, such as `node --test`.

## Dependencies

- Dev only: TypeScript 7.0.2, Biome 2.5.15, `@tsconfig/node24`, `@tsconfig/node-ts`, `@tsconfig/strictest`, `@types/node`. The Claude plugin folder ships no `package.json`.
- `.npmrc` enforces a 14-day minimum release age and no install scripts. CI runs on Node 24.
- The omp package needs its own `package.json` with `omp.extensions`, in its own folder.

## Relevant Ledger Entries

### Applicable Insights
- None. `docs/gangsta/` did not exist before this dossier.

### Applicable Negative Constraints
- From `LAWMAN.md`: the `privacy` department is judged by `plugins/model-router/PRIVACY.md`. Each new binding sends task text and the key to TypeSafe, so PRIVACY.md must cover Codex and omp.
- From `LAWMAN.md`: regression proof is `npm ci`, `npm run check` and `claude plugin test plugins/model-router`.

## Risks and Unknowns

1. **Codex v2 may hide the task text.** If `message` reaches the hook encrypted, Jev has nothing to score and the Codex binding cannot route. The live probe answers this first.
2. **Codex tool name.** The binding must match `spawn_agent$` and handle both argument shapes: v1 with `message` and `fork_context`, v2 with `task_name`, `message` and `fork_turns`.
3. **Codex role override.** A spawn with an `agent_type` whose role file sets `model` ignores the router's model.
4. **omp effort overlap.** omp already picks the effort of every default spawn with Jev. Routing effort ourselves duplicates that call. The options are leaving effort to omp's `auto` or setting it from our work level.
5. **omp level names do not travel.** Frontmatter levels snap down per model, and `lo/med/hi` maps by position. A ladder written as level names gives different efforts on different models.
6. **omp agent clutter.** Router agents cannot be hidden from the list the model sees. Each added agent is one more choice for the parent model.
7. **omp fail-closed handler.** A throw or timeout blocks the spawn, unlike Codex. The router must never throw, and its timeout must stay far below 30 s.
8. **omp default roles collapse.** With only `default` set, all tiers run one model and routing changes nothing. The interview must detect this.
9. **API key for Codex.** `~/.codex/.env` reaches hooks in the source. The live probe checks it in the CLI and the desktop app.
10. **Core coupling.** `TIERS[].model` and `EFFORT_LADDER` in `router.ts` are Claude-specific. The core must return the tier and work level, and each binding maps them.
11. **Calibration transfer.** The tier texts were calibrated against Claude model descriptions. Prior art shows weak transfer between model pools. Whether the texts suit Codex and omp pools is unmeasured.
12. **Duplicated core.** Each plugin folder holds a copy of `router.ts`. CI must fail when the copies differ.

## Recommended Scope

The Don's principle: the harnesses behave too differently for one binding. Everything all harnesses repeat goes into a shared core. Each harness gets its own binding, instructions, interview and scripts.

Shared core, identical in every plugin folder:

- The calibrated data: tier texts, work texts, question instructions, `TIE_MARGIN`, `WORK_PRIOR` and `BUDGET_CHARS`.
- The request: `condense`, `redact` and the Jev request body.
- The answer: parsing, `pickTier` and `pickWork`. The core returns the tier, the work level and their probabilities, or a skip reason. It names no model and no effort.
- The HTTP call to TypeSafe through the standard `fetch`, with a timeout. The Claude binding keeps injecting `$.http.fetch`.
- One helper that maps a work level onto a model's own supported effort list by rank, for the harnesses that set effort from a list.
- Golden fixtures that every binding's tests reuse.

Per harness:

- The binding: Claude's `register.ts` mod, Codex's PreToolUse hook script, omp's extension.
- Model and effort mapping: Claude's fixed `haiku`/`sonnet`/`opus` and `EFFORT_LADDER`, Codex's mapping checked against `codex debug models`, omp's `router_*` roles.
- Failure handling: Codex fails open by itself, omp blocks on a throw, so each binding owns its guard.
- Key reading: Claude's `userConfig`, Codex's environment or `~/.codex/.env`, omp's `TYPESAFE_API_KEY`.
- The setup interview skill, the escalation skill text and the install section of the README.

In scope:

- Make the tier and work level the core's output. Move model and effort mapping into each binding. Claude Code behaviour stays identical, proved by the existing tests.
- Add three catalogs and three plugin folders: `plugins/model-router` (Claude, unchanged layout), `plugins/model-router-codex` and `plugins/model-router-omp`. Copy the core into each folder, with a sync script and a CI equality check.
- Add a Codex binding: a Node-run `.ts` PreToolUse hook with matcher `spawn_agent$` that rewrites `model` and `reasoning_effort`, copies every other field verbatim, and never blocks. Its scope depends on the live probe (risk 1).
- Add an omp extension: a `tool_call` handler on `task` that rewrites the generic `task` agent to a router agent, plus router agents over the `router_*` roles. It catches every error and returns nothing on failure.
- Add a setup interview skill per harness. For Codex it finds the runtime, the key location and the models. For omp it lists the models and writes `modelRoles`.
- Add tests for the core and both bindings that run without Claude Code.
- Update the README, PRIVACY.md and the catalogs.

Out of scope:

- Hermes Agent.
- More than three tiers, or a dynamic tier count.
- Rust or Bun binaries and release artifacts.
- Recalibrating the tier texts per harness. This waits for routing data.
