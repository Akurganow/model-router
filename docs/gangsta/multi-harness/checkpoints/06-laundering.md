---
heist: multi-harness
phase: laundering
status: completed
timestamp: 2026-10-21T00:00:00Z
next-action: Heist complete. Merge pull request 39. The recorded-fixtures pull request follows the first dispatched eval run on the release.
artifacts:
  - docs/gangsta/multi-harness/specs/2026-10-21-contract.md
  - docs/gangsta/multi-harness/plans/2026-10-21-execution-plan.md
  - docs/gangsta/multi-harness/recon/2026-10-21-recon-dossier.md
technical-debt-audit:
  copy-paste: 18 clusters fixed; 0 left in source
  long-files: PASS; register.test.ts split by theme
  test-coverage: 94.93% to 97.49% lines (node coverage over shared, scripts and omp, tests excluded)
  clean-architecture: no formal layers
  clean-code: 2 fixed (register.ts handler, dead omp test scaffolding)
  documented-exceptions: none
---

# Laundering

## Verification

- `npm run check`: tsc, sync check, evals selftest, 199 node tests, biome. Pass.
- `claude plugin test plugins/model-router`: 26 pass.
- `claude plugin validate --strict plugins/model-router`: pass.
- `node scripts/check-surface.ts`: the mod's surface matches `tools/surface.json`.
- Identifier scan outside `docs/gangsta/`: no matches.
- CI on the pull request: check on Ubuntu and macOS, policy scan and dependency review pass.

## Technical Debt Audit

| Sub-check | Result | Details |
|-----------|--------|---------|
| Copy/Paste (jscpd 4.0.5, 5 lines, 35 tokens) | 18 clusters fixed, 0 left | A shared temp-folder test helper, a jev failure helper and merged omp effort cases. The Claude mod's tests share one harness and table-driven cases. Its router tests keep only the effort ladder, because `shared/core*.test.ts` covers the scoring on the byte-identical copy. Four masking cases moved there. The scan covers `plugins`, `scripts` and `shared`. The synced copies of `shared/` are excluded by design. |
| Long Files | PASS | Longest source file 255 lines. `register.test.ts`, 481 source lines, is split into `register`, `keys` and `failures` tests over a shared `harness.ts`. The longest is 109 lines. |
| Test Coverage | 94.93% to 97.49% lines, 89.2% branches | New tests for drift recording, missing keys, the settings fallback and the review fixes. The Claude mod has no coverage tool. |
| Clean Architecture | no formal layers | Imports run from the entry points to routing to the pure core. The core has no I/O. |
| Clean Code | 2 fixed | The Agent handler moved the Jev request and the deadline race into helpers. Engine calls stay in the handler, so the surface is unchanged. The omp test world lost a temp folder, a HOME override and a cwd that no code read since the extension stopped reading files. |

### Documented Exceptions

None. The evals workflow installed omp's dependencies unpinned. `evals/omp/bun.lock` now pins omp and every package it pulls in by digest, and the install runs no package scripts. The Don kept the pinned client versions that the contract requires.

## Final review

The inspector's verdict was APPROVE WITH CONCERNS: 1 high, 2 medium and 7 low findings. All were fixed except the medium finding on `max`. The supply-chain risk was fixed in Laundering by a lockfile. The high finding was owner-setup facts in this folder. They are removed here and from issue 33. Amendment A5 records that the omp extension reads no command, file or variable but the TypeSafe key. A ceiling at `high` that the review asked for was reverted by the Don: a level's name means a different point on a five-level scale than on a three-level one.

## Don's verdict

The Don declared the heist complete on 2026-10-21 and asked for the merge.

## Open

- The recorded-fixtures pull request after the first dispatched eval run on the release.
