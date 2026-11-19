---
kind: dismissal
departments: []
issue: 13
date: 2026-11-18
finding: src/model.ts::pickTier::required
---

The finding is dismissed.

Issue: https://github.com/Akurganow/model-router/issues/13

Title of the lead:
~~~
Tidy hooks/router.ts: String() lookups, unused exports, tie-break
~~~

The comment of the decider who closed the lead, written 2026-11-18T13:58:38Z:
~~~
Closing as obsolete, checked at a72c257 (v0.22.1). `hooks/router.ts` no longer exists: the sources moved to `src/`. None of the three items has a target left: no `String()` wrapper remains on a probability lookup in `src/core/`, and `TIE_MARGIN`, `WORK_PRIOR` and `pickTier` are gone (`git grep -cE 'TIE_MARGIN|pickTier|WORK_PRIOR' -- src scripts` finds no file). The pick rule is now `fromMiddle` in `src/core/part.ts`.
~~~
