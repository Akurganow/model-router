# Changelog
All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

- - -

## v0.22.1 - 2026-11-14
#### Bug Fixes
- drop promises about the model that ran from the setup skills (9c8052a)
- keep the setup skills to the plugin's own facts (4cbfe77)
- give an omp role when omp has a model for it, and name the middle role midl (c62195c)
- state the goal and every fact in the setup skills (0f78cb3)
- set the model the user named without checking that it runs (5440a38)
#### Documentation
- remove the model check from the OpenClaw and Hermes privacy policies (3a4d112)
- describe the omp role rule and the midl role (19284ee)
- drop the API-key advice from the OpenClaw README (b4f5638)
- drop the slot check from the documents (2a31e4d)

- - -


## v0.22.0 - 2026-11-13
#### Features
- add a Models step to the setup skills (63f0ee2)
- check every Hermes slot before Node and keep the model of one with none (6739cf4)
- give a pinned Hermes level with no model the harness model and a label (c840186)
- add a middle model slot and keep the harness model for a slot with none (3271827)
#### Bug Fixes
- end the skills' model steps and escalation on a slot with no model (d4b1e1b)
- drop the two-slot text from the setup skills (2bc8527)
- say the plugin sets the effort unless the user sets one (30158ab)
- check only the slot the level picks, and report the configured models (29394e4)
#### Documentation
- limit the slot rule to scored tasks and an effort the user did not set (a6ac427)
- say that a skill step replaces a tool for what the harness owns (471158b)
- say where an omp user sets the three roles (9ec22f6)
- take the omp and OpenClaw model setup back out (ff40ad8)
- take the Hermes model list back out (151c737)
- record the OpenClaw closed-schema run and a listed unresolved model (f1be277)
- describe how Hermes lists the models for the three slots (78568fd)
- describe how omp and OpenClaw set the three models (2432a09)
- fix the review findings on the three model slots (c94f29a)
- describe the three model slots and the rule for a slot with no model (eb06c61)
- say that the final pull request into main is the size-limit exception (f143a14)
- correct the Hermes slot check facts in the client notes (9266009)
- say that a split change exceeds the size limit (7723348)
- describe the integration branch for changes that release whole (161844a)
- add the rules for agents in AGENTS.md (2568be7)
- state the rule of core/reasons.ts as the file keeps it (175128a)
- say that Biome enforces the import directions (0a1b599)
- keep the test-double row of the layout table within 80 characters (ee47ec4)
- state what the layout test checks and where code and test doubles go (8861d15)
- state the rule of core/reasons.ts in its header (4d7bc54)
- tell the request timeout from the routing limit (b86fb0d)
- name the current files in comments (32027c4)
- describe the three layers of src/ (04bc027)
- name the provider failures as the plugins print them (997861d)
#### Tests
- say what the OpenClaw router skip tests check (5b0927e)
- assert the exact result of the middle level in openclaw (ba848b7)
- pin the OpenClaw key read order for openrouter-first (f545290)
- keep an empty key in collectKeys (6707d8d)
- assert that the omp dialog reads nothing without a UI (150dbaa)
- pin the hermes provider help to its exact text (37e9586)
- pin the dialog options for a stored non-default omp value (927f264)
- cover blank and null subagent thinking in openclaw gates (49ec4f2)
- cover blank and null target subagent models in openclaw gates (89719f1)
- feed blank and null values to the omp model gates (565538d)
- say which tests each OpenClaw fakes file serves (187800d)
- prove the Biome layer rules fire (aebc57f)
- check only where the files of src/ sit (fb02fd4)
- drop three import checks that biome.json now enforces (5517c40)
- use SUFFIX in the omp ladder test (5c35cbf)
- drop the description assertions an exact-text assertion already implies (d1ca7ed)
- name the Hermes fixtures that cover the level and slot rows left out (1e6e442)
- state the rule above the set-value rows of the omp and OpenClaw gate tests (b01e2b7)
- move the omp and OpenClaw test doubles into the adapters' fakes files (27f31f9)
- keep the Claude Code report rows for nothing stored and for an openrouter key (161396b)
- one table of shared reasons drives the equality checks and the scan (fdb7e07)
- Claude Code settings report keeps the rows that change the adapter's input (0e8c286)
- Claude Code config tests share flush, one dialog-failure loop and one log helper (ee93d47)
- Claude Code engine doubles live in claude/fakes.ts (5d98d68)
- routedCall takes one options object and builds replies from jevAnswer (461dc89)
- OpenClaw plans with the configured provider value (04ad7af)
- the Hermes budget running out aborts the request in flight (f291ecb)
- a host cancel in Claude Code aborts the Jev request (ba71b6b)
- omp scores through streamedFetch (44ddc8d)
- keep the fixed skip reason texts beside the reasons tests (46b2873)
- keep the Hermes tool description text beside the Hermes texts tests (cd9b7dc)
- cut the Jev request test to the cases no adapter test holds (7f9e35f)
- keep the OpenClaw deadline floor beside the registration tests (1b5dc91)
- keep the omp deadline floor beside the deadline cases (31730f6)
- keep the OpenClaw report and text cases beside the config tests (321fa9c)
- keep the omp dialog cases beside the config tests (8ae3342)
- keep the Claude Code dialog cases beside the config tests (d80a384)
- keep the Hermes level-model cases beside the route tests (9dbd861)
- keep the OpenClaw level-model cases beside the router (6e01458)
- keep the omp level-role cases beside omp scoring (45731b8)
- keep the OpenClaw set-value cases beside the gate (9c09c90)
- keep the omp set-value cases beside the gates (dba1bba)
- keep the omp key cases beside the key reader (30e27da)
- keep one copy of the omp throws and unreadable helpers (752f627)
- keep the OpenClaw key cases beside the key reader (f5e3511)
- keep the Claude Code key cases beside the key reader (347e748)
- keep the omp per-item line cases beside omp scoring (e68ce32)
- keep the Claude Code suffix cases beside the Claude Code router (fedfc9f)
- drop the suffix cases that core/compose.test.ts holds (91da3c7)
- say what the cross-adapter tests pin (07b38c9)
- keep the Claude Code decision cases beside the Claude Code adapter (3639067)
- drop the streamedFetch cases that utils/fetch.test.ts holds (2cbf8b0)
- build the Claude Code host through routedCall (0d14f99)
- move the omp settings reader tests beside adapters/omp/settings (e13b5e4)
- rewrite the settingsReport unit tests for the key record (ed61d82)
- drop the settingsReport case with no key lines (181eba6)
- drop the tooShort unit cases (0aed0af)
- drop the tier-only decide tests (110a2cf)
- drop the tests of the sync key collector (ddbf783)
- move the narrow test beside the omp gates (9a54fe0)
- move the project-override test beside the omp config (923d769)
- move the key answer tests beside the omp key dialog (f66a1b4)
- move the refusal test beside the Claude Code config (fe9ffd3)
- move the slot tests beside core/slots (ee2aa0d)
- scan every shared reason text (eebb926)
- check the layers of src/ with the TypeScript parser (1d8502d)
- stop pinning that a failed dialog rejects chooseValue (ee57f01)
- pin the no-answer line of a Claude Code dialog that resolves nothing (1474d96)
- exempt only core/reasons.ts from the reason scan (07d7243)
- stop pinning the Hermes manifest digest (7ed5322)
- pin the read-only tool texts of OpenClaw and Hermes (e956fa9)
- pin the config dialog and the settings report (afc05f3)
- pin that config calls run one at a time (cfb4820)
- pin the keys each adapter reads (a29232a)
- pin the Jev request and line of each adapter (78c9bb1)
- pin the slot and model each level takes (2c8c624)
- pin when omp and OpenClaw count a model as set (1a23c48)
- pin the deadline floor of omp and OpenClaw (be0aefb)
- keep core, utils and each adapter apart (b950aab)
- read the whole source tree in the reason scan (fe852f4)
#### Build system
- move three import checks of the tests into biome.json (cf5e12c)
- check two import shapes with Biome plugins (bccd920)
- enforce the import directions with Biome (05a86be)
#### Continuous Integration
- review pull requests into integration branches (620df8f)
#### Refactoring
- (**src**) move the Claude Code routing out of its entry (fb43020)
- (**src**) move the omp settings readers to adapters/omp/settings (6ee4b27)
- (**src**) name the tier and work text files for what they hold (a44f522)
- (**src**) share the positive-number test in src/utils (a2e2b88)
- (**src**) let settingsReport print the key states (bd542b8)
- (**src**) compare the deadline with its floor in place (bb4b8d2)
- (**src**) name the reply parser of compose (70f9b99)
- (**src**) drop the tier-only decide overload (9cd8e22)
- (**src**) keep one async key collector (fe6d799)
- (**src**) drop the adapter map from the settings comments (4bec7df)
- (**src**) keep narrow in the omp gates (7fa1d3f)
- (**src**) keep projectOverrides in the omp config (be904ff)
- (**src**) keep the key answer rules in the omp key dialog (bfee492)
- (**src**) keep REFUSED in the Claude Code config (276fd22)
- (**src**) name the request failure reasons in core/reasons (3a862cb)
- (**src**) move the slot logic to core/slots (d17ed8d)
- (**src**) give the shared skip reasons one home in core/reasons (f1878a3)
- (**src**) move NODE_NOT_FOUND to the Hermes texts (dc08ff6)
- (**src**) let chooseValue treat a failed dialog as no answer (41ee01a)
- (**src**) type the abort reason of raceDeadline (258f8ef)
- (**src**) keep HOOK_TIMEOUT_MS inside the OpenClaw entry (24318d9)
- (**src**) drop the unused SettingName type (d7c931b)
- (**src**) drop the exports nobody imports (ee531dc)
- (**src**) build the shared tool texts once in core/settings (03eba13)
- (**src**) share the value dialog and the settings report (83765db)
- (**src**) share the one-call-at-a-time queue in src/utils (e9b7cd0)
- (**src**) collect the provider keys in core/provider (4ce73cb)
- (**src**) ask Jev for tier and work through one core function (d1148ad)
- (**src**) read each level's slot and model through core/reasons (a473270)
- (**src**) share the set-value check in src/utils (4e2bcb5)
- (**src**) share the deadline floor and fold the OpenClaw re-export away (feea8a5)
- (**src**) move the general helpers into src/utils (7fb7d51)
- (**src**) move each file into core, utils or its adapter (dbb2bc8)
- read the omp eval line with a regex literal (24a31e4)

- - -


## v0.21.0 - 2026-11-12
#### Features
- (**omp**) set the routed effort on a subagent (f52368b)
#### Bug Fixes
- (**omp**) read task.enableEffort whenever the effort is planned (8427ffe)
- (**omp**) count a pattern's level at level 1 only, and an item's effort only while omp applies it (effe85b)
#### Documentation
- (**omp**) record the live runs of the routed effort (4504616)
- (**omp**) document the routed effort and omp's thinking levels (2d2a604)
#### Refactoring
- (**omp**) drop an unused spawn field (51fa30e)
#### Miscellaneous Chores
- (**evals**) let a later omp entry for the same item replace the batch entry (a729274)

- - -


## v0.20.1 - 2026-11-12
#### Bug Fixes
- mask long URL credentials, keep text after a quoted header, close fences only at a real closer (d27bb1f)
- close the redaction gaps the review found, and type the routing state (45b3cc9)
- mask the call's one-line description like the task text (cc8b244)
- mask more secret shapes and condense tilde fences in linear time (c1039f9)
#### Documentation
- say how a fence closes, where a quoted credential ends, and that URL credentials have no length limit (d602371)
- list the masked shapes in the code's order and as the code masks them (f9fab9d)
- one list of masked shapes, linked from the READMEs and policies (5e26204)
- name the two omp pins once in clients.md (6a03c69)
#### Continuous Integration
- the omp load check answers once when a kill fails (5e20ccf)
- the omp load check survives an early exit and stops omp (e4fa656)
- leave the minimum omp pin to a person and guard the evals pin (8bd8983)
- title Renovate bumps of CI-only pins ci, so they release nothing (ee8e709)
- test omp at the minimum and at the latest release (5592261)

- - -


## v0.20.0 - 2026-11-12
#### Features
- (**hermes**) let the delegating model describe a task and pin its effort and level (dada28e)
#### Bug Fixes
- (**hermes**) mask and cut a task's description before it goes to Jev (39064cb)
#### Documentation
- (**clients**) record a Hermes turn that fills the task parameters (abadc9b)
- (**hermes**) the escalation skill stops when the delegation effort holds (208103b)
- (**hermes**) one precedence table, a masked description, and a clear escalation ladder (fd04743)
- (**hermes**) state the task parameters, what a task cannot show, and the fallback chain (8b30fae)
#### Refactoring
- (**hermes**) rank the kept effort in Python only (fac903e)
- keep the caller effort label in src/reasons.ts (81e17f5)

- - -


## v0.19.3 - 2026-11-12
#### Bug Fixes
- (**omp**) count the scoring deadline from the handler's start (6693c3f)
- (**omp**) fit the scoring limit to the tool call timeout (46cd0c9)
- (**omp**) report a decision dropped at spawn time (2315bb5)
#### Documentation
- (**omp**) say the spawn-time line follows the batch line, and when the limit starts (0d88c30)
- (**omp**) document spawn-time skips, the timeout rule and the tool_call cost (9922f01)
- (**omp**) say why itemCheck keeps its scope check (a7d23c6)
- say what to set after a refit on another Jev model (8325a36)
- name the Jev fit warning in the calibration section (fdb9aab)
#### Refactoring
- (**omp**) scoreItems takes its deadline from every caller (f6c4d3b)
- (**omp**) the store hands back the item's index with its decision (4f5bdd0)
- (**omp**) one function turns the timeout setting into a budget (0ec2aa5)
#### Miscellaneous Chores
- amend the Lawman constitution to version 4 (28b5dd2)
- derive the Jev models in the fit tests and name FITTED_ON in the warning (a1086c6)
- warn when Jev answers as another model than the factors were fitted on (b40319d)

- - -


## v0.19.2 - 2026-11-12
#### Bug Fixes
- (**openclaw**) log a line at the routing limit and on a cancel (255b2ed)
#### Documentation
- (**openclaw**) say the plugin had not finished routing, and link the Codex fact (a8ff6a6)
- (**openclaw**) document the timeout and cancel lines and the hook facts behind them (06bbc06)
#### Tests
- (**openclaw**) abort the hook's signal after a routed line (4c31ebe)
#### Refactoring
- (**openclaw**) arm the spawn line writer inside routeSpawn (c1fb782)

- - -


## v0.19.1 - 2026-11-11
#### Bug Fixes
- the routed-effort store drops the least recently used subagent (61fc1e4)
- a resumed Claude Code subagent keeps its routed effort (bc152f8)
#### Documentation
- (**omp**) the task-only choice needs the effective scope at core, which a project's scope overrides (eda98a3)
- record that a resumed Claude Code subagent stays on its routed model (e74e903)
- rewrap the level 1 paragraph in model-choice.md (bfdc968)
- record the Claude Code subagent events the adapter relies on (a1de08d)
- level 1 wording matches what each harness does (4b949a0)
- the Claude Code README says a resumed subagent keeps its routed effort (502ff6b)
- a rule for paid runs, and the Claude Code eval on haiku (ba057b8)
- a 32 KB palette icon and a shorter banner alt text (14bae62)
- a Gamayun banner under the README badges and a matching plugin icon (1183212)
- a skip line names both providers after both providers fail, not after two requests (3aada7a)
- a neutral shared providers page, the true retry rule, and README wording restored (0da96a6)
- one copy of each passage the plugin docs share, in docs/providers.md (31fceb4)
#### Continuous Integration
- a merge reuses the head's verdict only after a scan job on the head succeeded (e54b235)
- the policy scan runs on Sonnet 5.5 (47ebe60)
- the policy scan runs on Haiku 5.5 (6738228)
- each push to main gets its own policy scan group (e06096e)
- the policy scan skips drafts, cancels stale runs and reuses the head's verdict on merge (0ff4e08)
#### Refactoring
- one helper each for the slot of a level, the error text and the line parts (5da8aca)
- the provider list sits beside the key variables, and OpenClaw reads the shared level-to-slot table (6edc7b6)
- one home for the tool name, the command names, the line prefix and the fake clock (5b4f8d8)

- - -


## v0.19.0 - 2026-11-06
#### Features
- (**hermes**) a read-only settings tool, a provider command for local sessions and a setup skill (95179f7)
- (**hermes**) route each delegate_task task through a Python delegation provider that never refuses a task (85fbea5)
- (**hermes**) decide each delegated task's route in a Node program and build the Hermes plugin files (0f2d36e)
#### Bug Fixes
- (**hermes**) a repeated log line counts as the most recent, so the once-log drops the oldest (fa27627)
- (**hermes**) pass SYSTEMROOT to Node, which Windows needs in a replaced environment (65de158)
- (**hermes**) require Hermes 0.22.6, the first release with the function the offline slot check imports (f6fd2a1)
- (**hermes**) a failed score or a bad budget reads failed, and a slot check out of time reads timeout (ebdf4c3)
- (**hermes**) an OpenRouter slot passes the offline credential check, as Hermes resolves OpenRouter outside its provider registry (af583e7)
- (**hermes**) the scoring request goes through the proxy that the environment names (6ef6d01)
#### Documentation
- (**hermes**) name the proxy variables that turn Node's proxy support on, and keep the full rule in the README (0d55ac8)
- (**hermes**) record the live run after the protocol keyed the models by slot (221c490)
- (**hermes**) a keys table, the backend warning beside the install block, and one copy of the sample label (9e98a5d)
- (**hermes**) one copy of the skip reasons, the backend on at install, and the Hermes floor, credential and Windows facts (e4a23b7)
- (**hermes**) record the live run that routed a real call in process and in the plugin host (fff4f26)
- (**hermes**) install, setup, routing, privacy and the client facts behind them (dc712b0)
#### Tests
- (**hermes**) the config tool's output ignores key length, and the provider command runs through Hermes's dispatcher (7aac5a5)
- (**hermes**) the catalogue test reads a written disk cache, and installs_held has a test of its own (0ca4d40)
- (**hermes**) call each Hermes function the shim uses on the real Hermes, so a rename fails CI (359ecee)
- (**hermes**) mask a key-variable string in the task, which the owner-setup scan does not read as a key (3523e08)
- the runner-context guard sees past a blank line in a job's env (2ca4255)
- read the Hermes pin groups through a typed match (379591f)
#### Build system
- carry the merged version into the Hermes plugin manifest (a5a74a3)
#### Continuous Integration
- set the Hermes home in the hermes job's first step, as a job env cannot read the runner context (8e666f0)
- Renovate raises the uv that setup-hermes installs, with the actions and after the age rule (f665402)
- test, validate and install the Hermes plugin against the latest Hermes release, pinned by tag and commit (89fe7c4)
#### Refactoring
- (**hermes**) the Node protocol keys models by slot, drops the level and returns finished lines (3aea73a)
- keep the tool name in the OpenClaw config and the provider list in the Hermes request (a3b3f1b)
- one source for the skip reasons, the line prefixes and the timer clock that more than one adapter prints (be36528)

- - -


## v0.18.1 - 2026-11-06
#### Bug Fixes
- a seance item with a model keeps the seance reason, and the item model check runs inside the item check (5d6f8ea)
- an omp task item that sets its own model is skipped, so its spawn keeps that model (4cdfc24)

- - -


## v0.18.0 - 2026-11-06
#### Features
- (**omp**) read and write the settings under the installed package name (0409ad7)
- (**openclaw**) route OpenClaw subagent spawns to the small or large model and an effort (686f068)
- (**openclaw**) decide which subagent spawns are routed, with which role and effort (f84d7e8)
- build the OpenClaw plugin and one npm package for OpenClaw and omp (3b3d0ef)
#### Bug Fixes
- the OpenClaw hook registers in the discovery pass too, so a chat turn scoped to that registry routes its spawns (af4a171)
- the OpenClaw setup skill goes on past an unset key and reads only the new log line, and the docs state the SecretRef and publish limits (b7c6b6a)
- the OpenClaw tool and commands register in the discovery passes, and the docs match the live test (5e8feac)
- the manifests say the one-line description or label goes unmasked, and the pack test reads npm 12's output (de2e487)
- an OpenClaw host abort settles even when cancelling the timer throws, and the setup skill says what an environment key reaches (eabd016)
- omp and Claude Code send the batch context as written again, and an OpenClaw host abort settles the hook at once (5eb932d)
- OpenClaw reads spawn parameters as its sessions_spawn tool does, and carries the config in the route (da2a580)
- a whitespace-only key counts as unset in Claude Code and omp, and every key is sent trimmed (76bfce2)
- one term and one copy per passage in the OpenClaw docs and skills, with the facts behind them (721635a)
- OpenClaw agent lookup by normalised id, owner check on channel commands and a handler that never throws (96108a9)
- one OpenClaw install recipe, absolute links in the npm tree's skills and no enum in the OpenClaw config schema (d2df649)
#### Documentation
- state the contract of each branching function the OpenClaw, builder and CI change touches (a70282e)
- the OpenClaw install starts with its commands, a missing line is checkable at default logging, and no pointer loops (166224b)
- one row per harness in the root table, a linear OpenClaw install path and one place for each OpenClaw passage (44fb388)
- name the OpenClaw plugin and the npm package on every repository surface (660a9b1)
- describe the OpenClaw plugin, its privacy policy and the OpenClaw client facts (f488381)
#### Tests
- add the OpenClaw plugin API types and a typed fake of them (f239e34)
- pin the decision lines, the effort ladder and the streamed fetch (ab1c575)
#### Build system
- a full CI sentence and a review warning for the OpenClaw install region, and the license exemption in CONTRIBUTING (ea59fa1)
#### Continuous Integration
- turn off git's automatic maintenance in the policy scan job (e14435a)
- say why json-schema-typed stays in the license exemption (669d639)
- exempt by name the OpenClaw packages of the CI install whose license is off the list (a72779b)
- allow the minimatch advisory of the CI OpenClaw install (ae85a5b)
- allow the one glob advisory bundled in npm 12.2.2 of the CI OpenClaw install (bf1103b)
- override OpenClaw's npm with 12.2.2 in the CI install, an exception to the 14-day rule (28420f4)
- override npm and zod in the OpenClaw install for their advisories (9a150a8)
- keep OpenClaw's npm off the PATH and read both pack output forms (a93f102)
- pack and install the npm package in pull requests, and publish it from releases (68e1643)
#### Refactoring
- one key-variable table and one trimmed text check, and omp reads under its catalogue name as a fallback (c4ef0ab)
- keep the settings unreadable reason with the shared wording (ed66bcf)
- move the effort ladder, the decision line and the streamed fetch into shared modules (c6b7593)

- - -


## v0.17.0 - 2026-11-06
#### Features
- shared decision modules for every adapter, omp settings under the installed package name, and trimmed keys (627d13d)
#### Documentation
- state the contract of each branching function the shared and omp change touches (e4598be)
- document the contract of each function this change touches (a01dcef)
- give the scan command its --base argument in CONTRIBUTING (9f45fad)
- name the two claude lines in the README setup opener (ab2d2e8)
- state what the checks guarantee and cite every client fact (686dac2)
- state the omp upgrade scope as its documentation does (3cfac8a)
- describe the metadata source and the new CI checks (bdf1127)
- add the client facts and the reasons for the build (8b55220)
#### Tests
- copy only regular files in the hook test and bound each hook below the timeout (8cbcbb5)
- wait for the second omp dialog by condition, not by a tick count (4ef04c1)
- keep the scan test's sample file in a temporary folder (75f36d5)
#### Build system
- scan from the merge base with origin/main when no --base is given (31aacb1)
- keep every output path in scripts/build/outputs.ts (a496d36)
- fail the scan on unreadable headers, escaped Windows paths and git errors (d970d6f)
- link each README install section to its setup steps (3817d38)
- hold the source texts, the schema and the version line to the code (8037c2d)
- tighten the owner-setup scan and keep the output list in one module (af441a6)
- scan the last commit when the base is not in the clone (7921436)
- write the version into metadata/source.json (74859b7)
- generate the README install region from the metadata (d92cc04)
- list the generated files and scan them for owner-setup facts (45bc494)
- render the manifests and catalogues from metadata/source.json (2883d64)
#### Continuous Integration
- run the tests through one npm test script (8ad7d03)
- time-limit the tests and validate the plugin in the install job only (37e2da3)
- check the generated files, install both plugins and scan each change (620f72f)

- - -


## v0.16.1 - 2026-11-05
#### Bug Fixes
- send one fixed role for each harness's default agent (f5e7784)
#### Documentation
- state the agent text rule inline and the measurement bases (a6399fc)
#### Refactoring
- name the default-role agents and share the Claude test fake (2ea4c03)
#### Miscellaneous Chores
- exclude the built bundles from CodeRabbit review (f343a5f)

- - -


## v0.16.0 - 2026-11-04
#### Features
- (**scripts**) measure default-level threshold rules (c8e595d)
- stay at the middle level unless an end is clearly more likely (f089899)
- compare decision rules offline on recorded probabilities (543a588)
- extend the calibration set and record per-case probabilities (90d6c29)
#### Bug Fixes
- address review findings on routing and the rule scripts (b30f5e4)
- keep env effort, skip other plugins' spawns and stop leaking routing state (e538032)
- route the subagent model at agent.spawn and its effort at turn.step (d9ffa6b)
#### Documentation
- state the 12,000-character task cap in the install descriptions (bbe4e8d)
- describe the middle-default rule and the grown calibration set (df959f5)
- describe routing at agent.spawn and turn.step (c701e4b)
- amend the Lawman constitution to version 2 (dcacf2d)

- - -


## v0.15.0 - 2026-10-24
#### Features
- add the scope option (7f24c57)
#### Bug Fixes
- state the description cap and key exposure in the install text (1dc122e)
- send the agent's description as the Jev role (e23def3)
#### Documentation
- qualify extended routing and the desktop key buttons (377b7bb)
#### Tests
- share repeated setup across the scope and config tests (710824b)

- - -


## v0.14.0 - 2026-10-23
#### Features
- add a model-router-setup skill to Claude Code and a provider step to both (1aa6424)
- score through Jev on TypeSafe or OpenRouter in both plugins (339f87a)
#### Bug Fixes
- give the command hook a literal matcher so the surface check reads it (3d47913)
- read key variables in a top-level function so plugin validate accepts it (e10140f)
- name each key variable literally so plugin validate accepts the mod (722d278)
- skip a failed provider for omp items that start while another falls back (25a99f1)
#### Documentation
- say an omp batch can send fewer requests than routed items (a3a93ed)
- say Jev runs on TypeSafe or OpenRouter in the README intros (4e37716)
- describe the OpenRouter provider in the READMEs and privacy pages (96c0936)
- link the routed-call conditions from How it works (a0b5c5d)
- rework the README into a landing page for both clients (a64f039)
#### Tests
- drive the thrown config.set error through the test kit itself (d70cc5e)
#### Miscellaneous Chores
- reject surplus calibrate arguments before reading the key (de14cd6)

- - -


## v0.13.0 - 2026-10-22
#### Features
- BREAKING: route omp's bundled task agent by model role, not agent copies (eda2d57)
- BREAKING: route only built-in agents in Claude Code through the TypeSafe SDK (ba1fa86)
- send one TypeSafe request per task with the parts an adapter asks for (00dacf3)
- create the TypeSafe SDK client per routing call (d3773cf)
#### Bug Fixes
- (**calibrate**) print the redacted head of a case (4757e96)
- forget earlier agent offers when Claude Code registers the hook again (acdb571)
#### Documentation
- (**omp**) describe role routing, the gates and the setup checks; move to omp 18.12.6 (f47edbb)
- keep the API key out of the request body list (304feb3)
- state the Claude Code version the mod needs and drop an unreachable omp skip reason (a3c29fb)
- drop the omp effort ladder and state the in-memory routing state (33c18bc)
- state what the SDK sends and credit the bundled SDK (842a398)
- describe built-in routing, precedence and the SDK in Claude Code (d5a0928)
#### Tests
- (**evals**) prove omp routing by its decision line and drop the drift record (cf168b1)
- name the full decision suffix case without the old contract (9a225c4)
#### Build system
- (**deps**) add the TypeSafe SDK and esbuild as dev dependencies (f7d4b8b)
- keep one manifest list for the version writer and check (eaa6604)
- bundle each plugin with esbuild and the TypeSafe SDK inlined (bc0035c)
#### Continuous Integration
- (**evals**) drop the comment on the removed agent drift record (d2c9895)
- (**evals**) build the plugin bundles before installing the plugin (94ca356)
- (**release**) rebuild the plugin bundles in the version commit (5dc7eb5)
- (**renovate**) label TypeSafe SDK updates as fixes (f612d31)
- set up Node through one local action and alias the evals checkout (8839772)
- build the bundles before checks and move to Claude Code 2.1.308 (73244fe)
- compute the policy verdict cache key once (892e94a)
- drop the commit-message job and keep the commit-msg hook (55198e9)
- check that every commit since the last tag is conventional (052684d)
- drop the evals selftest and its hand-written fixtures (d12e5fb)
- run the evals on manual dispatch only (23253ae)
#### Refactoring
- (**calibrate**) score cases through the parts and the SDK composer (73edbf2)
- give both parts one neutral base so neither imports the other (27d7a17)
- clear the Laundering findings in src, scripts and tests (685ed9a)
- split scoring into a model part and an effort part (6a00581)
- move brief preparation into its own module (699f840)

- - -


## v0.12.1 - 2026-10-21
#### Bug Fixes
- (**omp**) match only the task heading when looking for the user's task agent (dd967c0)
#### Documentation
- remove the heist working files (e11e956)
- keep the multi-harness heist open until the recorded fixtures land (a8cd654)
#### Miscellaneous Chores
- ignore the working files of the Gangsta and Superpowers plugins (571c3b4)

- - -


## v0.12.0 - 2026-10-21
#### Features
- (**calibrate**) print the Jev model that answered (8509d97)
- (**evals**) run real clients against the plugins (11167db)
- (**omp**) keep the light tier off its model's lowest level (0d4a283)
- (**omp**) follow omp's effort settings and show the applied level (40946ef)
- (**omp**) add the Oh My Pi catalog (bd2d07d)
- (**omp**) route generic task spawns through the extension (0d80300)
- (**omp**) add the setup interview and escalation skills (2ce5405)
- (**omp**) add the Oh My Pi package and its three router agents (345c27c)
- route Claude Code through the shared core (93a44b4)
- add the shared routing core and its network helper (7f61a49)
#### Bug Fixes
- (**evals**) ask the omp case for the task agent (064187f)
- (**omp**) name the setup skill folder after the skill (0e1ab8a)
- (**sync**) fail the check on a missing copy or manifest (481c718)
- address the final review (6b7bb56)
- address the review of the scripts and the omp privacy policy (6bdb326)
#### Revert
- (**jev**) follow redirects again (a7960ca)
- (**omp**) send the item name as it is (8e78b66)
- (**omp**) drop the router's own high ceiling (1b4a6b7)
#### Documentation
- (**gangsta**) record the laundering checkpoint (c183d4b)
- (**gangsta**) record the omp setup dry run and the light-tier rule (4687ea0)
- (**gangsta**) record the Don's amendments and fix the review points (9150944)
- (**gangsta**) record the omp effort work and the no-override rule (e9e2983)
- (**gangsta**) record calibration and the omp end-to-end run (ecca6e3)
- (**gangsta**) record the CI, docs and evals packages (92468d4)
- (**omp**) describe what the skills do, not which commands to run (d89d8c0)
- (**omp**) propose the newest model of each family in the setup (919e3b0)
- (**omp**) describe effort modes, agent choice and the ladder sources (9d300c2)
- describe the omp plugin and the shared core (0c50a4e)
- record the heist progress checkpoint (1d4ad53)
- follow the setup skill folder name in the plan (fc61857)
- add the multi-harness heist dossier, contract and plan (9b9eb21)
#### Build system
- keep the omp catalog version in step with the plugins (f00e98a)
- bump every plugin manifest in one version step (fc8d61a)
#### Continuous Integration
- (**evals**) name the omp case's key OPENROUTER_API_KEY (7314fd6)
- check the shared copies and run the new tests (f453d5d)
#### Refactoring
- (**omp**) read the effort mode and a custom task agent from the task tool (6980b72)
- split the Agent handler and remove duplicated test setup (8ae37c0)
- let prepareBrief take a budget and use it for omp context (ff2e523)
#### Miscellaneous Chores
- drop the Codex manifest from the version bump (e9b21cd)

- - -


## v0.11.0 - 2026-10-15
#### Features
- route every call, drop the suggest mode (c63084c)
#### Documentation
- drop the last mentions of the modes (8cdb0e4)

- - -


## v0.10.0 - 2026-10-15
#### Features
- pick the Jev alias in /config (100df0d)

- - -


## v0.9.0 - 2026-10-15
#### Features
- route with Jev 1.14.0 (5faef74)

- - -


## v0.8.0 - 2026-10-15
#### Features
- read the TypeSafe key from the environment when the option is empty (bd780d1)
#### Documentation
- state the minimum Claude Code version once (3578fd8)
- say the --config key is visible in the process list too (fb654aa)
- say how to set the key in the terminal, VS Code and the desktop app (b5988fe)
#### Build system
- (**deps-dev**) Bump the dev-tools group with 2 updates (008e92d)

- - -


## v0.7.2 - 2026-10-14
#### Bug Fixes
- install no dev tools onto users' machines (0642945)
#### Build system
- format package.json (4533970)
- refuse an npm older than 11.10.0 (b4a3e1a)
- pin the actions to their latest releases and widen the window to 14 days (dde86aa)
- gate dependencies behind a 7-day window and audit them in CI (6c14e8e)
#### Continuous Integration
- cache the policy verdict by the plugin folder's tree (e00ba18)
- reflow the dependency review comment (21dc0dc)
- fail the dependency review on the unknown scope too (1902449)

- - -


## v0.7.1 - 2026-10-13
#### Bug Fixes
- end the Jev wait when the dispatch is abandoned (347b93c)

- - -


## v0.7.0 - 2026-10-13
#### Features
- disclose the TypeSafe upload in the plugin description (a26f6ed)
#### Documentation
- say the verdict stays local and name the CI gates (2664723)
#### Build system
- type-check and lint with strict TypeScript and Biome (c01e935)
#### Continuous Integration
- scan each plugin tree once and gate on the cached verdict (76f90f3)
- validate the plugin with --strict (e75b024)
- push releases with the release deploy key (1248715)
- fail the policy job when the scan returns no verdict (f661ad7)
- run Anthropic's plugin policy scan on every pull request (35a80d4)
- fail when the mod's hooks or engine calls change (434e33b)

- - -


## v0.6.0 - 2026-10-11
#### Features
- skip calls that permission rules deny and log each request to the debug log (d8a7770)
#### Documentation
- name the pre-routing permission check precisely (c4a7bf5)
- write the README and the privacy policy for the user (78fbf6c)
#### Miscellaneous Chores
- start the changelog at v0.5.0 (0e6ac7e)

- - -


## v0.5.0 - 2026-10-11
#### Features
- route through the Agent tool call in one hook (30f076d)
#### Bug Fixes
- log the pick before the call runs and test the fail-open path (5cccc78)
#### Documentation
- say the key stays in memory and qualify the stdin advice (32775d4)
- say when the request leaves and what the hook looks at (78f8464)
- say what the hook looks at and date the policy (07de483)
- describe the one hook and drop the key variable from the README (68324a0)

- - -
