---
heist: multi-harness
phase: the-hit
status: in-progress
timestamp: 2026-10-21T00:00:00Z
next-action: Continue Hit
completed-wps: [WP-01 (items 1-4), WP-02, WP-03, WP-04, WP-10 (G2 passed), WP-05, WP-06, WP-07, WP-08, WP-09, WP-11, WP-12, WP-13, WP-14 (dry run pending), WP-15, WP-16, WP-23 (omp catalog), WP-24, WP-25 (Claude and omp; Node 22.18 step waits for G1), WP-26 (Claude and omp; Codex parts wait for G1), WP-27, WP-28]
pending-wps: [WP-01 item 5 (G1), WP-17..WP-22 (G1), WP-23 Codex catalog (G1), WP-29, WP-30]
failed-wps: []
notes:
  - prepareBrief gained a budget; omp context uses it (no duplicated cut).
  - The omp catalog carries the plugin version; set-version and the sync check cover it.
  - The sync check now fails on a missing copy or manifest.
  - G2 passed. jev-latest answered as jev-1.13.0, jev-preview as jev-1.14.0. Both reached tier 90% (19/21) and work 90% (19/21) against the 85% bar.
  - omp 18.2.8 end to end: the plugin installs from the local catalog into a throwaway home. With the extension and the router agents loaded, a task item with agent "task" was routed to router_light (L0, med), and the decision line reached stderr. The subagent answered correctly. The eval adapter parses the real stream correctly.
  - Left to itself, omp's orchestrator chose the bundled scout agent. The router leaves it alone by design, because swapping it would drop scout's prompt and tools. The omp eval case now asks for the task agent. Routing bundled specialist agents needs an issue.
  - The setup skill's omp config commands (path, modelRoleStorage, modelRoles get and set, task.enableEffort, task.maxEffort, task.disabledAgents, task.batch) work in a throwaway home and write only the roles and the two effort settings. The model-driven interview itself still needs a throwaway home with provider auth.
  - AC-13 dry runs need model access in a throwaway harness home; schedule with the Don.
---
