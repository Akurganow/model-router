---
heist: multi-harness
phase: the-hit
status: in-progress
timestamp: 2026-10-21T00:00:00Z
next-action: Continue Hit
completed-wps: [WP-01 (items 1-4), WP-02, WP-03, WP-04, WP-10 (G2 passed), WP-05, WP-06, WP-07, WP-08, WP-09, WP-11, WP-12, WP-13, WP-14, WP-15, WP-16, WP-23 (omp catalog), WP-24, WP-25, WP-26, WP-27, WP-28, WP-29]
pending-wps: [WP-30]
lapsed-wps: [WP-01 item 5, WP-17..WP-22, WP-23 Codex catalog, the Node 22.18 CI step and the Codex docs parts]
failed-wps: []
notes:
  - G1 (codex-cli 0.163.0): v1 passed, with gpt-5.6-luna as the only visible v1 parent. v2 failed: message reaches the hook encrypted, and v2 spawns fork by default, where Codex ignores a rewritten model. The probe also showed that ~/.codex/.env does not reach hooks, plugin hooks are off by default, and only the interactive CLI shows the hook's system message. The Don deferred Codex for this release despite the v1 pass; contract amendment A1 records the override. The "If G1 fails" path applies, and issue 33 records the findings and the revisit condition.
  - prepareBrief gained a budget; omp context uses it (no duplicated cut).
  - The omp catalog carries the plugin version; set-version and the sync check cover it.
  - The sync check now fails on a missing copy or manifest.
  - G2 passed. jev-latest answered as jev-1.13.0, jev-preview as jev-1.14.0. Both reached tier 90% (19/21) and work 90% (19/21) against the 85% bar.
  - omp 18.2.8 end to end: the plugin installs from the local catalog into a throwaway home. With the extension and the router agents loaded, a task item with agent "task" was routed to router_light (L0, med), and the decision line reached stderr. The subagent answered correctly. The eval adapter parses the real stream correctly.
  - Left to itself, omp's orchestrator chose the bundled scout agent. The Don's rule: the router never overrides an agent, model or effort that the harness, the orchestrator or the user chose, as in Claude Code. So scout and every named agent pass through, and only task or an absent agent is routed. The omp eval case asks for the task agent.
  - The Don allowed deferring Codex only. The omp follow-ups came back into the heist: the extension reads task.enableEffort and task.maxEffort through `omp config get`, writes no effort in omp-auto mode or when the settings are unreadable, and shows the applied level (for example med→medium). The custom task agent check follows the profile's agent folder. model-choice.md bases the omp ladder on the Claude Code sources. Live omp runs confirmed both modes: auto wrote no effort, and router mode ran the child at medium for med.
  - The setup skill's omp config commands (path, modelRoleStorage, modelRoles get and set, task.enableEffort, task.maxEffort, task.disabledAgents, task.batch) work in a throwaway home and write only the roles and the two effort settings. The model-driven interview itself still needs a throwaway home with provider auth.
  - AC-13 for omp: the setup skill ran end to end in a throwaway omp profile with provider auth. All ten steps passed, each write asked for consent, and only modelRoles, task.enableEffort, task.maxEffort and MODEL_ROUTER_JEV in the profile's .env were written. Both probe spawns were routed: auto mode showed `auto`, router mode showed `med→low` on a four-level model.
  - That run showed omp maps med to the lower middle level on an even count. The Don's rule: the light tier never runs at the model's lowest level; when med lands there, the router asks for hi, unless the user's cap pins hi there too. Mid and heavy keep omp's mapping.
  - AC-13 dry runs need model access in a throwaway harness home; schedule with the Don.
---
