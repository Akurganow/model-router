# Changelog
All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

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
