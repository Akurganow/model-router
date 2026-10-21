---
heist: multi-harness
date: 2026-10-21
total-work-packages: 30
territories: 6
estimated-total-budget: 3.2M tokens
---

# Execution Plan: Multi-harness model-router

The plan implements the signed Contract `docs/gangsta/multi-harness/specs/2026-10-21-contract.md` (revision 3). Its order follows the Contract's Sequencing section.

The Codex territory waits for gate G1, the Don's probe report. Every other territory starts without it, except the parts of the core that G1 shapes (WP-01, WP-03).

## Territories

### Territory: Core
**Crew Lead Domain:** the shared pure core, the network helper, the sync script and type-check coverage.
**Files:** `shared/**`, `scripts/sync.ts`, `tsconfig.json`, `scripts/tsconfig.json`, `package.json`
**Workers:** 1. All its packages touch `shared/core.ts`, so they run in sequence.
**Budget:** 600k

### Territory: Claude Code
**Crew Lead Domain:** the adapter, the registration module, the Claude Code tests and documents, and calibration.
**Files:** `plugins/model-router/**`, `scripts/calibrate.ts`
**Workers:** 1
**Budget:** 450k

### Territory: omp
**Crew Lead Domain:** the omp plugin folder.
**Files:** `plugins/model-router-omp/**`
**Workers:** 2. WP-11 and WP-12 run in sequence, and the skills run in parallel with them.
**Budget:** 650k

### Territory: Codex (gated by G1)
**Crew Lead Domain:** the Codex plugin folder and the Codex calibration mode.
**Files:** `plugins/model-router-codex/**`, `scripts/calibrate.ts` (Codex mode only)
**Workers:** 2
**Budget:** 600k

### Territory: Packaging and docs
**Crew Lead Domain:** catalogs, version tooling, CI, root documents and the constitution.
**Files:** `.claude-plugin/marketplace.json`, `.omp-plugin/**`, `.agents/**`, `scripts/set-version.ts`, `cog.toml`, `.github/workflows/ci.yml`, `README.md`, `plugins/model-router/docs/model-choice.md`, `LAWMAN.md`
**Workers:** 1
**Budget:** 350k

### Territory: Evals
**Crew Lead Domain:** the eval runner, cases, fixtures and workflow.
**Files:** `scripts/evals.ts`, `evals/**`, `.github/workflows/evals.yml`, `.github/workflows/release.yml`
**Workers:** 1
**Budget:** 550k

## Work Packages

**Prevention Guidance (all Work Packages):**
- Do NOT reproduce Gangsta-internal spec identifiers (FR-xxx, NFR-xxx, WP-xxx, AC-xx, G1 to G3) in any deliverable: source code, tests, code comments, documentation or commit messages. These identifiers belong only in `docs/gangsta/`.
- No deliverable names the owner's accounts, plans, employer, keys, machines, local paths or installed tools.
- Every package follows the repository's prose and comment rules and keeps TypeScript to erasable syntax with `.ts` import specifiers.

### WP-01: Extract the pure core
**Territory:** Core
**Contract Clause:** FR-001, FR-002, FR-003
**Files:**
- Create: `shared/core.ts`, `shared/core.test.ts`
**Acceptance Criteria:**
1. `shared/core.ts` holds the calibrated data, the request body, parsing and picking. It has no network, process or timer access.
2. Its scoring function takes the tier texts and returns the tier index, the work index and the probabilities, or a skip reason. It names no model or effort.
3. The parser demands one probability per offered tier. A count mismatch is "malformed answer".
4. The tie rule keeps today's strict margin. The three-tier results equal today's, which tests prove against the current fixtures.
5. Tier counts other than three are supported only if G1 passed. Otherwise the function accepts exactly three.
**Verification:** `node --test shared/`
**Budget:** 120k
**Dependencies:** G1 for item 5 only. Items 1 to 4 can start at once, with item 5 added after G1.

### WP-02: Brief preparation with head-and-tail cut
**Territory:** Core
**Contract Clause:** FR-004
**Files:**
- Modify: `shared/core.ts`, `shared/core.test.ts`
**Acceptance Criteria:**
1. The order is fixed: redact the full text, collapse code blocks and blank lines, then cut.
2. Text over 12000 characters keeps a head of two thirds of the remaining characters, rounded down, then the fixed marker, then the tail. The total equals 12000.
3. Tests cover short text unchanged, the exact length, the marker, and a secret straddling the cut that never leaks.
**Verification:** `node --test shared/`
**Budget:** 80k
**Dependencies:** WP-01

### WP-03: Typed transport error and one retry
**Territory:** Core
**Contract Clause:** FR-005
**Files:**
- Modify: `shared/core.ts`, `shared/core.test.ts`
**Acceptance Criteria:**
1. The error type has the classes network, timeout and HTTP status.
2. Network, 408, 429 and 5xx retry once after 300 ms through the injected wait. Nothing else retries.
3. The four existing skip texts stay exact, and "network error" is new.
4. Tests use a fake wait and status sequences.
**Verification:** `node --test shared/`
**Budget:** 90k
**Dependencies:** WP-01

### WP-04: Decision-line suffix
**Territory:** Core
**Contract Clause:** FR-006
**Files:**
- Modify: `shared/core.ts`, `shared/core.test.ts`
**Acceptance Criteria:**
1. The suffix is " · jev <model>" plus " · <in>/<out> tok", with the Contract's rules for absent fields.
2. The model string is limited to letters, digits, dot, dash and underscore, at most 40 characters.
3. Tests cover the Contract's example and every absence case.
**Verification:** `node --test shared/`
**Budget:** 50k
**Dependencies:** WP-01

### WP-05: Network helper
**Territory:** Core
**Contract Clause:** FR-007, FR-008
**Files:**
- Create: `shared/jev.ts`, `shared/jev.test.ts`
**Acceptance Criteria:**
1. The helper sends to the fixed endpoint with the bearer key and the abort signal.
2. It maps failures to the core's error classes.
3. It reads no variable that could change the endpoint.
4. Tests assert the request verbatim and every error class with a fake fetch.
**Verification:** `node --test shared/`
**Budget:** 70k
**Dependencies:** WP-03

### WP-06: Sync script and type-check coverage
**Territory:** Core
**Contract Clause:** FR-009, NFR-006, NFR-007 (first part)
**Files:**
- Create: `scripts/sync.ts`
- Modify: `package.json`, `tsconfig.json`, `scripts/tsconfig.json`
**Acceptance Criteria:**
1. The sync script copies the shared files into each plugin folder that uses them.
2. Its check mode fails on any byte difference and on unequal plugin versions.
3. `npm run check` runs the sync check and `node --test` for `shared/`.
4. `tsc` covers `shared/`.
**Verification:** `npm run check`
**Budget:** 80k
**Dependencies:** WP-05

### WP-07: Claude Code adapter
**Territory:** Claude Code
**Contract Clause:** FR-010, FR-011
**Files:**
- Create: `plugins/model-router/hooks/core.ts` (synced copy)
- Modify: `plugins/model-router/hooks/router.ts`
**Acceptance Criteria:**
1. The router module keeps every export and the decision object's exact shape.
2. The model map and effort ladder stay in it.
3. `tools/surface.json` is unchanged and the surface check passes.
**Verification:** `claude plugin test plugins/model-router` and `node scripts/check-surface.ts`
**Budget:** 90k
**Dependencies:** WP-06

### WP-08: Claude Code registration: retry, deadline, suffix
**Territory:** Claude Code
**Contract Clause:** FR-012, FR-013
**Files:**
- Modify: `plugins/model-router/hooks/register.ts`, `plugins/model-router/tests/register.test.ts`
**Acceptance Criteria:**
1. The HTTP call raises the core's typed error. The retry waits through the harness clock. One 8 s deadline covers the whole routing call.
2. The decision line carries the suffix.
3. The tests change only in the three line strings, and in one clock advance with a second expected request in the 529 test.
**Verification:** `claude plugin test plugins/model-router`, `npm run check`, `claude plugin validate --strict plugins/model-router`
**Budget:** 120k
**Dependencies:** WP-07, WP-04

### WP-09: Claude Code documents
**Territory:** Claude Code
**Contract Clause:** FR-014, NFR-001, NFR-004
**Files:**
- Modify: `plugins/model-router/PRIVACY.md`, `plugins/model-router/README.md`, `plugins/model-router/.claude-plugin/plugin.json` (description)
**Acceptance Criteria:**
1. The documents state up to two requests per routed call and the billing exposure.
2. The log example and the troubleshooting strings match the new behaviour.
**Verification:** review against the Contract, and `claude plugin validate --strict plugins/model-router`
**Budget:** 60k
**Dependencies:** WP-08

### WP-10: Calibration gate
**Territory:** Claude Code
**Contract Clause:** G2, AC-02
**Files:**
- Modify: `scripts/calibrate.ts` (only if needed to call the core; record the resolved Jev model)
**Acceptance Criteria:**
1. `node scripts/calibrate.ts` reports tier and work agreement of 85% or more, with the resolved Jev model.
2. A miss is fixed by rewording, never by lowering the bar.
3. The figures go into the pull request description.
**Verification:** `node scripts/calibrate.ts`. The Don supplies the TypeSafe key through the masked prompt.
**Budget:** 60k
**Dependencies:** WP-08

### WP-11: omp plugin skeleton and agents
**Territory:** omp
**Contract Clause:** FR-020, FR-021
**Files:**
- Create: `plugins/model-router-omp/package.json`, `plugins/model-router-omp/agents/router_light.md`, `router_mid.md`, `router_heavy.md`, `plugins/model-router-omp/LICENSE`
**Acceptance Criteria:**
1. The package declares the extension entry.
2. The three agents copy the body, tools and spawn policy of omp's bundled `task` agent at v18.2.8, with attribution.
3. They use thinking level `auto` and the role selectors with the light, mid and heavy fallbacks.
4. The folder has no `.claude-plugin` manifest.
**Verification:** a test that parses the three agents and checks model, thinking level and identical bodies
**Budget:** 80k
**Dependencies:** None

### WP-12: omp extension
**Territory:** omp
**Contract Clause:** FR-022 to FR-028, NFR-002, NFR-003
**Files:**
- Create: `plugins/model-router-omp/extension/index.ts`, plus synced `extension/core.ts` and `extension/jev.ts`
**Acceptance Criteria:**
1. The extension handles only `tool_call` for `task`, and routes only eligible items. It sets agent and effort per tier, including the light mapping, and keeps a caller effort.
2. At most four items are scored at once.
3. The scored brief puts the task first and the capped context after it.
4. One line per batch goes to the UI or to standard error.
5. A batch is skipped for a custom `task` agent or a missing key.
6. The extension never throws.
7. The key comes from omp's own credential, then the environment. The alias comes from `MODEL_ROUTER_JEV`.
**Verification:** `node --test plugins/model-router-omp/tests/`
**Budget:** 200k
**Dependencies:** WP-06, WP-11

### WP-13: omp tests
**Territory:** omp
**Contract Clause:** AC-05, NFR-007 (surface pin)
**Files:**
- Create: `plugins/model-router-omp/tests/extension.test.ts`, `plugins/model-router-omp/tests/fixtures/` (from `docs/gangsta/multi-harness/recon/evidence/omp-tool-call-task.json`)
**Acceptance Criteria:**
1. The tests cover every AC-05 item.
2. A surface test pins that the extension registers `tool_call` only.
**Verification:** `node --test plugins/model-router-omp/tests/`
**Budget:** 120k
**Dependencies:** WP-12

### WP-14: omp setup skill
**Territory:** omp
**Contract Clause:** FR-029, AC-13
**Files:**
- Create: `plugins/model-router-omp/skills/model-router-setup/SKILL.md`
**Acceptance Criteria:**
1. The ten steps of FR-029 run in order, one question at a time, with consent before every write and before the detection spawn.
2. The skill is dry-run once in a throwaway omp home, and its writes match.
**Verification:** a dry run with an overridden `HOME`; the result summary goes into the pull request without local paths
**Budget:** 80k
**Dependencies:** WP-11

### WP-15: omp escalation skill
**Territory:** omp
**Contract Clause:** FR-040, AC-15
**Files:**
- Create: `plugins/model-router-omp/skills/model-router/SKILL.md`
**Acceptance Criteria:**
1. The skill mirrors every escalation rule. A re-dispatch names a `router_*` agent and an `effort`.
**Verification:** review against FR-040
**Budget:** 40k
**Dependencies:** WP-11

### WP-16: omp README and PRIVACY
**Territory:** omp
**Contract Clause:** NFR-004, AC-08
**Files:**
- Create: `plugins/model-router-omp/README.md`, `plugins/model-router-omp/PRIVACY.md`
**Acceptance Criteria:**
1. The documents cover install and setup, both effort modes and the cap, conflicting `task` rewriters, the files and variables read, what is sent and when, the request count and billing, and the fixed endpoint.
**Verification:** review against NFR-003, NFR-004 and AC-08
**Budget:** 60k
**Dependencies:** WP-12

### WP-17: Codex manifest and hook entry (G1)
**Territory:** Codex
**Contract Clause:** FR-030, FR-031, FR-032
**Files:**
- Create: `plugins/model-router-codex/.codex-plugin/plugin.json`, `plugins/model-router-codex/hooks/hooks.json`, `plugins/model-router-codex/LICENSE`
**Acceptance Criteria:**
1. The hook entry uses the anchored matcher for the tool names of the passing versions, a 15 s timeout, a fixed command that picks Node 22.18 or later and otherwise Bun, and the Windows no-op.
**Verification:** a pin test on the exact `hooks.json`
**Budget:** 50k
**Dependencies:** G1

### WP-18: Codex hook script (G1)
**Territory:** Codex
**Contract Clause:** FR-033 to FR-037, NFR-002, NFR-003
**Files:**
- Create: `plugins/model-router-codex/hooks/codex.ts`, plus synced `hooks/core.ts` and `hooks/jev.ts`
**Acceptance Criteria:**
1. The script applies the pass-through rules, including nested spawns per probe B7.
2. It has two tiers with the slugs from the G1 report, and the provisional ladders.
3. A routed call returns `allow`, the verbatim arguments plus model and effort, and the decision line as a system message.
4. Skips and exceptions are handled as the Contract says.
5. The key and the alias are read as the Contract says.
**Verification:** `node --test plugins/model-router-codex/tests/` on Node 22.18 and 24
**Budget:** 180k
**Dependencies:** G1, WP-06, WP-17

### WP-19: Codex tests (G1)
**Territory:** Codex
**Contract Clause:** AC-06
**Files:**
- Create: `plugins/model-router-codex/tests/codex.test.ts`, `plugins/model-router-codex/tests/fixtures/` (probe payloads scrubbed of paths and ids)
**Acceptance Criteria:**
1. The tests cover every AC-06 item.
**Verification:** `node --test plugins/model-router-codex/tests/`
**Budget:** 120k
**Dependencies:** WP-18

### WP-20: Codex setup and escalation skills (G1)
**Territory:** Codex
**Contract Clause:** FR-038, FR-040, AC-13, AC-15
**Files:**
- Create: `plugins/model-router-codex/skills/model-router-setup/SKILL.md`, `plugins/model-router-codex/skills/model-router/SKILL.md`
**Acceptance Criteria:**
1. The setup skill runs the seven steps of FR-038 with consent.
2. The setup skill is dry-run in a throwaway `CODEX_HOME`.
3. The escalation skill mirrors FR-040, including the unknown-model retry.
**Verification:** a dry run with an overridden `CODEX_HOME`, and review against FR-040
**Budget:** 100k
**Dependencies:** WP-17

### WP-21: Codex calibration mode (G1)
**Territory:** Codex
**Contract Clause:** FR-039, AC-14
**Files:**
- Modify: `scripts/calibrate.ts`
**Acceptance Criteria:**
1. The Codex mode maps the labelled set to two tiers.
2. It records the resolved Jev model and exits 1 below 85%.
3. Its figures go into the pull request.
**Verification:** `node scripts/calibrate.ts` in Codex mode
**Budget:** 50k
**Dependencies:** WP-18, WP-10

### WP-22: Codex README and PRIVACY (G1)
**Territory:** Codex
**Contract Clause:** NFR-003, NFR-004, AC-08
**Files:**
- Create: `plugins/model-router-codex/README.md`, `plugins/model-router-codex/PRIVACY.md`
**Acceptance Criteria:**
1. The documents cover install, setup and trust.
2. They cover the Windows limit, the provisional texts and ladders, the key exposure and its exclusion, and versions that failed G1 left unrouted.
3. They cover the decision line's visibility per G1, what is sent and when, the request count and billing, and the fixed endpoint.
4. They make no claim about approvals.
**Verification:** review against the Contract
**Budget:** 60k
**Dependencies:** WP-18

### WP-23: Catalogs and manifest links
**Territory:** Packaging and docs
**Contract Clause:** FR-050, AC-16
**Files:**
- Create: `.omp-plugin/marketplace.json`, `.agents/plugins/marketplace.json` (G1)
**Acceptance Criteria:**
1. Each catalog lists only its own plugin as `model-router`.
2. Each manifest links its own PRIVACY.md.
3. A local install from each catalog, in a throwaway harness home, loads the plugin.
**Verification:** local installs with an overridden `HOME` or `CODEX_HOME`, and `claude plugin validate --strict .`
**Budget:** 50k
**Dependencies:** WP-11, WP-17 (Codex part)

### WP-24: Version tooling
**Territory:** Packaging and docs
**Contract Clause:** FR-051, AC-12
**Files:**
- Modify: `scripts/set-version.ts`, `cog.toml`
**Acceptance Criteria:**
1. One bump writes every manifest.
2. The sync check fails if the versions differ.
**Verification:** a dry run of the version script on a scratch version, then a revert, and `npm run check`
**Budget:** 50k
**Dependencies:** WP-06, WP-11

### WP-25: CI
**Territory:** Packaging and docs
**Contract Clause:** NFR-006, NFR-007, AC-01
**Files:**
- Modify: `.github/workflows/ci.yml`, `package.json`
**Acceptance Criteria:**
1. CI runs as separate steps the sync check, `node --test` for `shared/` and both new plugins, and the evals selftest.
2. Codex tests also run on Node 22.18.
3. `npm run check` includes the same checks.
4. Actions stay pinned by SHA.
**Verification:** `npm run check`, and the CI run on the pull request
**Budget:** 60k
**Dependencies:** WP-13, WP-19 (if G1), WP-28

### WP-26: Root docs, model choice and constitution
**Territory:** Packaging and docs
**Contract Clause:** AC-08, AC-09
**Files:**
- Modify: `README.md`, `plugins/model-router/docs/model-choice.md`, `LAWMAN.md`
**Acceptance Criteria:**
1. The root README describes the three harnesses and the layout.
2. `model-choice.md` gains a section for the new ladders with sources, and marks the rest provisional.
3. `LAWMAN.md` lists the new READMEs, PRIVACY files and catalogs. Its Regression proof stays valid.
**Verification:** review against AC-08 and AC-09
**Budget:** 80k
**Dependencies:** WP-16, WP-22 (if G1)

### WP-27: Eval runner, cases and synthetic fixtures
**Territory:** Evals
**Contract Clause:** FR-060, FR-061, FR-064
**Files:**
- Create: `scripts/evals.ts`, `evals/cases.json`, `evals/fixtures/` (synthetic, marked)
**Acceptance Criteria:**
1. The runner has one adapter per shipped client, an environment filter, and run and selftest modes.
2. The cases assert what FR-061 requires, with the routing check defined per client.
3. The omp case records drift of the bundled agent.
4. The selftest passes on the synthetic fixtures and fails when the decision line is removed.
**Verification:** `node scripts/evals.ts selftest`
**Budget:** 250k
**Dependencies:** WP-12, WP-18 (if G1)

### WP-28: Evals workflow
**Territory:** Evals
**Contract Clause:** FR-062
**Files:**
- Create: `.github/workflows/evals.yml`
- Modify: `.github/workflows/release.yml`
**Acceptance Criteria:**
1. The workflow runs on manual dispatch, and from the release workflow after publishing. It never runs on pull requests and never undoes a release.
2. Each client runs on its own runner, gets named secrets only, and is installed at a pinned, verified version.
3. The job token is not persisted.
**Verification:** `actionlint`, if the dev tools provide it; otherwise review, plus the first dispatch after the release
**Budget:** 120k
**Dependencies:** WP-27

### WP-29: Issues
**Territory:** Evals
**Contract Clause:** AC-10
**Files:** none (GitHub issues)
**Acceptance Criteria:**
1. The six issues of AC-10 are opened, plus the deferral issue if G1 failed.
2. They contain no owner-setup facts.
**Verification:** `gh issue list`
**Budget:** 30k
**Dependencies:** the release pull request is open

### WP-30: Fixture follow-up (after release)
**Territory:** Evals
**Contract Clause:** FR-063, AC-07
**Files:**
- Modify: `evals/fixtures/`, `scripts/evals.ts` (the selftest rejects synthetic fixtures)
**Acceptance Criteria:**
1. The first dispatched run passes its cases.
2. The fixtures recorded from it, scrubbed and normalised, replace the synthetic ones.
3. The selftest now rejects synthetic fixtures.
**Verification:** the evals workflow run link, and `node scripts/evals.ts selftest`
**Budget:** 80k
**Dependencies:** the release, and the Don's dispatch with secrets in place

## Execution Order

1. Start at once, in parallel: WP-01 items 1 to 4 (Core), WP-11 (omp), WP-14 and WP-15 (omp skills).
2. Core in sequence: WP-02, WP-03, WP-04, WP-05, WP-06. When G1 arrives, WP-01 item 5 is added before WP-06.
3. After WP-06, in parallel: WP-07, WP-08, WP-09 and WP-10 (Claude Code); WP-12, WP-13 and WP-16 (omp); WP-24.
4. After G1 passes, in parallel with group 3: WP-17, WP-18, WP-19, WP-20, WP-21 and WP-22 (Codex). If G1 fails, they are dropped and the deferral path applies.
5. After groups 3 and 4: WP-23, WP-27, then WP-28, WP-25 and WP-26.
6. Release pull request: WP-29, then the release.
7. After the release: WP-30, then Laundering closes the heist.

## Baseline Verification

- Tests: PASS. `claude plugin test plugins/model-router` gives 40 pass and 0 fail.
- Check: PASS. `npm run check` exits 0. The worktree needs the type declarations that Claude Code generates, copied from a session.
- Dependencies: OK. `npm ci` found 0 vulnerabilities.
- Branch: `heist/multi-harness`, created from `origin/main` at 039a6cf in a separate worktree. The main clone stays on `main`.
- Pending: G1, the Don's Codex probe report.
