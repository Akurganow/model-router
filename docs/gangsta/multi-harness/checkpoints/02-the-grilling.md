---
heist: multi-harness
phase: the-grilling
status: completed
timestamp: 2026-10-21T00:00:00Z
next-action: Proceed to The Sit-Down
artifacts: []
note: Grilling Conclusions below are passed to The Sit-Down for inclusion in the Contract
---

# Grilling Conclusions

## Idea Verdict

CHALLENGE. The objective stands with these refinements from the Don:

1. Success is parity with Claude Code: each harness routes model and effort per spawn and writes one decision line per routed call. Savings are not measured.
2. Shared logic lives in one core. Each harness gets its own binding, instructions, setup interview and scripts.
3. In omp, the interview detects whether omp's auto thinking is in use and offers either the router's effort or omp's. Good omp practices move into the shared core.
4. Codex never assigns GPT-6 Astra, as Claude never assigns Fable. Codex has two tiers, Luna and Sol, with their own provisional texts.
5. If the Codex probe shows the v2 `message` encrypted for hooks, Codex is deferred and the MVP ships Claude Code and omp.

## Key Decisions

- **Layout.** Three plugin folders: `plugins/model-router` (Claude, unchanged layout), `plugins/model-router-omp`, and `plugins/model-router-codex` (separable, built only if the probe passes). Three catalogs: `.claude-plugin`, `.omp-plugin` and `.agents/plugins`.
- **Shared code.** `shared/core.ts` is pure and has no network, process or timer access. It is copied into all three folders. `shared/jev.ts` holds the network helper and goes into the Codex and omp folders only. `scripts/sync.ts --check` fails CI on drift.
- **Core API.** `score(input, tiers, post, retry?)` returns the tier index, the work index and the probabilities. The core names no model and no effort. `pickTier` generalises to n tiers, and the n = 3 result is unchanged. The generalisation lands only if Codex passes the probe.
- **Practices taken from omp.** All of them apply to every harness, Claude included.
  - T2 cuts the brief to about 2/3 head, a fixed marker and 1/3 tail, within the 12000-character budget.
  - T3 throws a typed `TransportError` and retries once after 300 ms on network errors, 408, 429 and 5xx, inside the 8 s deadline.
  - T4 appends the answering Jev model and the token counts to the decision line.
  - The gate is `node scripts/calibrate.ts` at 85% or more after T2.
  - Claude test changes: three log strings, plus one clock advance in the 529 test.
  - T5 cooldown is rejected under PRIVACY.md.
- **Claude.** `router.ts` becomes an adapter with the same exports and the same `Decision` shape. `register.ts` gains typed errors, a retry through `$.clock.sleep`, the deadline race around `route`, and the T4 line. `tools/surface.json` is unchanged.
- **omp.**
  - Three agents, `router_light`, `router_mid` and `router_heavy`, each copying the bundled `task` agent body. Each uses `thinking-level: auto` and the models `@router_light,@smol`, `@router_mid,@task` and `@router_heavy,@slow`.
  - The extension rewrites only items whose `agent` is absent or `task`. It always writes `effort` lo/med/hi.
  - Router-effort mode sets `task.enableEffort: true` and `task.maxEffort: high`. omp-auto mode leaves `enableEffort` off. The omp setting is the mode switch.
  - The scoring prompt puts the task first, then the batch context capped to the remaining budget and 3000 characters.
  - One notify per batch, with one line per item.
  - A batch is skipped when a custom `task` agent exists.
  - The handler never throws.
  - The key comes from `ctx.modelRegistry.getApiKeyForProvider("typesafe")`, then `TYPESAFE_API_KEY`.
- **Codex.**
  - Matcher `^(?:spawn_agent|collaborationspawn_agent)$`, with the same tool-name check in code.
  - A fixed command picks `node`, else `bun`. `commandWindows` is `cmd /c exit 0`.
  - These calls pass through untouched: forks, a caller model, a non-default `agent_type`, and a non-string `message`.
  - A routed call gets `allow` with the full `updatedInput`, and `message` stays verbatim.
  - A skip writes the reason to `systemMessage`.
  - The key comes from `TYPESAFE_API_KEY`. The interview adds `[shell_environment_policy] exclude = ["TYPESAFE_API_KEY"]` to `~/.codex/config.toml` with consent.
  - Ladders: Luna `medium/high/xhigh` (OpenAI says to start Luna at high) and Sol `low/medium/high`. Both are provisional.
- **Jev URL.** It stays fixed at `https://api.typesafe.ai/v1/systemone` everywhere, and `TYPESAFE_BASE_URL` is not honoured.
- **Interviews.**
  - They ask one question at a time and write nothing without consent.
  - The Codex interview writes only `~/.codex/.env` and `~/.codex/config.toml`.
  - The omp interview writes `modelRoles` to the store that `modelRoleStorage` names, and the effort settings only in router-effort mode.
- **Evals.**
  - `scripts/evals.ts` follows the pattern of `ai-plugins/tools/evals.py`, with one case per harness.
  - Each case runs a real headless client that spawns one subagent. It asserts the spawn was routed and the decision line appears.
  - The Codex case also asserts that an agent shell cannot see the key.
  - Fixtures are trimmed from the first CI run. The selftest needs no model and runs in `npm run check` and CI.
  - `evals.yml` runs on `workflow_dispatch` and is called from `release.yml`.
- **CI.** CI gains the sync check, `node --test` for shared code, Codex and omp, and the evals selftest. `policy.yml` gets one scan target per plugin folder.
- **Docs.** Each new plugin gets its own PRIVACY.md and a manifest privacy URL. The docs state:
  - on Codex and omp, task text is sent before approval;
  - omp also sends the batch context;
  - the Codex `.env` exposure applies when the exclude entry is declined;
  - Windows is unsupported for Codex;
  - the Codex texts and ladders are provisional.

  `model-choice.md` gains a section with sources.
- **Versioning.** One version for all three plugins, bumped together. This default was not objected to.
- **Sequencing.** 0 Codex probe, 1 core and Claude adapter (touch `core.ts` once), 2 omp, 3 Codex (if the probe passes), 4 evals.

## Rejected Alternatives

- Hermes Agent: `delegate_task` has no per-task model.
- Rust or Bun binaries, and agent-generated scripts: the TypeScript reference runs directly.
- Twelve static omp agents with `MODEL_ROUTER_EFFORT`: they clutter the agent list and the switch is invisible.
- `snapUp`: there are no level agents left.
- Interview-generated agents: they go stale.
- Hard-coded Astra, and three Codex tiers.
- The matcher `spawn_agent$`: it also matches MCP tools.
- `jevPost` in the Claude copy: the policy scan reads it.
- `MODEL_ROUTER_RUNTIME`: an environment variable would select the binary that a trusted hook runs.
- Honouring `TYPESAFE_BASE_URL`: it could redirect the bearer key.
- omp's "choose the lower one" tie rule, argmax reading, keep-last-level fallback, `ultrathink`, judge fallback chains and the 5-minute cooldown.
- Measured savings and shadow mode: out of scope by the Don's success criterion.

## Unresolved Objections (accepted, tracked)

- Codex v2 fork policy, and Claude's "forks are never routed" rule. They are decided after the probe. The interim rule leaves forks unrouted.
- The Codex tier texts rest on a 21-case relabel with no statistical signal. They ship provisional, and an issue tracks an outcome-labelled set.
- An omp extension cannot read `task.enableEffort`, so the decision line shows the requested effort only.
- On a `[low, high, max]` model, `med` gives `low` in omp.

## Issues to Open

1. Expand eval cases per harness.
2. Build an outcome-labelled Luna/Sol calibration set.
3. Decide the fork routing policy for Claude and Codex v2.
4. Ask omp to make settings readable from extensions.
5. Support Codex on Windows.
6. Source the effort ladders for Codex and omp.

## Termination Reason

The single pass is complete. There are no unresolved critical objections.
