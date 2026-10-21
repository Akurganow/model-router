---
heist: multi-harness
phase: laundering
status: awaiting-don
timestamp: 2026-10-21T00:00:00Z
next-action: Don signs the exceptions and the Ledger question, then merge. The heist closes after the recorded-fixtures pull request.
artifacts:
  - docs/gangsta/multi-harness/specs/2026-10-21-contract.md
  - docs/gangsta/multi-harness/plans/2026-10-21-execution-plan.md
  - docs/gangsta/multi-harness/recon/2026-10-21-recon-dossier.md
technical-debt-audit:
  copy-paste: 6 clusters fixed; 2 documented exceptions
  long-files: PASS; 1 documented (register.test.ts)
  test-coverage: 94.93% to 97.55% lines (node coverage over shared, scripts and omp, tests excluded)
  clean-architecture: no formal layers
  clean-code: 1 long function fixed (register.ts handler)
  documented-exceptions: see below
---

# Laundering

## Verification

- `npm run check`: tsc, sync check, evals selftest, 206 node tests, biome. Pass.
- `claude plugin test plugins/model-router`: 40 pass.
- `claude plugin validate --strict plugins/model-router`: pass.
- `node scripts/check-surface.ts`: the mod's surface matches `tools/surface.json`.
- Identifier scan outside `docs/gangsta/`: no matches.
- CI on the pull request: check on Ubuntu and macOS, policy scan and dependency review pass.

## Technical Debt Audit

| Sub-check | Result | Details |
|-----------|--------|---------|
| Copy/Paste (jscpd 4.0.5, 5 lines, 35 tokens) | 6 clusters fixed | A shared temp-folder test helper, a jev failure helper and merged omp effort cases. The synced copies of `shared/` are excluded by design. |
| Long Files | PASS, 1 documented | Longest source file 255 lines. `register.test.ts` has 481 source lines, from 471 before the heist. |
| Test Coverage | 94.93% to 97.55% lines, 89.6% branches | New tests for drift recording, missing keys, the settings fallback and the review fixes. The Claude mod has no coverage tool. |
| Clean Architecture | no formal layers | Imports run from the entry points to routing to the pure core. The core has no I/O. |
| Clean Code | 1 fixed | The Agent handler moved the Jev request and the deadline race into helpers. Engine calls stay in the handler, so the surface is unchanged. |

### Documented Exceptions

- `plugins/model-router/tests/register.test.ts` — copy/paste, 7 clusters, and length, 481 lines. All 7 clusters exist on main. The heist changed only the decision-line strings and the 529 test, which the contract limits. [Don acknowledged: pending]
- `plugins/model-router-omp/tests/helpers.ts:1` and `scripts/temp-root.ts:1` — copy/paste, a 10-line import list. The omp plugin's tests must not import from the repository's scripts. [Don acknowledged: pending]
- `.github/workflows/evals.yml` — supply chain. `bun install -g` resolves omp's transitive dependencies unpinned, in the step that holds the eval keys. [Don acknowledged: pending]

## Final review

The inspector's verdict was APPROVE WITH CONCERNS: 1 high, 2 medium and 7 low findings. All were fixed except the supply-chain risk above and the medium finding on `max`. The high finding was owner-setup facts in this folder. They are removed here and from issue 33. Amendment A5 records the omp settings reads. A ceiling at `high` that the review asked for was reverted by the Don: a level's name means a different point on a five-level scale than on a three-level one.

## Open

- The recorded-fixtures pull request after the first dispatched eval run on the release.
