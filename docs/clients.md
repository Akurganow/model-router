# How each client loads a package

This page says what each client reads from a package in this repository and from a project folder.
Each fact is a plain statement, with no release, date or commit as its evidence.
The evidence of each fact, the release, the date and the links, is on the [wiki's evidence pages](https://github.com/Akurganow/model-router/wiki#evidence-pages).
The `Evidence:` line under a heading links the section of its facts there.
The records of this project's own runs are on the [wiki](https://github.com/Akurganow/model-router/wiki).
This page quotes no output of this project's plugin or scripts and links no CI run of this repository.
Install commands and install-time notes are in the [README](../README.md#install).
The reasons built on these facts are in [About this repository's design](design.md).

Four clients are covered: Claude Code, Oh My Pi (omp), OpenClaw and Hermes Agent.

## Claude Code

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#claude-code)

`.github/actions/setup-claude-code/package.json` pins the Claude Code release CI installs, and the README names the minimum version.

### Manifest

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#manifest)

- The manifest is `.claude-plugin/plugin.json` under the plugin root.
  Every other plugin file sits at the plugin root, not inside `.claude-plugin/`.
- Claude Code strips an unrecognized top-level field, and the plugin loads.
  `claude plugin validate` reports the field as a warning.
- An unknown key inside a `userConfig` option is an error, and the plugin does not load.
- A `userConfig` option requires `type`, `title` and `description`.
  It accepts `default`, `options`, `sensitive`, `required` and `multiple`, among others.
- `options` limits a `string` option that is neither `multiple` nor `sensitive`, and `/config` shows a picker.
  `default` must be one of the listed values.
  Claude Code before v2.1.271 cannot load a plugin that declares `options`.
- Claude Code saves non-sensitive values under `pluginConfigs` in `settings.json`.
  It saves `sensitive` values in the platform's secure credential store.
- `/config` shows a row for each option, except `sensitive` options and `multiple` lists.
- `commands` accepts an object map from a command name to `source` or `content`.
  Each value sets exactly one of the two, and `description` and `argumentHint` are optional.
  The key becomes the command name after the plugin prefix, as in `/deploy-tools:about`.
- `skills` takes a path or an array of paths, each a directory.
  `"."` names the plugin root, and the listed directories add to the default `skills/` scan.
  `"."` needs Claude Code v2.1.221 or later.
- Every component path starts with `./`, exists, and resolves inside the plugin root.
- Anthropic's directory reads `privacyPolicyUrl` and four other listing fields from `plugin.json` only.
  In a catalogue entry, `claude plugin validate` reports each one as an unknown field.

### Catalogue

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#catalogue)

- The catalogue is `.claude-plugin/marketplace.json`.
  Relative plugin sources resolve from the marketplace root, the folder that holds `.claude-plugin/`.
- The catalogue requires `name`, `owner` and `plugins`, and `owner.name` is required.
  A missing `description` raises a warning in `claude plugin validate`.
- Each entry requires `name` and `source`.
- A relative `source` starts with `./` and resolves from the marketplace root.
  A path without the prefix fails with `Invalid string: must start with "./"`, and a path with `..` fails too.
- Claude Code ignores an unknown top-level or entry key, and `claude plugin validate` warns about it.
- Marketplace and plugin names use letters, digits, `.`, `_` and `-`, and start with a letter or digit.
  Users type them as `<plugin>@<marketplace>`.
- When an entry and `plugin.json` both set `version`, `plugin.json` wins, and `claude plugin validate` warns.
  The hosting page tells owners to set `version` in one place.

### Install and update

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#install-and-update)

- `claude plugin marketplace add <source>` accepts `owner/repo` and a path to a local directory.
  `claude plugin install <plugin>@<marketplace>` installs from a marketplace already added.
- `claude plugin install <plugin> --marketplace <source>` adds the marketplace first and then installs.
  The plugin name goes by itself, with no `@marketplace` suffix.
  The shell form needs v2.1.292 or later, and the `/plugin install` form in a session needs v2.1.275.
- `claude plugin install --config <key>=<value>` sets a `userConfig` option at install time.
  The scope defaults to `user`.
- `claude plugin configure <name>@<marketplace> --values-stdin` saves option values from a JSON object on standard input.
  It needs the full plugin id and v2.1.285 or later.
- Claude Code computes a version for each plugin and reads `version` from `plugin.json` first, then from the entry.
  A new copy reaches users only when that version differs from the one they hold.
- Claude Code copies a marketplace plugin into `cache/<marketplace>/<plugin>/<version>/` and loads that copy.
  A relative-path plugin in a marketplace added from a local path loads in place instead.
- Background auto-update is off for a third-party marketplace until a user or an administrator turns it on.
  Without it, a user runs `claude plugin update <plugin>@<marketplace>`.
- `claude plugin marketplace add` of a checkout's path printed `Successfully added marketplace: model-router (declared in user settings)`.
  Then `claude plugin install model-router@model-router` printed `Successfully installed plugin: model-router@model-router (scope: user)`.

### Hooks module

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#hooks-module)

- A mod is a plugin whose `hooks/hooks.json` has a `modules` key.
  The key holds an array with one path, relative to that file, to the hooks module.
- The hooks module is an ES module that exports `register(on, options)`.
  `options` holds the `userConfig` values with their defaults filled in.
- Claude Code loads `.js` and `.ts` files directly, with no build step.
  A hooks module imports only files inside the plugin directory by relative path, and the one bare import allowed is `claude-code`.
- When a hooks module fails, Claude Code skips it and the session continues.
  A broken mod can therefore look like one that does nothing.
- A mod installed from a marketplace loads at the next start of Claude Code, or at `/reload-plugins` in an open session.
- Claude Code caches an installed plugin by version.
  An edit reaches the installed copy only after the version rises and the user installs again.

### Subagent events

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#subagent-events)

- `agent.spawn` fires when a subagent or a teammate is about to start, and when a subagent that finished or stopped is about to run again.
  For a resumed run `e.resume` is `{ agentId }`, and Claude Code ignores a changed event passed to `next`.
  The resumed run raises the event from v2.1.299.
- A `SendMessage` to a completed subagent resumes it under the same ID, with no new Agent call.
  Explore and Plan return no agent ID, so Claude cannot resume them.
  A per-invocation `model` and `effort` stay in effect on the resumed run, and `CLAUDE_CODE_EFFORT_LEVEL` outranks the effort.
- A model that a hook sets at `agent.spawn` stays on the run that `SendMessage` resumes.
  The debug log held one routing line for the two runs, so the resume was not scored again.
  The subagent's messages carried `message.model` `claude-haiku-5-5` on its first run and on the resumed run.
  The session's own messages carried `claude-sonnet-5-5`.
  The stream carries no request's effort, so the run does not show the effort of the resumed request.
  A run with `--model haiku` routed the same task to `haiku`, so it could not tell the two models apart.
- `turn.complete` carries a subagent's `agentId` once for each run of its loop.
  No event marks a subagent as gone: an agent that completed, failed or was stopped can still resume under its id.
- `turn.step` carries the subagent's `agentId`, and a hook may rewrite its `effort`.
- `agent.spawn` also carries `provider`, `parentModel`, `parentAgentId`, `permissionMode`, `background` and `cwd`, and `agent.offer` carries `provider`.
  The adapter reads none of them.

### Validate and test

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#validate-and-test)

- `claude plugin validate <path>` takes a manifest file or a directory.
  A directory that holds `.claude-plugin/marketplace.json` validates the marketplace.
  A directory that holds both files validates the marketplace and then the plugin, on v2.1.289 or later.
- `--strict` treats warnings as errors, and the command then exits `1`.
- A validation run does not check a `SKILL.md` at the plugin root.
- For a mod, `claude plugin validate` prints `hooks:` and `calls:` lines that list the events and the API calls found in the module.
  It prints a line for each hook that can refuse an action, with or without a `.catch` handler.
- `claude plugin validate --strict plugins/model-router` printed those lines and `✔ Validation passed` on Ubuntu and macOS.
  It also noted that its checks apply none of the plugin directory's own rules for hooks modules.
- `claude plugin test [directory]` runs every file under the directory whose name ends in `.test.ts` or `.test.tsx`.
  It needs no session, sign-in or network, and exits `1` when a test fails.
- `claude plugin test plugins/model-router` ran the plugin's test files with no session and passed on Ubuntu.

### Package files

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#package-files)

- When Claude Code copies a plugin into its cache, it installs the plugin's Node.js dependencies there.
  The install runs only when the plugin's root directory holds both a `package.json` and a supported lockfile, such as `package-lock.json`.
- The dependency install runs no lifecycle scripts, times out after 60 seconds, and cannot be turned off.
- A relative `source` such as `./plugins/formatter` resolves to `<marketplace root>/plugins/formatter`, even though the catalogue sits in `.claude-plugin/`.

### Claude Code project skills and configuration

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#claude-code-project-skills-and-configuration)

- Claude Code loads project skills from `.claude/skills/` in the folder it starts in and in each parent up to the repository root.
- `CLAUDE_CONFIG_DIR` replaces the configuration folder `~/.claude`, which holds the settings, the session history and the plugins.
- `--debug-file <path>` writes the debug log to that path and turns debug mode on. Without it the debug log is `~/.claude/debug/<session-id>.txt`.

### Claude Code gaps

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#claude-code-gaps)

The Claude Code documentation gives no rule for three points.
It gives none for the declaration form of `register` in a hooks module, for free `setTimeout` globals or for a size limit on the module.
`checkClaudeBundle` and `MAX_BUNDLE_BYTES` in `scripts/build.ts` check those three anyway.

## Oh My Pi

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#oh-my-pi)

CI and the evals workflow pin two omp versions, which `.github/actions/setup-omp/action.yml` installs: the minimum the README names, in `.github/actions/setup-omp/minimum/package.json`, and the latest omp release, in `.github/actions/setup-omp/latest/package.json`.

### omp manifest and settings

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-manifest-and-settings)

- Marketplace installs load extension modules that `package.json` declares in `omp.extensions`.
  Installation symlinks the cached plugin into the scope's `node_modules` and records it in `omp-plugins.lock.json`.
- An extension package declares `"omp": { "extensions": ["./src/main.ts"] }`.
  The loader also accepts the legacy `pi` key, and entries may be `.ts`, `.js`, `.mjs` or `.cjs` files.
- The loader reads the `omp` object of a package, or `pi` when `omp` is absent, and copies the package `version` into it.
  A package with neither object is not an omp plugin.
- The manifest type has an optional `settings` map of a setting key to a schema.
  A schema has a `type` of `string`, `number`, `boolean` or `enum`, plus `description`, `secret` and `env`.
  An `enum` schema adds `values` and `default`.
- Plugin settings are stored in `omp-plugins.lock.json`, keyed by package name and then by setting key.
  Here the package name is the `name` in `plugins/model-router-omp/package.json`, not the catalogue entry name.
- The lockfile sits in `plugins/` under the scope root, `~/.omp/plugins/` by default for the user scope.
  omp writes it with owner-only permissions, because it can hold values a plugin marks `secret`.
- A project file, `<project>/.omp/plugin-overrides.json`, can override a plugin's features and settings.
- omp's extension-package discovery also reads a package's sibling folders `skills/`, `hooks/pre|post/`, `tools/`, `commands/`, `rules/`, `prompts/` and `.mcp.json`.
  So the npm package keeps OpenClaw's skills in `openclaw-skills/`.
- Extension modules load when a session starts.
  After an install, `/reload-plugins` refreshes agents, skills and commands, and a restart loads new extension modules.

### omp catalogue

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-catalogue)

- omp looks for `.omp-plugin/marketplace.json` first and falls back to `.claude-plugin/marketplace.json`.
  A repository may ship both: omp reads the `.omp-plugin/` copy and Claude Code reads the `.claude-plugin/` copy.
- A catalogue requires `name`, `owner.name` and `plugins`, and an entry requires `name` and `source`.
  A string `source` starts with `./`.
  omp logs an invalid entry and skips it, and it preserves extra fields.
- Marketplace and plugin names use ASCII letters, digits, hyphens and dots, and hold at most 64 characters.
  A name starts and ends with a letter or digit, and a plugin id `name@marketplace` holds at most 128.
- A git or local marketplace source must hold a catalogue at one of the two paths.
  A local source is a path such as `./path`, `~/path` or `/path`.

### omp install and update

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-install-and-update)

- The commands are `omp plugin marketplace add <source>`, `omp plugin install name@marketplace` and `omp plugin upgrade [name@marketplace]`.
  `install` accepts `--scope user|project`, and the user scope is its default.
- The installed version comes from the catalogue entry's `version`, then `.claude-plugin/plugin.json`, then a root `plugin.json`, then `package.json`.
  It falls back to the first seven characters of the source SHA, and then to `0.0.0`.
- An upgrade of all plugins compares only catalogue entries that declare `version`.
  A semver version must be newer, and a non-semver version counts as changed when it differs.
  This upgrade ignores `--scope`.
- `omp plugin marketplace update` refreshes catalogues only and reinstalls nothing.
  Without `--scope`, `omp plugin upgrade name@marketplace` reinstalls every installed scope.
  An upgrade keeps settings and disabled state.
- `marketplace.autoUpdate` is `off`, `notify` or `auto`, and `notify` is the default.
  In `notify` mode omp writes update availability to the debug log only.
- `omp plugin marketplace add` of a checkout's path printed `✔ Added marketplace`.
  Then `omp plugin install model-router@model-router` printed `✔ Installed model-router from model-router (<version>)`.

### omp install names

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-install-names)

- omp passes an extension no plugin name.
  The extension's API object has no member that names the plugin, the package, the manifest or the settings.
- omp keys the lockfile entries `plugins` and `settings`, the `node_modules/<name>` link and the project override by the `name` in the installed `package.json`.
  An extension reads that name from `new URL("../package.json", import.meta.url)`, because the bundle sits in a folder beside the file.
  The catalogue entry name, `<entry>@<marketplace>` and the other plugin's name returned no settings.
- A catalogue install of entry `probe` with package name `probe-omp` stored its settings under `probe-omp`.
  `omp plugin config set probe …` printed `Plugin "probe" not found`, and `omp plugin config set probe-omp …` set the value.
- An npm install of `@probe-scratch/settings-probe` stored its settings under the scoped name.
  The unscoped name printed `Plugin "settings-probe" not found`.
- `omp plugin install` takes a registry name for npm.
  A path to a `.tgz` file fails with `ENOTDIR`, and a local folder installs by link.
- `omp plugin upgrade @probe-scratch/settings-probe` moved the plugin from 0.0.1 to 0.0.2 and kept the stored setting.
  Before 0.0.2 existed it printed `is up to date (0.0.1)`.
  `omp plugin upgrade probe@probe-market` also kept the settings, after a catalogue entry gained a higher `version`.
- A project file, `<project>/.omp/plugin-overrides.json`, overrode the stored setting of the npm plugin and left the catalogue plugin's value alone.
- With both plugins installed, each extension read its own setting, and no value crossed over.
- omp rejects a catalogue plugin whose package name equals an installed package name, case-insensitively.
- The settings read of an extension covers the user scope lockfile only.
  A plugin installed with `--scope project` keeps its lockfile under the project, and that read does not see it.
- The plugin installed from the checkout and from the unpacked tarball, and loaded its commands.
  That run covers the install, not the settings name.

### omp per-call model

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-per-call-model)

- A `task` item may carry `model`, one exact `provider/model-id` selector.
  omp accepts it only when `task.perCallModel` is `on`, and the setting defaults to `off`.
- Every item `model` other than `undefined` passes the per-call check before any spawn, unless the item's agent is `seance`.
  With `task.perCallModel` off, or with a value that is not one exact selector, the whole call fails.
  A role alias such as `@smol` fails too.
- An item whose agent is `seance`, named or by default, skips that check.
  The bundled `seance` agent takes `model` as its source session's model, and omp sends it as `seanceModel`, not as a per-call model.
  An agent that shadows the name takes it as a per-call model, checked once the name resolves.
- An accepted per-call model replaces the agent's own model and the task role.
  It becomes the spawn's only model pattern, and the spawn has no model role.
- `before_subagent_spawn` sends those patterns as `patterns`, or the agent's own patterns when the item sets no model.
  A `model` the hook returns replaces them, a per-call model included.
- A role that the plugin returned for an item that set its own model won: the spawn ran on that role, not on the item's model.
  A level 0 item that named a large model got `@smol`, and a level 2 item that named a small one got `@slow`.
- omp 18.12.6 has no `task.perCallModel` setting: it arrived in 18.14.2.
- At omp 18.12.6 the docs mark the item `model` as seance only.
  Yet the task tool passes it on as the request model for any agent, and the request model outranks the agent's own model.
- From omp 18.18.4 the `task` tool advertises the item `model` only when `task.perCallModel` is `on` or the bundled seance is spawnable.
- The plugin skips every item that sets `model`, so these differences do not change what it routes.

### omp tool_call cost and timeout

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-tool_call-cost-and-timeout)

- While any extension has a handler for `tool_call`, `tool_result`, `tool_approval_requested` or `tool_approval_resolved`, omp's speculation host refuses early work with the reason `active extension lifecycle handler`.
- Early task launch asks that gate: the task tool calls `authorizeLaunch` before a launch, and `authorizeLaunch` calls the policy gate.
- `task.speculativeLaunch`, on by default, starts each subagent as soon as its `tasks[]` item has streamed.
  Its description says it requires "no extension tool lifecycle handlers".
- Early local reads ask the same gate. `tools.speculativeExecution.enabled`, which turns them on, is experimental and off by default.
- The default tool approval mode is `yolo`, so without a `tool_call` handler speculative task launch is active by default.
- `pi.on("tool_call", handler)` takes no tool filter, and the runner counts any handler for the event name.
  `tool_execution_start` carries the arguments but is a mirrored notification that does not gate dispatch.
  So no narrower registration avoids the veto.
- The veto is in every omp version the plugin supports: it first appears in 18.1.19, and `task.speculativeLaunch` in 18.4.3.
- omp registers `extensionHandlers.toolCallTimeoutMs`, a number with a default of 30000.
  Time spent in omp's own dialogs does not count against it.
- omp reads the setting on every tool call.
  It keeps a finite value above 0 and replaces any other value with 30000.
- When a `tool_call` handler passes the timeout, omp blocks the tool call with the reason `Extension <path> timed out after <n>ms`.
- A `before_subagent_spawn` handler gets a fixed 30 s instead, `extensionHandlerTimeoutMs`.
  On that timeout omp logs it, and the spawn goes on without a model change.
- An extension that read `lookup("extensionHandlers.toolCallTimeoutMs")?.get(pi.pi.settings)` got 30000 with no setting and 2000 with the setting at 2000.
  With the setting at 2000 and a `tool_call` handler that slept 3000 ms, the `task` call ended with `Extension <path> timed out after 2000ms`, and no subagent request reached the provider.

### omp model roles

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-model-roles)

- omp knows 16 roles, and `midl` is not one of them. Only `smol`, `slow` and the kind roles have catalogue priority lists.
- Model roles live under `modelRoles` in `config.yml`, not in `models.yml`.
  A role's value is a model selector such as `provider/modelId`, and a chat role's value can end in a thinking selector such as `:low`.
- The Roles view of `/models` names `smol` Fast and `slow` Thinking, and ends with a `+ New role…` row that adds a custom role.
- `modelRoles` accepts any role name, so a role such as `midl` needs no change in omp.
- A custom role that `modelRoles` names resolves: `ctx.models.resolve("@mid")` gave the configured model, and a spawn hook that returned `@mid:medium` ran it at `medium`.
  A custom role that `modelRoles` does not name gives `undefined`, and a hook that returned it failed the subagent with `Error: No model selected.` and exit code 1.
- `ctx.models.resolve` resolves against `modelRegistry.getAvailable()`, which checks configured auth without running a key command.
  A built-in provider with no credential gives `undefined`, for the model id and for a role that names it.
  A `models.yml` provider whose `apiKey` is a command that prints nothing gives a full model, and `getApiKeyForProvider` gives `undefined` for it. A hook that returned that role ran the child on the parent's model, with exit 0 and no error.
- A `smol` or `slow` role that `modelRoles` does not name resolves through an explicitly configured `default` model before omp's built-in priority list.
  With `smol` unset, `ctx.models.resolve("@smol")` gave the `default` model.
- A child's retry fallback chain is `retry.fallbackChains` at the spawn's own model role, kept from before the role's expansion, and otherwise at `default`.
  A role that a spawn hook returns does not change the spawn's role, so `retry.fallbackChains.midl` does not reach a spawn the plugin gives `@midl`.

### omp thinking levels

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-thinking-levels)

- A `model` that a `before_subagent_spawn` handler returns replaces the spawn's patterns, and omp expands it like a configured role.
  A role alias with a level suffix, such as `@smol:high`, expands to every pattern of the role with `:high` appended.
- omp reads the text after a pattern's last colon as a level when it is `inherit`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` or `auto`, or a prefix of two characters or more that names one of the first eight only, such as `hi`, `med` or `xhi`.
  The match is case-sensitive. Any other suffix, such as `:free` or `:8b`, stays part of the model id.
  The role and pattern paths pass `MAX_THINKING_SUFFIX_OPTIONS`, so `:max` and `:auto` parse there.
- The ladder's four efforts, `low`, `medium`, `high` and `xhigh`, are omp `Effort` values with the same strings.
- The executor ranks the item's `effort` first, then an explicit `:level` on the resolved pattern, then the agent's own level, then a level derived from the pattern.
- omp passes the item's `effort` on only while `task.enableEffort` is on, and that setting defaults to off.
  The plugin therefore counts an item's `effort` as the caller's only while the setting reads `true`.
- `task.maxEffort` takes `minimal`, `low`, `medium`, `high`, `xhigh` or `max`, and defaults to `max`.
  omp applies it only to the item's `effort` or a per-call model, not to a level the spawn hook sets.
- The bundled `task` agent runs at `auto`, which lets omp pick the effort per prompt, and `sonic` at `medium`.
- The spawn event's `patterns` are the expanded model patterns omp would spawn with.
  omp fills them from the spawn policy's model override, so the list can be empty.
  A hook that returns an empty list leaves the policy unchanged.
- At 18.18.9 only, a user agent whose model tag names a level ignores the item's `effort`.
  The plugin skips a user agent that declares a model, so this rule does not reach a routed spawn.
- A probe hook's suffix set the child's level. With no hook the child ran on the parent's model at `high`.
  `@smol:high` ran the small model at `high`, `@smol:xhigh` at `xhigh`, and the event's own patterns with `:low` kept the parent's model at `low`.
- The item's `effort` won over the hook: with `task.enableEffort` on, an item `effort: "lo"` and a hook `@smol:high` ran the small model at `minimal`, its lowest level.
  The hook's suffix won over a project agent's `thinking-level: low` and over a level on the role, `modelRoles.smol: stub/small:low`.
  `task.maxEffort: low` with a hook `@smol:high` ran the child at `high`.
- The built plugin, with its Jev requests answered inside the omp process and the stand-in model, set the child's model and level as [Effort](../plugins/model-router-omp/README.md#effort) says.
  Level 0 ran the small model at `high` or `xhigh`, level 1 the parent's model at `low` or `medium`, and level 2 the large model at `medium` or `high`, as the work level picked.
  `task.maxEffort: low` capped level 0 at `low`, and `task.maxEffort: medium` capped level 2 at `medium`.
  With `task.maxEffort: minimal`, an item `effort: "lo"` or `modelRoles.smol: stub/small:low`, the plugin returned `@smol` alone, and its line named the source of the effort.
- A level on the `smol` role reached the spawn's patterns of the bundled `scout` agent as `stub/small:low`.
  At level 1 the plugin then returned nothing, and the child ran at `low`, as it did without the plugin.
  A level on the `default` role did not reach the patterns of a `task` spawn, which read `stub/parent`.
  Without the plugin that child ran at `high`, not at the role's `low`.
  A project agent with `thinking-level: low` and no model ran at `low` without the plugin and at the ladder's `medium` on the large model at level 2.
- At level 2 for `scout` with `modelRoles.smol: stub/small:low`, the spawn's patterns read `stub/small:low`, the plugin returned `@slow:medium`, and the child ran the large model at `medium`.
  With `task.enableEffort` off, an item `effort: "hi"` changed nothing without the plugin: the child ran the parent's model at `high`. With the plugin at level 0 and work 2, it returned `@smol:xhigh`, and the child ran the small model at `xhigh`.

### omp project skills and folders

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-project-skills-and-folders)

- omp reads project skills from `.agent/skills` and `.agents/skills` in each folder from the working directory up to the repository root, and it skips the home folder.
  With no repository root, the walk stops at the home folder, or at the filesystem root when the working directory is not under home.
- On the same walk it reads `.claude/skills` too.
- On a skill name that two providers give, the provider admitted first keeps the bare name, and providers are admitted by priority: `.claude` 80, `.agents` 70.
  An identical copy is dropped, and a different copy is renamed `<namespace>/<name>` with a `name collision` warning.
- A skill file reached twice, as through a symbolic link, loads once: omp skips a real path it has already loaded.
- `PI_CONFIG_DIR` names the configuration folder relative to the home folder, `.omp` by default.
  `PI_CODING_AGENT_DIR` names the agent folder, which is otherwise `agent` inside the configuration folder.
- omp picks the first model from an explicit CLI model, then the first scoped model, then the saved default.
  `--model` is the preferred form, and an exact `provider/modelId` is unambiguous.

### omp gaps

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-gaps)

No documentation page under `docs/` describes the `omp.settings` block.
The settings facts above rest on source.
`marketplace.md` lists no `privacyPolicyUrl` entry field.
The catalogue parser preserves extra entry fields, but no source says what omp does with this one.
The settings-name facts of [omp install names](#omp-install-names) come from one run on a single omp release.
CI tests the two omp pins that [Oh My Pi](#oh-my-pi) names.
The `package` job in `.github/workflows/ci.yml` installs the unpacked tarball, lists the package and checks that omp loads it, but reads no setting, so no run exercises the settings name on either pin.
The settings-name facts are unchecked on every other omp release.

The plugin routes the subagents of a `task` call only.
omp also fires `before_subagent_spawn` for eval `agent()` and `workpool()` spawns, with `invocationKind` `"eval"`.
The plugin returns nothing for them, because no `task` batch scored them.
Some subagents start with no `before_subagent_spawn` event, so no plugin can change their model:
`/cleanse` workers, vibe workers, follow-up turns of a running subagent, revived subagents, and a seance that reuses a prepared session.

The stand-in model accepted every level, so no run exercised omp's clamp of a level to the range a model supports.
The plugin reads a level on the role it picks and on any role that role names with `@`.
A role left unset falls back to omp's own defaults, which the plugin does not read, so the routed effort replaces a level set there.

## OpenClaw

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw)

### OpenClaw install and update

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-install-and-update)

- `openclaw plugins install npm:<package>` installs from the npm registry only.
  A bare package name installs from npm too, unless it matches an official plugin id.
  An npm spec is a package name with an optional exact version or dist-tag.
- A new arbitrary npm, git, local or marketplace source warns and asks before it installs.
  A non-interactive install must pass `--force` after the source is reviewed.
- Non-interactive install, update and enable commands need `--accept-capabilities` when OpenClaw asks for capability consent.
  A local copy or an unverified source always asks.
- `plugins install` adds the plugin to `plugins.allow`, enables its entry and selects its slot, unless `--no-enable` is passed.
  When the plugin's own config is absent and the plugin requires it, OpenClaw records the install disabled.
  `openclaw plugins enable <id>` then enables it.
- With a local Gateway running, install, enable, disable and uninstall apply through it.
  Without one, they save the change for the next start.
  `openclaw plugins inspect <id> --runtime --json` loads the plugin module.
  The page says the report lists what the plugin registered.
  The report lists only what the plugin registers in `tool-discovery` mode, as the next bullet records.
- `openclaw plugins inspect <id> --runtime` loads the plugin in `tool-discovery` mode, not in `full` mode.
  The mode list calls `tool-discovery` "capability discovery for executable tools", and `full` "live runtime activation".
  In that mode this plugin registers only its config tool, so `inspect` lists `model_router_config` and no hook or command.
- The `package` job installed the packed tarball and ran `openclaw plugins inspect model-router-openclaw --runtime --json`.
  `scripts/check-openclaw-install.ts` read the report and passed.
  So the report held the plugin id, the package name and the package version, status `loaded`, and `imported` and `enabled` true.
  It also held `model_router_config` in `contracts.tools` and no diagnostics.
  The script then called the installed bundle's `register()` on a recording API in `full` mode, instead of reading the registration from the report.
  The install printed `Installed plugin: model-router-openclaw` and `Saved for the next Gateway start.`, and the script passed, with the bundle registering the hook, the config tool and the two option commands.
- The Gateway log shows a command registration as `Registered plugin command: /<name> (plugin: <id>)`.
  OpenClaw writes the line through `logVerbose`, which logs under `--verbose` or at file log level `debug`.
  A registered hook counts in `hook runner initialized with <n> registered hooks`, a debug-level line of the `plugins` logger.
  A probe plugin's registration appeared in the Gateway log as `Registered plugin command: /probescope` when the Gateway loaded the plugin.
- In the default `hybrid` reload mode, a change under `plugins.entries.<id>` replaces that plugin's runtime instance and reruns registration.
- `openclaw plugins install --link <path>` adds a local folder to `plugins.load.paths`, needs capability consent, and does not inherit official package trust.
  `openclaw plugins reload <id>` reloads a plugin after an edit.
- `openclaw plugins install npm-pack:<path.tgz>` installs a local tarball that `npm pack` built.
  It uses the same managed npm project path as a registry install, and the tarball must sit on the Gateway host.
- `openclaw plugins update <id>` reuses the tracked install spec.
- `openclaw plugins disable <id>` toggles the plugin's config entry and leaves the installed files.
- When the manifest id differs from the npm package name, install logs an info line and uses the manifest id as the config key.
  The line reaches the terminal only when the CLI runs the install itself.
  With a Gateway running, the CLI sends the install to it, and the Gateway's logger carries progress events but no `info` method.
  The line then appears nowhere.
- `openclaw logs --plain` tails the Gateway log, and `--follow` follows it.
- `openclaw config set <path> <value>` writes one config key.
- The Control UI shows a plugin's schema-backed settings at `/settings/plugins/<plugin-id>`.

### OpenClaw package files

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-package-files)

- A native plugin archive needs a valid `openclaw.plugin.json` at its root.
- The manifest requires `id` and `configSchema`.
  `id` is the key in `plugins.entries.<id>`.
  `uiHints` carries labels and sensitivity hints, and `skills` lists skill folders relative to the plugin root.
- OpenClaw validates a plugin's config against the manifest's `configSchema` when it reads or writes the config and before the plugin loads.
  This plugin's schema sets `additionalProperties: false`, so a setting the manifest does not declare fails validation.
  `openclaw config set plugins.entries.model-router-openclaw.config.unknown_model x/y` exited 1 and saved nothing.
  It printed `Config change declined. No settings were saved.` and `Config validation failed: plugins.entries.model-router-openclaw.config: invalid config: must not have additional properties: "unknown_model"`.
  With that key written into the config file by hand, `openclaw gateway run` refused to start.
  `openclaw config validate` named the same cause and offered `openclaw doctor --fix`.
- `activation.onStartup` set to `true` imports the plugin when the Gateway starts.
- `contracts.tools` lists the tool names a plugin owns, and a runtime `api.registerTool` call must match it.
- `configContracts.secretInputs` names the config paths under `plugins.entries.<id>.config` that hold secrets.
- `package.json` carries `openclaw.extensions`, `openclaw.compat.pluginApi` and `openclaw.install.minHostVersion`.
  OpenClaw enforces the last two when it installs a non-bundled plugin.

### OpenClaw entry and registration

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-entry-and-registration)

- `register(api)` stays synchronous.
  Handlers default to priority `0`, higher priorities run first, and registration order breaks ties.
- `api.on(name, handler, opts)` accepts `matcher`, a non-empty list of tool ids, together with `priority` and `timeoutMs`.
- A default export that is a plain object `{ id, register(api) }`, with no import from OpenClaw, loads and registers.
  `openclaw plugins inspect <id> --json` printed status `loaded`.
- `api.registrationMode` read `full` when the Gateway loaded the plugin.
  The plugin registered a second time with `discovery` after an agent turn.
- `api.registrationMode` takes six values: `full`, `discovery`, `tool-discovery`, `setup-only`, `setup-runtime` and `cli-metadata`.
- The loader calls `register(api)` once per load, with the mode of that load's plan.
- A plugin that is not a channel meets four modes: `cli-metadata` for CLI metadata capture, `tool-discovery` for a scoped tool load, `full` for a load with runtime side effects, and `discovery` for any other load.
- Gateway startup loads its plugins in `full` mode, scoped to the startup plugin ids, and then activates that registry.
- Any load with `activate: false` and no `runtimeSideEffects` runs in `discovery` mode and leaves the active registry alone.
- An agent turn reuses the Gateway registry whole when its plugin set and inputs are unchanged.
  Otherwise it loads its own registry in `discovery` mode and borrows the unchanged plugins from the Gateway registry.
- A prepared turn borrows from the Gateway registry only when the turn may bind Gateway subagents, passes no environment of its own, runs in a Gateway request scope, and uses the same `workspaceDir` as that registry.
  A plugin is borrowed only when its load inputs match the lent record's.
  Otherwise the turn's `discovery` load calls the plugin's `register`.
- A plugin that a load borrows from the Gateway registry skips `register` in that load.
  `projectPluginContributions` copies its `tools`, `typedHooks` and `commands`, among other arrays, into the borrowing registry.
- Chat dispatch reads plugin commands from the registry of the current registration context, then of the request scope, then the active one.
- A turn that loads its own registry runs inside it as the request scope, so its command dispatch reads that `discovery` registry.
  A Gateway chat turn takes its prepared inbound registry, or loads one, and dispatches inside that registry's scope.
- `/commands` reads the same registry as chat dispatch: `listPluginCommands` takes `requireActivePluginRegistry`, which returns the registration-context registry, then the request-scope registry, then the active one.
- An agent run takes a plugin's tools from the registry that holds them, or cold-loads the plugin in `tool-discovery` mode.
- A discovery-registry tool that matches a Gateway-registry tool by declared identity is replaced by the Gateway's tool.
- `adoptRuntimeToolRegistrations` walks the tools of the discovery registry, so a plugin that registers no tool in `discovery` mode leaves nothing to replace and no tool for the turn.
- `registerTool` and `registerCommand` are live in `full`, `discovery` and `tool-discovery` modes, as is `on`.
- In `setup-only`, `setup-runtime` and `cli-metadata` modes, `registerTool`, `registerCommand` and `on` are no-ops.
- In `cli-metadata` and `setup-only` modes, any read of `api.runtime` throws.
- Each load builds its own registry, so a name registered in two passes never meets itself.
- A second command with the same name in one registry is rejected with a registration error.
- A second tool with the same name in one registry is kept, then dropped at resolution with a name-conflict error.
- `registerTool` needs the tool name in the manifest's `contracts.tools`, or the registration is refused.
- Before a tool's `execute`, the agent loop checks the call's arguments against the tool's parameter schema and answers a failed check with a validation error.
  So in an agent run, an argument the schema does not allow never reaches `execute`.
- With the tool and the commands registered in `full` and `discovery` mode (before the hook joined `discovery`), `/commands` listed `/model-router-provider` and `/model-router-scope`, and `/model-router-scope extended` wrote `extended` to the config.
  That held after a fresh Gateway start and after an install into the running Gateway.
  A build that registered them in `full` mode only also listed them in that run.
- With the hook registered in `full` and `discovery` mode, a Gateway chat turn on `openrouter/openai/gpt-4.1` called `sessions_spawn` with a task alone.
  The child session ran on `openai/gpt-4.1-mini` through OpenRouter with thinking level `medium`.
- A Gateway chat turn with a prepared plugin generation runs inside that generation's scope, and its hook runner then reads hooks from that registry alone, with no overlay of the Gateway registry.
  `before_tool_call` always runs through that hook runner.
  So a plugin that registers its `before_tool_call` hook only in `full` mode routes no `sessions_spawn` of a turn whose `discovery` load called its `register`.
  A plugin is borrowed or registered in one registry, never both, and the overlay keys typed hooks by plugin id and hook name, so a hook in `full` and `discovery` runs once per call.
- Activating a registry initialises the global hook runner from it.
- `api.on("before_tool_call", handler, { matcher: ["sessions_spawn"], priority: 100, timeoutMs: 10000 })` was accepted.
- `api.pluginConfig` held only `plugins.entries.<id>.config`.
  The operator's `hooks` settings sat under `api.config.plugins.entries.<id>.hooks`, readable at registration.
  `api.runtime.config.current` exists.
- A plugin loaded from `plugins.load.paths` without an install record loaded with a trust note and was active.

### OpenClaw hook and spawn

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-hook-and-spawn)

- `before_tool_call` receives `event.toolName` and `event.params`, and `ctx.agentId`, `ctx.sessionKey` and an optional `ctx.abortSignal`.
  It can return `params`, `block` or `requireApproval`.
- A handler that returns `params` rewrites the tool parameters.
  Each handler sees a copy of the original event, and the last returned `params` wins.
- Native Codex tools reject parameter rewrites.
  OpenClaw passes Codex's own `spawn_agent` to `before_tool_call` under that name, and it refuses the call when a handler changes its arguments.
  The hook runner calls only handlers whose matcher covers the tool, so a handler registered for `sessions_spawn` never sees `spawn_agent`.
- The plugin hook `subagent_spawning` was removed before 2026.10.10. Only `subagent_spawned` remains, and it observes a launch without changing it.
- Swarm's `agents.run` calls the `sessions_spawn` tool from the run's tool catalogue, whose entries carry the `before_tool_call` wrapper.
  The hook sees `toolName` `sessions_spawn` and the swarm keys, such as `collect` and `groupId`, and a returned `params` applies.
- `hooks.timeouts.<hookName>` overrides `hooks.timeoutMs`, which overrides the plugin's `timeoutMs`.
  Both operator fields take positive integers up to 600000 ms.
- A `before_tool_call` handler gets 15 seconds by default, and a thrown error or a timeout blocks the tool call.
  The global hook runner marks `before_tool_call` fail-closed.
- A hook timeout does not abort the handler.
- `ctx.abortSignal` aborts only when the owning tool call is cancelled. A hook timeout does not abort it.
- The plugin's `api.logger` is the registry logger, bound once when OpenClaw builds the plugin API. No hook call or hook timeout gates it.
- At the plugin's routing limit, the spawn ran unchanged.
  The hook timeout was 3000 ms, so the routing limit was 1000 ms. The Jev request went through a proxy that accepted the connection and never answered.
  The child's first model request came about 1 s after the routing limit, on the caller's model, a local stub that refused connections.
- The operator's per-hook timeout of 12 s beat the plugin's 10 s and the all-hooks value of 20 s.
  A handler that slept 13 s got `403 Tool call blocked because before_tool_call hook failed`, and the log read `timed out after 12000ms`.
  A handler that slept 11 s, over the plugin's own 10 s, finished and blocked by its own result.
- The handler saw event keys `toolName`, `params` and `toolCallId`, and context keys `toolName`, `agentId`, `sessionKey`, `abortSignal` and `toolCallId`.
  `ctx.agentId` was the requester, and `ctx.abortSignal` was an `AbortSignal`.
  The `params` held only the keys the caller passed.
- The hook wraps the tool in the agent tool wrapper.
  Loopback MCP calls run the same hook and execute with the hook's `params`.
- `before_tool_call` receives the arguments that the tool reads next.
  The wrapper passes the call's `params` to the hook, and `sessions_spawn` defines no `prepareBeforeToolCallParams` to rewrite them first.
  Only a trusted tool policy or a granted approval may adjust them before the hook.
  The tool's `execute` then receives the hook's returned `params`, or the original ones when the hook returns none.
- `sessions_spawn` reads `agentId`, `label`, `model` and `thinking` through `readToolStringParam`.
  That function takes the key as written when the params object has it, else the snake_case form, such as `agent_id`.
  A key that is present wins even when its value is empty or not a string.
  It counts the value only when it is a string, trims it, and treats an empty result as absent.
  `model` then passes `normalizeToolModelOverride`, which also treats `default`, in any case, as no override.
  The tool reads `runtime` as `params.runtime === "acp"`, and `taskName` as `params.taskName`, with no snake_case form.
- A handler that returned `{ params: { model, thinking } }` set both on a real `sessions_spawn`.
  The shallow merge kept `task`, and the result read `status: accepted`, the routed model, `modelApplied: true` and `mode: run`.
  The child transcript held a `model_change` to the routed model and a `thinking_level_change` to the routed level.
  The caller's session read thinking `off` and the child's read the routed level, with reasoning tokens in its reply.
- The same rewrite took effect when the caller's agent ran on the Claude CLI backend.
  The hook fired for the loopback MCP call, with event keys `toolName`, `params`, `runId` and `toolCallId`.
  The result, `resolvedModel` and the child's transcript matched the embedded-runtime run.
  The run showed no login, logout, expiry or credential message.
- A native sub-agent inherits the caller's model and explicitly chosen thinking level, unless `agents.defaults.subagents.model` or `.thinking` is set, or the agent sets `subagents.model` or `subagents.thinking`.
  An explicit `sessions_spawn.model` or `.thinking` still wins.
- `sessions_spawn` takes `taskName`, `label`, `agentId`, `runtime` (`subagent` or `acp`), `model`, `thinking`, `context`, `mode`, `thread`, `visible` and `sandbox`.
  An invalid `model` is skipped with a warning in the tool result.
- A visible session is created through `sessions.create`, and a thinking override is unavailable on that path.
- OpenClaw rejects a spawn's `thinking` only when the string does not normalise to a known level.
  The error reads `Invalid thinking level`.
  A known level that the model does not support, such as `xhigh`, passes the spawn.
  At run time OpenClaw clamps it to the closest supported level and shows a notice, `Thinking level clamped to <effective> for <provider>/<model> (requested <level>; preference retained).`
  `api.runtime.agent.resolveThinkingPolicy` exists.
- Explicit native subagent model selections keep their normal precedence and strictness.
  An agent's `model` is strict unless it carries its own `fallbacks`.
- `outputSchema` requires `collect: true`, and a collector child needs a tool policy that permits the collector tools.
- `sandbox: "require"` rejects a spawn unless the child runtime is sandboxed.
  A CLI backend runs under the external CLI's own sandboxing, not OpenClaw's.

### OpenClaw commands and owner check

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-commands-and-owner-check)

- A plugin command declares `requiredScopes`, and a command with a non-empty list can receive `senderIsOwner`.
  The admin scope is `operator.admin`.
- A client with `operator.admin` ran the command, and the handler got `senderIsOwner: true` and `gatewayClientScopes` with the scope.
  A client with `operator.read` and `operator.write` only got `This command requires gateway scope: operator.admin.`, and the handler did not run.
- A channel message carries no gateway scopes.
  `GatewayClientScopes` is set only for a message from the gateway client, and the command context passes it on as `gatewayClientScopes`.
- For a command with `requiredScopes`, OpenClaw blocks a client whose scopes lack the scope.
  It blocks a caller with no scopes unless `senderIsOwner` is true.
  So a channel owner passes the check and the handler runs with no `gatewayClientScopes`.
  OpenClaw exposes `senderIsOwner` to the handler, and it runs `assertOwnerCurrent` when the scopes are not an array.
  The plugin's handler therefore checks `senderIsOwner === true` and does not read the scopes.
- A Gateway client with `operator.admin` reaches the handler, and `senderIsOwner` is `true` for it.
  `chat.send` sets the provider of every Gateway client's message to the internal channel and passes the client's scopes on.
  The command check then marks the sender as owner when the provider is the internal channel and the scopes include `operator.admin`.
  So a handler that checks `senderIsOwner` alone refuses no admin Gateway client from `chat.send`.
- OpenClaw compares agent ids after `normalizeAgentId`, which trims, lower-cases and turns invalid characters into dashes.
  It finds an agent in `agents.entries`, or in the older `agents.list` array of `{ id }` items when `entries` is absent.
- Configuration, enable, disable, install and uninstall changes through the Control UI need `operator.admin`.

### OpenClaw runtime, logs and environment

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-runtime-logs-and-environment)

- The Gateway ran on Bun.
  `fetch`, `AbortSignal.any` and `AbortSignal.timeout` were functions in the hook and the command handler, and `fetch` reached an external host.
- A config write under `plugins.entries.<id>` makes the Gateway replace that plugin's runtime instance.
  The replacement waits for the old instance's retained work to finish, up to a 60 s drain budget.
  While it waits, the Gateway logs `Plugin replacement queued behind <n> retained work item(s) for plugin <id>; applies when they finish within the 60s drain budget.`
  It logs `Plugin replacement applied: <id>` when the replacement takes over.
  Until then the old instance serves every call, and its `api.runtime.config.current()` returns the old config.
  OpenClaw throws `Gateway requester authority changed` when a request's client authority is no longer current.
- `api.logger` is a scoped logger with `debug`, `info`, `warn` and `error`.
- A workspace `.env` is a lower-trust source.
  OpenClaw drops known provider credential variables from it, and `OPENROUTER_API_KEY` is on that list.
  `TYPESAFE_API_KEY` is not on the static list.
  The global `~/.openclaw/.env` and the Gateway's process environment are trusted sources.
- Plugins receive resolved values for the `secretInputs` paths a manifest declares.
  The page says: "plugins receive resolved values with defaults selected from the source config".
  This plugin declares `api_key` and `openrouter_api_key`.
  It reads the live config first, where it skips a value that is not text, such as an unresolved SecretRef object, and then `api.pluginConfig`.
  No live probe has checked a SecretRef.

### OpenClaw question tool

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-question-tool)

- The tool is `ask_user`, labelled "Ask User".
- A call takes 1 to 3 questions. Each has an `id`, a `header` of 12 characters, a `question`, 2 to 4 `options` with a `label` and an optional `description`, and an optional `multiSelect`. OpenClaw adds a free-text "Other" itself.
- Only the main session gets the tool. Subagents do not, and `tools.deny` removes it.
- The Control UI, the TUI, the iOS, macOS and Android apps, Telegram, Discord, Slack and Mattermost show the prompt. On the messaging channels a prompt with several questions degrades to text.
- WhatsApp, Signal and iMessage do not expose `ask_user`, so the agent asks in plain text.

### OpenClaw project skills and the Gateway

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-project-skills-and-the-gateway)

- OpenClaw reads skills from `<workspace>/skills` and `<workspace>/.agents/skills` of the agent's workspace, and `skills/` wins a name clash.
  It never walks up into parent folders, and it does not read `.claude/skills`.
- `OPENCLAW_HOME`, `OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH` replace the home folder, the state folder and the config file.
- `openclaw gateway run` starts the Gateway. It refuses to start unless `gateway.mode` is `local`, and `--allow-unconfigured` skips that check.
- `POST /tools/invoke` takes `tool` and `args`, and with `gateway.auth.mode` `token` it needs `Authorization: Bearer <token>`.
  `sessions_spawn` is on its default deny list, `gateway.tools.allow` lifts that, and a denied tool returns 404.
- `SIGINT` or `SIGTERM` stops the Gateway process. A shell or wrapper that does not forward signals leaves the Gateway serving after the wrapper is killed.

### OpenClaw gaps

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-gaps)

CI installs the packed tarball through `npm-pack:` on the OpenClaw release that `.github/actions/setup-openclaw/package.json` pins, and the probes loaded the plugin through `plugins.load.paths`.
The registry install of the npm package has not run, because the package is not published yet.
The `npm:` install command rests on documentation.
No run kept the `inspect --runtime` report.
The `package` job's log holds the check's verdict, not the JSON, so that the report lists no hook or command rests on the source.
The commands write the config through `api.runtime.config.mutateConfigFile`, and no live run has checked that write.
The plugin update page says updates need a stopped Gateway.
The plugin management page says an update refreshes a running one.
The two pages disagree, and no run settled it.
The hook runs only when a tool call runs.
Five paths start an agent session without that tool. [Paths the hook never sees](../plugins/model-router-openclaw/README.md#paths-the-hook-never-sees) lists them.
No source read lists every such path.
The meeting bot's realtime consult also runs an agent under a sub-agent session key without that tool.
No run covers a sandboxed child with a CLI-backend model, or an `outputSchema` spawn on a model without tools.
The sandbox rule for CLI backends and the collector child's need for tools rest on the documentation.
The source check of the workspace `.env` list left out variables that an installed provider plugin adds.
OpenClaw may drop `TYPESAFE_API_KEY` when such a plugin declares it.
No run has shown the `skipped, cancelled` line. It rests on the `ctx.abortSignal` source and the unit tests.
`before_model_resolve` can replace a run's model, provider and fallback chain.
It receives only the prompt and attachment metadata, and its result holds no thinking level.
It runs at the start of every embedded agent run, a sub-agent's included, unless the session's model selection is locked.
A sub-agent run shows only in `ctx.sessionKey`, which reads `agent:<id>:subagent:<uuid>`.
The plugin does not use this hook.
It would run on every turn of every session, not once per spawn.
It also cannot set the effort, which the plugin sets through `sessions_spawn`'s `thinking` as the other plugins set theirs.

## Hermes Agent

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-agent)

This repository's plugin requires Hermes 0.22.6 or later, set by `requires_hermes` in `plugin.yaml`, and CI installs the release that `.github/actions/setup-hermes/action.yml` pins.

### Hermes install and update

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-install-and-update)

- `hermes plugins install` takes a catalog name, `user/repo`, or a path inside a repository: `owner/repo/path/to/plugin` downloads only that folder's files.
  Third-party plugins are off until their name is in `plugins.enabled`, and `plugins.disabled` always wins.
  After an install, Hermes asks `Enable 'name' now? [y/N]`, which defaults to no. `--enable` and `--no-enable` skip the question.
- `--ref <40-character commit>` pins an install to one immutable commit. Tags, branches and short hashes are not accepted.
  `hermes plugins update` refuses to move a pinned plugin. `hermes plugins install <source> --force --ref <new-commit>` moves the pin.
- `hermes plugins update <name>` pulls the latest code of a Git-installed plugin and scans it first.
- Hermes checks `requires_hermes` before it imports a plugin and blocks the load with `requires hermes <spec>, running <version>`.
- `ctx.register_delegation_provider(provider)` takes an instance of `DelegationProvider`, and `provider.name` is matched by `delegation.backend`.
  A registration logs `Plugin '<name>' registered delegation provider: <backend>` at INFO.
- A delegation backend change applies from the next session. `/delegation <backend> --now` rebuilds the running session's tools at its next turn.
  A hand edit of `delegation.backend` changes nothing in a running session.
- A configured backend that no enabled plugin provides fails closed. `delegate_task` returns a tool error that ends in `No subagent was started.` and names `hermes config set delegation.backend default` as the fix.
  A disabled or removed plugin is such a case.
- `hermes plugins install file://<repo>#plugins/<name> --enable` with standard input closed installed and enabled a plugin from a subfolder with no prompt.
  The scan gave the verdict `safe`.
- `hermes plugins capabilities model-router-hermes` printed `declared: (none)`, and `hermes plugins doctor model-router-hermes` passed discovery, manifest, import and registration with `registrations: 1 tool(s), 0 hook(s)`.

### Hermes package files

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-package-files)

- A plugin folder holds `plugin.yaml` and `__init__.py` with `register(ctx)`.
  `plugin.yaml` carries `name`, `version`, `description`, `kind`, `requires_hermes`, `provides_tools` and `config_schema`, among others.
  `provides_tools` lists the tools the plugin registers and does not decide whether they load.
- `config_schema` describes the keys under `plugins.entries.<id>.settings`. A mismatch logs a warning and never fails the load.
  The types are `str`, `int`, `float`, `bool`, `list`, `dict` and `secret`. A `secret` entry names the `.env` variable that stores it with `env:`.
- This repository's `plugin.yaml` holds JSON text, which is valid YAML. The builder writes it from `metadata/source.json` and `src/`.
  `hermes plugins validate` parsed it, and reported that its `requires_hermes` spec parses and `config schema — shape valid`.
- The plugin registers its skill folders with `ctx.register_skill(<folder name>, <SKILL.md>)`. The agent loads a plugin skill as `skill_view("<plugin>:<skill>")`.
  Plugin skills are read-only, and the system prompt's skill index does not list them.

### Hermes registration and settings

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-registration-and-settings)

- `ctx.get_config(key, default)` reads `plugins.entries.<plugin id>.settings.<key>`, and returns `default` when the entry or the key is absent. It applies no `config_schema` default.
  `ctx.set_config(key, value)` writes one value in that subtree.
- `hermes config set plugins.entries.model-router-hermes.settings.small_model '{"provider": "openrouter", "model": "openai/gpt-4.1-mini"}'` stored a mapping with those two fields. `hermes config get` printed them on two lines.
- A `secret` entry never reaches `config.yaml`. The Desktop settings form stores it in `.env` under the entry's `env:` name, and the plugin reads it with `get_secret(NAME)` from `agent.secret_scope`.
- `get_secret("TYPESAFE_API_KEY")` returned the value from the Hermes home's `.env`, for a plugin that declared a `config_schema` secret with `env: TYPESAFE_API_KEY`, in process and in the plugin host. The variable was also in the environment of the host and of the gateway.
- `ctx.get_config("probe_setting")` returned the value from `plugins.entries.probe-router.settings`, in process and in the plugin host.
- A plugin slash command's handler runs in the gateway process that owns the session. It can declare `session_id`, `session_key`, `platform` or `source` as keyword arguments, and Hermes passes them.
  The handler returns its text.
- Hermes names `api_server`, `cli`, `codex`, `desktop`, `gateway`, `kanban`, `local`, `msgraph_webhook`, `tool`, `tui` and `webhook` as surfaces that are not a human messaging channel.
  The plugin's `/model-router-provider` writes only for `local`, `cli`, `tui` and `desktop`, four of those names. `localPlatforms` in `constants.json` lists them.
- With no saved tool selection, a plugin's toolset is on by default. Enabling a plugin puts its toolset back into a saved selection.

### Hermes routing and refusals

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-routing-and-refusals)

- `DelegationProvider` is an abstract class. A backend implements `name` and the synchronous `route_task(task, config)`. `is_available()` returns true by default, and false fails delegation closed.
  `config` is the `delegation` section of the active profile's `config.yaml`, and `dict(config)` is the default route.
- `route_task` gets `{goal, context, index}` plus the parameters the backend declared. This plugin declares three, as [Hermes task parameters](#hermes-task-parameters) says, and `context` can be `None`.
  Nothing else crosses: no role, no agent description, no toolsets, no images and no output schema.
- The `config` argument held `api_key, api_mode, backend, backends, base_url, child_timeout_seconds, compression_threshold_tokens, fallback_providers, gateway_mode, independent_completions, inherit_mcp_toolsets, max_concurrent_children, max_iterations, max_spawn_depth, max_summary_chars, model, oneshot_max_children, orchestrator_enabled, provider, reasoning_effort, request_overrides, subagent_auto_approve, surface_child_process_notifications`. `backend` was the plugin's backend name.
- A route may carry `model`, `provider`, `base_url`, `api_key`, `api_mode`, `request_overrides`, `reasoning_effort`, `service_tier`, `fallback_providers`, `profile` and `label`. Hermes drops every other key silently.
  Hermes's own default backend returns the `delegation` section without `service_tier`.
  This repository's `router.py` returns the same dict with a `label`, a `model`, a `provider` and a `reasoning_effort` changed on top, so `api_mode` and `request_overrides` stay in every route, also when the provider changes.
- A returned route resolves through the credential resolver of the `delegation` section. A `provider` runs `resolve_runtime_provider`; an empty route inherits the parent's route.
  `request_overrides` apply on every branch.
- A child's effort is the route's effort, else `delegation.reasoning_effort`, else the parent's level.
  A backend's `reasoning_effort` outside the known levels refuses the task, except a value equal to `delegation.reasoning_effort`.
- A child pinned by provider, endpoint or model gets no fallback providers unless `delegation.fallback_providers` declares them.
- A raise from `route_task` refuses that task: Hermes logs `delegation provider <name>.route_task() raised` and reports `Task <i>: delegation backend '<name>' failed: <error>`.
  A return of `None` or of a non-mapping refuses it too. A refusal is per task, and the call is a tool error only when every task is refused.
  A returned `{}` is not a refusal: the child inherits the parent's route.
- Hermes routes the tasks of a call in one loop, in index order, in the thread that runs the call. It builds the children after the loop ends.
  `delegate_task` is exempt from the generic sequential tool deadline, so Hermes puts no timeout around `route_task`.
- The main agent's turn is not routed through the provider. Only `delegate_task` tasks are, and internal callers that pass their own credentials bypass the backend.
- `label` is short text shown with the child's progress and result. Every result entry of a task routed by a non-default backend carries `route`: the backend, the label, and what the child ran on.
- A delegated task takes the routed model and effort. One in-process task, routed to `openai/gpt-4.1-mini` at effort `low`, ran a child session with `model = openai/gpt-4.1-mini` and `reasoning_config = {enabled: true, effort: low}`.
  The result entry carried `route: {backend: probe-router, label, model, provider: openrouter, reasoning_effort: low, service_tier: normal}` and the summary `pong`.
  Under `plugins.isolation: host`, two tasks of one call routed to `openai/gpt-6-luna` at effort `low` ran two child sessions with `model = openai/gpt-6-luna` and effort `low`; the summaries were `ping` and `pong`.
- This repository's plugin routed a real call. One `delegate_task` call held a lookup task and a design task. The provider was `typesafe`, `small_model` was `openrouter openai/gpt-6-luna` and `large_model` was `openrouter openai/gpt-6.1-terra`.
  In process, the child sessions ran `openai/gpt-6-luna` at effort `medium` and `openai/gpt-6.1-terra` at effort `high`. Each result entry carried the plugin's label in `route.label`, and `agent.log` held the plugin's line for each task.
  After `hermes gateway stop` and `plugins.isolation: host`, the same call gave the same levels, models and efforts. `route.label` carried both labels, and `agent.log` held no plugin line.
- Hermes maps a requested effort that a wire does not support to the nearest weaker supported level, and to the weakest level when none is weaker.

### Hermes task parameters

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-task-parameters)

- `DelegationProvider.task_parameters(config)` returns `{name: json_schema}`, which Hermes merges into `delegate_task`'s `tasks.items.properties`. `description(config)` returns a line that Hermes appends to the tool description after a line break.
  Hermes calls both when it builds a session's tool list, and both must give the same bytes for the same `config`, because the schema is part of the cached prompt.
- Both methods exist from Hermes v0.22.5, the first release with delegation providers.
- A parameter name must match `^[a-z][a-z0-9_]{0,63}$` and stay out of the reserved names `goal, context, index, output_schema, images, group, role, toolsets, acp_command, acp_args, provider, model, base_url, api_key, api_mode`. Hermes drops a refused name with a warning and keeps the others.
- Before `route_task`, Hermes checks only three things. A non-`None` value for a name no backend declared refuses the task. A value outside a declared `enum` refuses it. A `None` value counts as absent.
  Hermes checks no `type`. A `level` of `True` passes the enum `[0, 1, 2]`, because Python compares `True` equal to `1`.
- The payload is `{goal, context, index}` plus each declared parameter whose value is not `None`.
- This repository's plugin declares `description`, `reasoning_effort` and `level`, and appends one line from `constants.json`. `schema_extension` returned all three, none reserved, and `_build_dynamic_schema_overrides()` put them in `tasks.items.properties` and ended the tool description with the line.
- A session routes on the backend its `delegate_task` schema was built from. A plugin update or a backend change applies from the next session, or at the next turn after `/delegation <backend> --now`. A task that carries a parameter its session's schema lacks is refused alone.
- A real delegating model filled the parameters. One `delegate_task` call held a new task and a re-dispatch of a task described as failed at level 1. The provider was `typesafe`, `small_model` was `openrouter qwen/qwen3.7-flash` and `large_model` was `openrouter openai/gpt-6-luna`.
  The model gave both tasks a `description`, and gave the re-dispatch `level: 2` and `reasoning_effort: "high"`.
  The re-dispatch ran on `openai/gpt-6-luna` at effort `high`, and its result's `route` held `backend`, `provider`, `model`, `reasoning_effort` and `service_tier` but no `label`. `agent.log` held the plugin's line for the new task only.
- Under `plugins.isolation: host`, the parent builds a `DelegationProvider` whose methods run in the plugin host, so `task_parameters` and `description` cross as plain JSON.
- A route without a `fallback_providers` of its own takes `delegation.fallback_providers`, and a profile route keeps its profile's chain. The plugin's route copies the `delegation` section, so a routed child gets exactly that list, and none when it is `null`.
- A route may name a `profile`, which runs the child as another Hermes profile with its own config, model, credentials, skills and `SOUL.md`. Hermes ignores every other route key on it. Hermes v0.23.1 adds a `route_keys` property for settings editors, which routing does not use. The plugin sets neither.

### Hermes question tool

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-question-tool)

- The tool is `clarify`, in the toolset `clarify`.
- A call takes 1 to 5 `questions`. Each has a `question`, optional `choices` (up to 4) and optional `multi_select`. The UI adds "Other".
- `clarify` is in `_HERMES_CORE_TOOLS`, which `hermes-cli` and the messaging bundles use.
- It works in the CLI, the TUI, Desktop and the messaging platforms.
- The editor integration (`hermes-acp`) and the API server (`hermes-api-server`) exclude it.
- Cron runs disable it.
- Children of `delegate_task` cannot call it.
- Single-query mode (`hermes chat -q`) returns `outcome: "undelivered"` at once.

### Hermes runtime, logs and environment

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-runtime-logs-and-environment)

- A `hermes -z` turn on a home with no gateway starts one, with `python3 -m hermes_cli.main --profile default gateway run --quiet --idle-exit`. On macOS it starts as a one-off launchd job through `osascript`.
  The provider runs in that gateway process, on a `ThreadPoolExecutor` thread.
- The gateway keeps the plugin loaded between CLI turns. Module state carried over from turn 1 to turn 2: a counter read 1, then 2 and 3, in one process.
  A change of `plugins.isolation` or of the plugin's code applies after `hermes gateway stop`. The turn that followed a change of `plugins.isolation` without a stop did not run in host mode, so the probe did not count it.
  `hermes gateway stop` with `HERMES_HOME` set stops the gateway and its plugin host.
- Under `plugins.isolation: host`, the provider ran in `python3 -m hermes_cli.plugin_host_child`, a child of the gateway, one per profile. `HERMES_PLUGIN_HOST_PROCESS` was set, the context was `RemotePluginContext`, and the call thread was `plugin-host-rpc`.
  Module state persisted across the tasks of one call: a counter read 1, then 2, in one host process.
- `hermes_constants.find_node_executable("node")` reads the Node that Hermes's package manager selected, and returns `None` when it installed none. It never falls back to the Node on the user's `PATH`.
  It found Hermes's Node in both modes. A Node round trip (spawn, standard input, standard output) took 63 to 89 ms in process and 376 to 388 ms in the host.
  `route_task` took 78 to 102 ms in process, 1726 ms for the first task in a fresh host and 401 ms for the next.
- Hermes writes `agent.log` at INFO and above, in the `logs` folder of the Hermes home. The plugin host sets its own log level from `HERMES_PLUGIN_HOST_LOG_LEVEL`, with `WARNING` as the default, so it drops INFO lines unless the variable says otherwise.
- Hermes runs natively on Windows 10 and Windows 11, without WSL. `find_node_executable` has Windows branches.
  A program started with a replaced environment on Windows needs `SYSTEMROOT`, so the plugin passes it to Node.
- `NODE_USE_ENV_PROXY=1` makes Node parse `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` at start-up and route requests through the proxy. Node added it in v24.0.0 and v22.21.0.
  The plugin sets it when `HTTPS_PROXY`, `HTTP_PROXY` or their lower-case forms are present, unless the environment sets it.

### Hermes install scan and validate

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-install-scan-and-validate)

- Every `hermes plugins install` and `hermes plugins update` scans the plugin tree before it activates it. The verdicts are `safe`, `caution` (confirm, or pass `--force`) and `dangerous` (blocked, and `--force` does not override).
  Documentation prose cannot make a verdict `dangerous` alone, but a leaked provider key keeps its full severity there, and so does anything under a bundled `skills/` tree.
- A medium finding alone is `safe`. The rule `python_subprocess` is medium severity.
- `scan_plugin` over `plugins/model-router-hermes` gave the verdict `safe` with one finding: `python_subprocess`, severity medium, category execution, at `node.py` line 87.
- A probe plugin that shipped a copy of the OpenClaw esbuild bundle (71 KB) gave one medium finding, `python_subprocess`, at the `subprocess.run(` line, and none for the bundle. Its first install attempt was blocked as `dangerous` by a key-shaped literal.
  The rule matches a name containing `secret`, `token`, `api_key` or `password` assigned a quoted value of 20 or more characters. No file of the plugin may hold one outside its `tests/` tree, where the rule caps a finding at medium.
- `hermes plugins validate plugins/model-router-hermes` passed with 15 checks marked passed, including `security scan — safe`, and one warning.
  The warning listed the plugin's imports of private Hermes modules.
  It says such imports can break on any release. CI runs `validate` on the pinned release and a Renovate rule raises the pin, so a break shows in CI ([Hermes CI](#hermes-ci)). It ends with `Isolation — runs in the plugin host (plugins.isolation: host)` and `Validation passed.`
- The admission lint lists a plugin's imports of private Hermes modules with file and line. It is a warning and never a refusal. The public list holds `agent.delegation_provider`, `agent.delegation_backends`, `agent.secret_scope` and `hermes_constants`, and none of the modules the warning named.
- A probe plugin's `hermes plugins validate` passed with one warning that listed four private core imports, and a note that the plugin runs in the plugin host under `plugins.isolation: host`. `hermes plugins doctor <name>` passed discovery, manifest, import and registration.

### Hermes CI

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-ci)

- The `hermes` job runs the plugin's tests on Python 3.11 and 3.14 with `uv`, runs `hermes plugins validate plugins/model-router-hermes`, installs the plugin from the checkout with `hermes plugins install "file://$PWD#plugins/model-router-hermes" --enable < /dev/null`, checks `hermes plugins list --plain --no-bundled`, sets `delegation.backend` to `model-router` and reads it back, and runs the tests again under Hermes's own interpreter.
  The install clones the checkout's own commit through a `file://` route, as a user's install clones the repository's subfolder.
  Hermes keeps its home under the runner's temp folder, and no key is set.
- The `setup-hermes` action clones the release tag, checks that `HEAD` equals the pinned commit, and runs `uv sync --frozen --no-dev --no-build --python 3.14`, so only the wheels that Hermes's own `uv.lock` locks install. It then checks that `hermes --version` names the tag.
  It pins a release tag and the commit of that tag. A Renovate rule raises the tag and the commit together with no age delay (see [CONTRIBUTING.md, Dependencies](../CONTRIBUTING.md#dependencies)).
- The tests of the plugin call each handler and the router directly with a fake Hermes API. One test file, `plugins/model-router-hermes/tests/test_real_hermes.py`, runs only under Hermes's interpreter. It calls each Hermes function the shim uses, and compares the default route with Hermes's bundled default backend.
  It also registers the provider with Hermes's delegation registry, reads the `delegate_task` schema, and routes tasks through `resolve_task_routes`, so a pin raise that changes the parameter seam fails CI. Those tests use Hermes's private name `_registry`. They read the schema through `tools.registry.registry.get_definitions` with a temporary `HERMES_HOME`, as Hermes documents.

### Hermes project skills and home

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-project-skills-and-home)

- Hermes reads project skills from `.hermes/skills` and `.agents/skills` under the project root, the nearest folder at or above the working directory that holds `.git`.
  It loads them only when `skills.trusted_project_dirs` lists that root, and the list is empty by default.
  It does not read `.claude/skills`.
- `HERMES_HOME` names the Hermes home.
- `hermes plugins install "file://<repository>#<folder>"` clones the repository with `git clone --depth 1` and installs `<folder>` from the clone, so it takes the committed `HEAD`, not the working tree.

### Hermes gaps

Most probes ran a probe plugin and not this repository's plugin.
The probe plugin ran Node on a small script and shipped the OpenClaw bundle for the scanner.
This repository's plugin passed `validate`, the scan and the `file://` install, as the facts above record. It routed one real call of two tasks, in process and in the plugin host, and one call with task parameters, in process. No run used a fallback between providers, and no run with task parameters used the plugin host.
No run used the repository form `Akurganow/model-router/plugins/model-router-hermes` from the README, a `--ref` pin or `hermes plugins update`.
No run used native Windows, so the `SYSTEMROOT` rule rests on the Python documentation.
No run used a proxy, so the proxy behaviour rests on the Node documentation.
No run sent two concurrent sessions through one gateway. That they share one budget record follows from the gateway facts above.
No run checked that Hermes clamps a routed effort for a delegated child. The clamp is read from `reasoning_effort.py`.
No live session ran `/model-router-provider`, the settings form in Hermes Desktop or the `model_router_config` tool. Their tests call the handlers directly.
The settings form edits a `dict` slot in a JSON editor, as the documentation says, and no run used it.
