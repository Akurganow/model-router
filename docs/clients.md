# How each client loads a package

This page says what each client reads from a package in this repository and from a project folder.
A fact says what the client does, in the present tense, and tells nothing of what a run did.
A condition of a fact stays in it: a setting that must be on, a scope, an isolation mode, or a platform where the behaviour differs.
A version stays only when it is the subject of the fact or when code or CI depends on it.
A fact is as strong as its evidence, and the evidence says which: documented, read in the source, or seen in a run.
A heading with evidence holds one line before its first fact, `Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-<client>#<heading>)`, which links the section of the same name on the client's evidence page.
The heading is the address, so a heading renamed or added here is renamed or added on the wiki too.
[Adding evidence](https://github.com/Akurganow/model-router/wiki#adding-evidence) on the wiki gives the rest of the rules.
The records of this project's own runs are on the [wiki](https://github.com/Akurganow/model-router/wiki).
Install commands are in the [root README](../README.md#install), and each plugin README holds the install-time notes of its harness.
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
- Claude Code keeps a stored `pluginConfigs` value under a key that the manifest does not declare, through load and update.
- A stored `pluginConfigs` value under a key that the manifest does not declare reaches the `options` argument of `register`, when the manifest declares at least one option.
- No settings surface lists such a key: not `/config`, not `/plugin configure`, not the desktop app's plugin settings.
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

### Hooks module

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#hooks-module)

- A mod is a plugin whose `hooks/hooks.json` has a `modules` key.
  The key holds an array with one path, relative to that file, to the hooks module.
- The hooks module is an ES module that exports `register(on, options)`.
  `options` holds the `userConfig` values with their defaults filled in.
  When the list that the manifest's `options` key gives for an option does not hold the option's stored value, the `options` argument of `register` carries the option's default and not the stored value.
  The stored value stays under `pluginConfigs`.
- Claude Code loads `.js` and `.ts` files directly, with no build step.
  A hooks module imports only files inside the plugin directory by relative path, and the one bare import allowed is `claude-code`.
- `$.ui.ask` takes at most four options.
- A free string option that a manifest declares again hands its stored string to the plugin.
- A `config.describe` hook returns `{ label, description, isHidden }` for each `/config` row, keyed `<plugin>.<field>`.
  A hidden row still answers `$.config.set`.
- `$.config.set` rejects a key with no `/config` row, an undeclared key included, with `<plugin>: $.config.set: no /config row with key <key> ($.config.list names them)`.
- No `config.describe` event fires for a key that the manifest does not declare.
- When a hooks module fails, Claude Code skips it and the session continues.
  A broken mod can therefore look like one that does nothing.
- A mod installed from a marketplace loads at the next start of Claude Code, or at `/reload-plugins` in an open session.
- When `$.config.set` writes an option of a mod in an open session, Claude Code reloads the mod's hooks module at once, with no `/reload-plugins`, and runs its `session.start` hook again.
- A running hooks-module call that writes twice with `$.config.set` completes its second write after the reload that its first write caused.
  Both writes land, and the call returns its result after the second reload.
- An option cleared with `$.config.set` to an empty text stays under `pluginConfigs` as an empty string, not as a deleted key.
- A command typed at the prompt of an interactive session reaches `command.run` with the origin kind `composer`. A command given as the prompt of `claude -p` reaches it with another origin.
- In print mode, a turn that ends in a sign-in error exits with status 1, and it has loaded the hooks module and run its `session.start` hook.
- Claude Code caches an installed plugin by version.
  An edit reaches the installed copy only after the version rises and the user installs again.
- A `tool.describe` hook with a `{ tool: "<name>" }` matcher gets `{ tool, description, isDeferred?, provider }` and answers `{ description, isDeferred? }`.
  The engine refuses a hook that passes on a changed `tool` or `provider`.
  It caches the answer by tool name until `$.ui.invalidate`.
- The model sees the answer of a `tool.describe` hook as the tool's description, in the main session and in a subagent that has the tool.

### Subagent events

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#subagent-events)

- `agent.spawn` fires when a subagent or a teammate is about to start, and when a subagent that finished or stopped is about to run again.
  For a resumed run `e.resume` is `{ agentId }`, and Claude Code ignores a changed event passed to `next`.
  The resumed run raises the event from v2.1.299.
- A `SendMessage` to a completed subagent resumes it under the same ID, with no new Agent call.
  Explore and Plan return no agent ID, so Claude cannot resume them.
  A per-invocation `model` and `effort` stay in effect on the resumed run, and `CLAUDE_CODE_EFFORT_LEVEL` outranks the effort.
- A model that a hook sets at `agent.spawn` stays on the run that `SendMessage` resumes.
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
  It also notes that its checks apply none of the plugin directory's own rules for hooks modules.
- `claude plugin test [directory]` runs every file under the directory whose name ends in `.test.ts` or `.test.tsx`.
  It needs no session, sign-in or network, and exits `1` when a test fails.
- Under `claude plugin test`, a `$.ui.ask` dialog given one option holds that option followed by `Yes`.
  Two or more options arrive as given. The type declarations Claude Code writes for a plugin say of `$.ui.ask` that fewer than two options are padded with Yes/No.

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
- `--debug-file <path>` writes the debug log to that path and turns debug mode on.
  Without it the debug log is `~/.claude/debug/<session-id>.txt`.

### Claude Code gaps

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Claude-Code#claude-code-gaps)

The Mods reference gives no rule for three points.
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
- An extension's settings read returns the stored values only, and fills no manifest default for a setting that is not stored.
  `omp plugin config get` prints the manifest default for such a setting.
- A stored `enum` value that the manifest no longer lists stays in the lockfile across an upgrade and reaches the extension as stored.
  `omp plugin config validate` reports it with `Must be one of: <values>` and exits 1.
- omp's extension-package discovery also reads a package's sibling folders `skills/`, `hooks/pre|post/`, `tools/`, `commands/`, `rules/`, `prompts/` and `.mcp.json`.
  So the npm package keeps OpenClaw's skills in `openclaw-skills/`.
- A rule file with `alwaysApply: true` needs no `description`, and its text goes into the system prompt.
  `agents: main` limits the rule to the top-level session.
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
- `omp plugin disable <pkg>` turns off an npm install, and `omp plugin uninstall <pkg>` removes it, each by the package name.
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

### omp install names

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-install-names)

- omp passes an extension no plugin name.
  The extension's API object has no member that names the plugin, the package, the manifest or the settings.
- omp keys the lockfile entries `plugins` and `settings`, the `node_modules/<name>` link and the project override by the `name` in the installed `package.json`.
  An extension can read that name from its own `package.json`, for example through `new URL("../package.json", import.meta.url)` when its bundle sits in a subfolder.
  A lookup under the catalogue entry name, `<entry>@<marketplace>` or another plugin's name finds no settings.
- A catalogue install stores its settings under the package name, not the entry name.
  `omp plugin config set` takes the package name, and the entry name gives `Plugin "<entry>" not found`.
- An npm install of a scoped package stores its settings under the scoped name.
  The unscoped name gives `Plugin "<name>" not found`.
- `omp plugin install` takes a registry name for npm.
  A path to a `.tgz` file fails with `ENOTDIR`, and a local folder installs by link.
- omp rejects a catalogue plugin whose package name equals an installed package name, case-insensitively.
- The settings read of an extension covers the user scope lockfile only.
  A plugin installed with `--scope project` keeps its lockfile under the project, and that read does not see it.

### omp per-call model

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-per-call-model)

- A `task` item may carry `model`, one exact `provider/model-id` selector.
  From omp 18.14.2, omp accepts it only when `task.perCallModel` is `on`, and the setting defaults to `off`.
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
- With `task.perCallModel` on, a role that a `before_subagent_spawn` hook returns for an item that sets its own `model` wins over that model: the spawn runs on the role.
- omp 18.12.6 has no `task.perCallModel` setting, and the setting arrived in 18.14.2.
- At omp 18.12.6 the docs mark the item `model` as seance only.
  Yet the task tool passes it on as the request model for any agent, and the request model outranks the agent's own model.
- From omp 18.18.4 the `task` tool advertises the item `model` only when `task.perCallModel` is `on` or the bundled seance is spawnable.
- The plugin skips every item that sets `model`, so these differences do not change what it routes.
- The item schema of the `task` tool declares `solutionSpace` as a string.
  The tool description asks the agent to put there how open-ended the child's problem is: whether the fix or design is given, or which causes or designs remain open.

### omp tool_call cost and timeout

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-tool_call-cost-and-timeout)

- While any extension has a handler for `tool_call`, `tool_result`, `tool_approval_requested` or `tool_approval_resolved`, omp's speculation host refuses early work with the reason `active extension lifecycle handler`.
- Early task launch asks that gate: the task tool calls `authorizeLaunch` before a launch, and `authorizeLaunch` calls the policy gate.
- `task.speculativeLaunch`, on by default, starts each subagent as soon as its `tasks[]` item has streamed.
  Its description says it requires "no extension tool lifecycle handlers".
- Early local reads ask the same gate.
  `tools.speculativeExecution.enabled`, which turns them on, is experimental and off by default.
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
- An extension reads the configured value through omp's settings lookup, which gives 30000 when no value is set.

### omp model roles

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-model-roles)

- omp knows 16 roles, and `midl` is not one of them.
  Only `smol`, `slow` and the kind roles have catalogue priority lists.
- Model roles live under `modelRoles` in `config.yml`, not in `models.yml`.
  A role's value is a model selector such as `provider/modelId`, and a chat role's value can end in a thinking selector such as `:low`.
- The Roles view of `/models` names `smol` Fast and `slow` Thinking, and ends with a `+ New role…` row that adds a custom role.
- `modelRoles` accepts any role name, so a role such as `midl` needs no change in omp.
- A custom role that `modelRoles` names resolves through `ctx.models.resolve`, and a spawn hook that returns it, with or without a level suffix, runs the child on the configured model.
  A custom role that `modelRoles` does not name gives `undefined`, and a hook that returns it fails the subagent with `Error: No model selected.`
- `ctx.models.resolve` resolves against `modelRegistry.getAvailable()`, which checks configured auth without running a key command.
  A built-in provider with no credential gives `undefined`, for the model id and for a role that names it.
  A `models.yml` provider whose `apiKey` is a command that prints nothing gives a full model, though `getApiKeyForProvider` gives `undefined` for it.
  A hook that returns that role runs the child on the parent's model, with no error.
- A `smol` or `slow` role that `modelRoles` does not name resolves through an explicitly configured `default` model before omp's built-in priority list.
- A child's retry fallback chain is `retry.fallbackChains` at the spawn's own model role, kept from before the role's expansion, and otherwise at `default`.
  A role that a spawn hook returns does not change the spawn's role, so `retry.fallbackChains` at that role does not reach the spawn.
- omp's provider ids for OpenAI and Google are `openai` and `google`.
  `getApiKeyForProvider` and `getApiKeyWithCredentialForProvider`, which the first calls, hand the id they are given to omp's credential lookup unchanged.
  The environment variable of `openai` is `OPENAI_API_KEY`. That of `google` is `GEMINI_API_KEY`, and `GOOGLE_API_KEY` is not read for it.
- omp's provider id for Perplexity is `perplexity`, an auth provider for web search with the environment variable `PERPLEXITY_API_KEY`.
  omp has no Perplexity model provider.
- While omp stores a Perplexity login, its credential lookup for `perplexity` returns that login's session token, not an API key.
  `api.perplexity.ai` rejects the token with HTTP 401.
- In omp's credential lookup a stored OAuth login wins over the environment variable.
- An extension's `ctx.modelRegistry` is omp's full model registry.
  Its `getApiKeyWithCredentialForProvider(id)` returns the key with `oauthAccess` set only when the key came from a stored OAuth login.
  The method exists in omp 18.12.6. `oauthAccess` exists from omp 18.13.2, and an earlier omp sets no such field.
- Of the ids `typesafe`, `openai`, `google`, `perplexity` and `openrouter`, only `perplexity` has a built-in login that stores an OAuth credential.
  omp's OpenRouter login stores a plain API key.

### omp thinking levels

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-thinking-levels)

- A `model` that a `before_subagent_spawn` handler returns replaces the spawn's patterns, and omp expands it like a configured role.
  A role alias with a level suffix, such as `@smol:high`, expands to every pattern of the role with `:high` appended.
- omp reads the text after a pattern's last colon as a level when it is `inherit`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` or `auto`, or a prefix of two characters or more that names one of the first eight only, such as `hi`, `med` or `xhi`.
  The match is case-sensitive.
  Any other suffix, such as `:free` or `:8b`, stays part of the model id.
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
- At omp 18.18.9 only, a user agent whose model tag names a level ignores the item's `effort`.
  The plugin skips a user agent that declares a model, so this rule does not reach a routed spawn.
- A level suffix that a `before_subagent_spawn` hook returns sets the child's level.
  On a role the child runs the role's model at that level, and on the event's own patterns it keeps the parent's model at that level.
- With `task.enableEffort` on, the item's `effort` wins over a hook's suffix.
  A hook's suffix wins over a project agent's `thinking-level` and over a level on the role.
- A level on the `smol` role reaches the patterns that a spawn hook receives for the bundled `scout` agent.
  A level on the `default` role does not reach the patterns of a `task` spawn, and that child runs at its own level, not at the role's.
  A project agent with `thinking-level: low` and no model runs at `low`.
  Under the `extended` scope, the routed effort replaces a level on the `smol` role and a project agent's `thinking-level`.

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
- A standalone omp binary creates `natives/<version>` and sets that folder's times at each start.
  The `natives` folder sits in `~/.omp`, or in `$XDG_DATA_HOME/omp` when that folder exists.
  `PI_NATIVES_DIR`, an absolute path, moves it, and `PI_CONFIG_DIR` does not.
- omp picks the first model from an explicit CLI model, then the first scoped model, then the saved default.
  `--model` is the preferred form, and an exact `provider/modelId` is unambiguous.

### omp gaps

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-omp#omp-gaps)

`marketplace.md` describes no `omp.settings` block and lists no `privacyPolicyUrl` entry field.
The catalogue parser preserves extra entry fields, and the code read does not show what omp does with this one.

The plugin routes the subagents of a `task` call only.
omp also fires `before_subagent_spawn` for eval `agent()` and `workpool()` spawns, with `invocationKind` `"eval"`.
The plugin returns nothing for them, because no `task` batch scored them.
Some subagents start with no `before_subagent_spawn` event, so no plugin can change their model:
`/cleanse` workers, vibe workers, follow-up turns of a running subagent, revived subagents, and a seance that reuses a prepared session.

The facts above do not say how omp clamps a level to the range a model supports.
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
  Without one, they save the change for the next start, and `plugins install` prints `Installed plugin: <id>` and `Saved for the next Gateway start.`
  `openclaw plugins inspect <id> --runtime --json` loads the plugin module and lists what the plugin registers in `tool-discovery` mode, as the next bullet records.
- `openclaw plugins inspect <id> --runtime` loads the plugin in `tool-discovery` mode, not in `full` mode.
  The mode list calls `tool-discovery` "capability discovery for executable tools", and `full` "live runtime activation".
  In that mode this plugin registers only its config tool, so `inspect` lists `model_router_config` and no hook or command.
- The `inspect --runtime --json` report holds the plugin id, the package name and version, a status that reads `loaded` for a loaded plugin, `imported` and `enabled`, the plugin's tools in `contracts.tools`, and diagnostics.
- The Gateway log shows a command registration as `Registered plugin command: /<name> (plugin: <id>)`, once for each command in each plugin load.
  OpenClaw writes the line through `logVerbose`, which logs under `--verbose` or at file log level `debug`.
  A registered hook counts in `hook runner initialized with <n> registered hooks`, a debug-level line of the `plugins` logger.
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
  A schema that sets `additionalProperties: false` rejects a setting the manifest does not declare.
  `openclaw config set` then exits 1, saves nothing and prints `Config change declined. No settings were saved.`
  A config file that holds such a key stops `openclaw gateway run` from starting.
  `openclaw config validate` names the same cause and offers `openclaw doctor --fix`.
- `activation.onStartup` set to `true` imports the plugin when the Gateway starts.
- `contracts.tools` lists the tool names a plugin owns, and a runtime `api.registerTool` call must match it.
- `configContracts.secretInputs` names the config paths under `plugins.entries.<id>.config` that hold secrets.
  `openclaw config set` stores a plain string on such a path and asks for no SecretRef.
  A manifest whose `uiHints` mark such a key `sensitive` loads.
- `package.json` carries `openclaw.extensions`, `openclaw.compat.pluginApi` and `openclaw.install.minHostVersion`.
  OpenClaw enforces the last two when it installs a non-bundled plugin.
- A folder whose `package.json` names `openclaw.extensions` loads as a native package from those entry files, and OpenClaw reads no `rules` folder of it.

### OpenClaw entry and registration

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-entry-and-registration)

- `register(api)` stays synchronous.
  Handlers default to priority `0`, higher priorities run first, and registration order breaks ties.
- `api.on(name, handler, opts)` accepts `matcher`, a non-empty list of tool ids, together with `priority` and `timeoutMs`.
- A default export that is a plain object `{ id, register(api) }`, with no import from OpenClaw, loads and registers.
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
- A plugin's commands registered in `full` and `discovery` mode are listed by `/commands` and run from a Gateway chat turn, after a fresh Gateway start and after an install into the running Gateway.
  Commands registered in `full` mode only are listed there too.
- A `before_tool_call` hook registered in `full` and `discovery` mode rewrites a `sessions_spawn` call in a Gateway chat turn.
  A call with a task alone starts a child session on the model and the thinking level that the hook returns.
- A Gateway chat turn with a prepared plugin generation runs inside that generation's scope, and its hook runner then reads hooks from that registry alone, with no overlay of the Gateway registry.
  `before_tool_call` always runs through that hook runner.
  So a plugin that registers its `before_tool_call` hook only in `full` mode routes no `sessions_spawn` of a turn whose `discovery` load called its `register`.
  A plugin is borrowed or registered in one registry, never both, and the overlay keys typed hooks by plugin id and hook name, so a hook in `full` and `discovery` runs once per call.
- Activating a registry initialises the global hook runner from it.
- `api.pluginConfig` holds only `plugins.entries.<id>.config`.
  The operator's `hooks` settings sit under `api.config.plugins.entries.<id>.hooks`, readable at registration.
  `api.runtime.config.current` exists.
- A plugin loaded from `plugins.load.paths` without an install record loads with a trust note and is active.
  The note is a diagnostic of level `warn` that starts `OpenClaw can't verify where this plugin came from` and carries `reason=record-missing`, in `openclaw plugins inspect --runtime --json` and in the Gateway log.
  The check that raises the note reads the plugin's status, origin, trust reason and install records and `plugins.allow`, and nothing of `configSchema`, `uiHints` or `configContracts`.
  The plugin's id in `plugins.allow` silences the note.
- `openclaw plugins doctor` exits 1 on a diagnostic, that trust note included.
  The doctor passes over one kind alone: the note that an explicit config-selected plugin resolved a duplicate plugin id.

### OpenClaw setup entry and config migration

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-setup-entry-and-config-migration)

- A plugin can ship a setup entry that OpenClaw loads in a pass of its own.
  `openclaw.setupEntry` in `package.json` names it. Without that field OpenClaw takes a file named `setup-api` with one of the extensions `.js`, `.mjs`, `.cjs`, `.ts`, `.mts` or `.cts`, at the plugin root or in its `dist/` folder.
- The pass builds an `api` in `setup-only` mode whose `runtime` is unavailable, and calls the module's `register(api)`.
  It skips a module whose `register` is missing or whose `id` differs from the manifest id.
  A default export that is a plain object `{ id, register(api) }` serves.
- `api.registerConfigMigration(migrate)` records the function.
  The setup pass calls `migrate(cfg)` with the whole config and reads `{ config, changes }` from the result. A result of `null` or `undefined` reads as no change.
- The pass reads the setup entry of each plugin that has an entry under `plugins.entries`.
- `setup.requiresRuntime: false` in the manifest keeps OpenClaw from executing the setup entry.
  An omitted field keeps the entry in use.
- `setup.configMigrations` lists the ids of the migrations that the setup entry owns.
- Only `openclaw doctor` runs the migrations that setup entries register.
  `openclaw update` runs a fresh `doctor --repair` when a plugin changed, and then validates the config in a new process.
- `openclaw plugins update <id>` runs no setup-entry migration.
  After it replaces the files it runs the config repair of a plugin whose manifest sets `doctorContract.configRepair: true`, from its `doctor-contract-api` file.
- `openclaw gateway run` runs no plugin migration before it validates the config, and an invalid config stops the start.

### OpenClaw hook and spawn

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-hook-and-spawn)

- `before_prompt_build` receives a context with `sessionKey` and may return `appendSystemContext`.
  OpenClaw refuses the registration of a non-bundled plugin, with a warning, unless `plugins.entries.<id>.hooks.allowConversationAccess` is `true`.
  It also refuses it when the prompt-change key is `false`. That key is `allowPromptModification`, and `allowPromptInjection` in older releases.
  A throw in a `before_prompt_build` handler is logged and skipped.
- The text a `before_prompt_build` handler returns in `appendSystemContext` goes once into the system prompt of each request of that session, in a block headed "OpenClaw plugin-injected system context. This block is not workspace file content."
- A session is a spawned child when its key, lower-cased, starts with `subagent:`, either at the start of the key or after `agent:<id>:`.
  A session is an ACP session when its key, lower-cased, starts with `acp:` in the same two places.
  A spawned child's key reads `agent:<id>:subagent:<uuid>`, and an ACP session's reads `agent:<id>:acp:<uuid>`.

- `before_tool_call` receives `event.toolName` and `event.params`, and `ctx.agentId`, `ctx.sessionKey` and an optional `ctx.abortSignal`.
  It can return `params`, `block` or `requireApproval`.
  `ctx.agentId` is the requester, and `event.params` holds only the keys the caller passed.
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
  On `POST /tools/invoke` a timeout answers `403 Tool call blocked because before_tool_call hook failed`, and the log reads `timed out after <n>ms`.
  The global hook runner marks `before_tool_call` fail-closed.
- A hook timeout does not abort the handler.
- `ctx.abortSignal` aborts only when the owning tool call is cancelled. A hook timeout does not abort it.
- The plugin's `api.logger` is the registry logger, bound once when OpenClaw builds the plugin API. No hook call or hook timeout gates it.
- The hook wraps the tool in the agent tool wrapper.
  Loopback MCP calls run the same hook and execute with the hook's `params`, so the rewrite also applies to a caller on the Claude CLI backend.
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
- A handler that returns `{ params: { model, thinking } }` sets both on a real `sessions_spawn`.
  The shallow merge keeps `task`, and the result reads `status: accepted`, `modelApplied: true` and `mode: run`.
  The child's transcript holds a `model_change` and a `thinking_level_change`, and the caller's session keeps its own thinking level.
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
- A Gateway client with `operator.admin` runs the command, and the handler gets `senderIsOwner: true` and `gatewayClientScopes` with the scope.
  A client with `operator.read` and `operator.write` only gets `This command requires gateway scope: operator.admin.`, and the handler does not run.
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

- The Gateway runs on Bun.
  `fetch`, `AbortSignal.any` and `AbortSignal.timeout` are functions in a plugin's hook and command handlers, and `fetch` reaches an external host.
- A config write under `plugins.entries.<id>` makes the Gateway replace that plugin's runtime instance.
  The replacement waits for the old instance's retained work to finish, up to a 60 s drain budget.
  While it waits, the Gateway logs `Plugin replacement queued behind <n> retained work item(s) for plugin <id>; applies when they finish within the 60s drain budget.`
  It logs `Plugin replacement applied: <id>` when the replacement takes over.
  Until then the old instance serves every call, and its `api.runtime.config.current()` returns the old config.
  OpenClaw throws `Gateway requester authority changed` when a request's client authority is no longer current.
- `api.logger` is a scoped logger with `debug`, `info`, `warn` and `error`.
- `logging.file` sets the path of the Gateway's file log.
  Without it the file log sits in OpenClaw's own temp folder, outside the home folder.
- Five environment variables, each set to `1`, switch a part of the Gateway off.
  `OPENCLAW_DISABLE_BONJOUR` stops the Bonjour advertiser and local discovery, and `OPENCLAW_NO_RESPAWN` stops the respawn of the process at start and for a restart.
  `OPENCLAW_SKIP_CHANNELS` skips the start of the channels, `OPENCLAW_SKIP_CRON` disables cron, and `OPENCLAW_NO_AUTO_UPDATE` skips the update check at start.
  `OPENCLAW_SKIP_CRON` takes `1` alone, and the other four take `true`, `yes` and `on` too.
- A workspace `.env` is a lower-trust source.
  OpenClaw drops known provider credential variables from it. `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` and `PERPLEXITY_API_KEY` are on that list.
  `TYPESAFE_API_KEY` is not on the static list.
  The global `~/.openclaw/.env` and the Gateway's process environment are trusted sources.
- Plugins receive resolved values, with defaults selected from the source config, for the `secretInputs` paths a manifest declares.
  This plugin declares `api_key`, `openai_api_key`, `google_api_key`, `perplexity_api_key` and `openrouter_api_key`.
  It reads the live config first, where it skips a value that is not text, such as an unresolved SecretRef object, and then `api.pluginConfig`.

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
  A Gateway with no model configured starts and loads its plugins.
- `openclaw gateway run --bind <mode>` stands in for `gateway.bind` in that run, and `--auth <mode>` for `gateway.auth.mode`; neither writes the config file.
  `--bind` takes `loopback`, `lan`, `tailnet`, `auto` or `custom`, and `--auth` takes `none`, `token`, `password` or `trusted-proxy`.
  The Gateway takes its token from `gateway.auth.token`, and from `OPENCLAW_GATEWAY_TOKEN` when the config holds none.
- `POST /tools/invoke` takes `tool` and `args`, and with `gateway.auth.mode` `token` it needs `Authorization: Bearer <token>`.
  `sessions_spawn` is on its default deny list, `gateway.tools.allow` lifts that, and a denied tool returns 404.
- `SIGINT` or `SIGTERM` stops the Gateway process. A shell or wrapper that does not forward signals leaves the Gateway serving after the wrapper is killed.

### OpenClaw gaps

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-OpenClaw#openclaw-gaps)

The plugin update page says updates need a stopped Gateway.
The plugin management page says an update refreshes a running one.
The two pages disagree.
The hook runs only when a tool call runs.
Five paths start an agent session without that tool. [Paths the hook never sees](../plugins/model-router-openclaw/README.md#paths-the-hook-never-sees) lists them.
Other such paths may exist.
Whether `before_prompt_build` runs for an ACP session is not known.
The meeting bot's realtime consult also runs an agent under a sub-agent session key without that tool.
The workspace `.env` list in the source leaves out the variables that an installed provider plugin adds.
OpenClaw may drop `TYPESAFE_API_KEY` when such a plugin declares it.
`before_model_resolve` can replace a run's model, provider and fallback chain.
It receives only the prompt and attachment metadata, and its result holds no thinking level.
It runs at the start of every embedded agent run, a sub-agent's included, unless the session's model selection is locked.
A sub-agent run shows only in `ctx.sessionKey`, which reads `agent:<id>:subagent:<uuid>`.
The plugin does not use this hook.
It would run on every turn of every session, not once per spawn.
It also cannot set the effort, which the plugin sets through `sessions_spawn`'s `thinking` as the other plugins set theirs.

## Hermes Agent

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-agent)

`requires_hermes` in `plugins/model-router-hermes/plugin.yaml` sets the Hermes release that this repository's plugin needs, and `.github/actions/setup-hermes/action.yml` pins the release that CI installs.

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
- `hermes plugins install file://<repo>#plugins/<name> --enable` installs and enables a plugin from a subfolder with no prompt, also with standard input closed.
- `hermes plugins install --enable` does not call the plugin's `register` in its own process.
  It asks a running Desktop backend and a running gateway to load the plugin.
- `hermes plugins capabilities <name>` prints what an installed plugin declares, and `hermes plugins doctor <name>` checks its discovery, manifest, import and registration.

### Hermes package files

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-package-files)

- A plugin folder holds `plugin.yaml` and `__init__.py` with `register(ctx)`.
  `plugin.yaml` carries `name`, `version`, `description`, `kind`, `requires_hermes`, `provides_tools` and `config_schema`, among others.
  `provides_tools` lists the tools the plugin registers and does not decide whether they load.
- `config_schema` describes the keys under `plugins.entries.<id>.settings`. A mismatch logs a warning and never fails the load.
  The types are `str`, `int`, `float`, `bool`, `list`, `dict` and `secret`. A `secret` entry names the `.env` variable that stores it with `env:`.
  The Desktop settings form edits a `dict` entry in a JSON editor.
- This repository's `plugin.yaml` holds JSON text, which is valid YAML. The builder writes it from `metadata/source.json` and `src/`.
  `hermes plugins validate` reads a manifest in that form, and checks that its `requires_hermes` spec parses and that its `config_schema` has a valid shape.
- The plugin registers its skill folders with `ctx.register_skill(<folder name>, <SKILL.md>)`. The agent loads a plugin skill as `skill_view("<plugin>:<skill>")`.
  Plugin skills are read-only, and the system prompt's skill index does not list them.

### Hermes registration and settings

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-registration-and-settings)

- `ctx.get_config(key, default)` reads `plugins.entries.<plugin id>.settings.<key>`, and returns `default` when the entry or the key is absent. It applies no `config_schema` default.
  `ctx.set_config(key, value)` writes one value in that subtree.
- `hermes config set` on a key under `plugins.entries.<plugin id>.settings` takes a JSON object and stores it as a mapping. `hermes config get` prints its fields on separate lines.
  `hermes config set` takes a scalar on such a key too and stores its text, which `hermes config get` prints.
- A `secret` entry never reaches `config.yaml`. The Desktop settings form stores it in `.env` under the entry's `env:` name, and the plugin reads it with `get_secret(NAME)` from `agent.secret_scope`.
  A plugin update that renames a `secret` entry and keeps its `env:` name leaves the stored value in place: the settings form's field list shows the renamed entry as set, and `get_secret(NAME)` returns the value.
- Hermes's own OpenRouter provider reads `OPENROUTER_API_KEY`, so a `secret` entry with that `env:` name sets that provider's key too.
- Hermes's own Perplexity web search reads `PERPLEXITY_API_KEY`, so a `secret` entry with that `env:` name sets its key too.
  Hermes's provider registry lists no provider for `PERPLEXITY_API_KEY`.
- With the provider `auto`, or with none requested, Hermes takes its own session's provider in this order: a key or a base URL given on the command line, `model.provider` of `config.yaml`, a `model.base_url` on a loopback host when `model` names no provider, a usable `OPENROUTER_API_KEY`, the OpenRouter pool, another provider's key in the environment, an OAuth login.
  `model.provider` may name a registry provider, `openrouter`, `custom` or a named custom provider.
  Among other providers' keys Hermes takes the first API-key provider in its registry's declared order whose variable holds a usable value, and logs a warning when that passes over an OAuth login.
  `openai-api`, with `OPENAI_API_KEY`, stands before `gemini`. `gemini` reads `GOOGLE_API_KEY` before `GEMINI_API_KEY`, for this pick and for the key it sends, unless `model.key_env` names a variable for it.
- The settings form saves a secret as it saves a provider key. Hermes writes `.env`, replaces the previous value in the `api_key` of `model`, `auxiliary.<task>`, `custom_providers.<name>` and `providers.<id>` in `config.yaml`, and loads the credential pool of each provider its registry lists for the variable.
  It replaces the legacy `api` field of the first three too. `delegation.api_key` keeps its value.
  The registry lists no OpenRouter provider. Hermes seeds the OpenRouter pool in `auth.json` from `OPENROUTER_API_KEY` when it loads that pool.
- `get_secret` reads no credential pool, so it never returns a key that sits only in `auth.json`.
- `get_secret(NAME)` returns the value of a `config_schema` secret's variable from the Hermes home's `.env`, in process and in the plugin host. The variable is also in the environment of the host and of the gateway.
- `ctx.get_config(key)` returns the value from `plugins.entries.<plugin id>.settings`, in process and in the plugin host.
- A `config_schema` entry of type `str` may list its allowed values under `choices`, or under `enum`.
  `ctx.get_config` returns a stored value outside that list as stored.
  The Desktop settings form saves a plain setting through the `settings` action of the gateway's `plugins.manage` call, which refuses to write a value outside the list and leaves such a stored value alone when it saves another key.
  The form takes its fields from the `list` action of the same call, which gives such an entry the type `enum`.
- A plugin slash command's handler runs in the gateway process that owns the session. It can declare `session_id`, `session_key`, `platform` or `source` as keyword arguments, and Hermes passes them.
  The handler returns its text.
- Hermes names `api_server`, `cli`, `codex`, `desktop`, `gateway`, `kanban`, `local`, `msgraph_webhook`, `tool`, `tui` and `webhook` as surfaces that are not a human messaging channel.
  The plugin's `/model-router-provider` and `/model-router-gateway` write only for `local`, `cli`, `tui` and `desktop`, four of those names. `localPlatforms` in `constants.json` lists them.
- With no saved tool selection, a plugin's toolset is on by default. Enabling a plugin puts its toolset back into a saved selection.

### Hermes routing and refusals

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-routing-and-refusals)

- `DelegationProvider` is an abstract class. A backend implements `name` and the synchronous `route_task(task, config)`. `is_available()` returns true by default, and false fails delegation closed.
  `config` is the `delegation` section of the active profile's `config.yaml`, and `dict(config)` is the default route.
  Its `backend` key names the backend that routes the call.
- `route_task` gets `{goal, context, index}` plus the parameters the backend declared. This plugin declares three, as [Hermes task parameters](#hermes-task-parameters) says, and `context` can be `None`.
  Nothing else crosses: no role, no agent description, no toolsets, no images and no output schema.
- A route may carry `model`, `provider`, `base_url`, `api_key`, `api_mode`, `request_overrides`, `reasoning_effort`, `service_tier`, `fallback_providers`, `profile` and `label`. Hermes drops every other key silently.
  Hermes's own default backend returns the `delegation` section without `service_tier`.
- A route that `route_task` returns resolves through the credential resolver of the `delegation` section. A `provider` runs `resolve_runtime_provider`; an empty route inherits the parent's route.
  `request_overrides` apply on every branch.
- A child's effort is the route's effort, else `delegation.reasoning_effort`, else the parent's level.
  A backend's `reasoning_effort` outside the known levels refuses the task, except a value equal to `delegation.reasoning_effort`.
- A child pinned by provider, endpoint or model gets no fallback providers unless `delegation.fallback_providers` declares them.
- A raise from `route_task` refuses that task: Hermes logs `delegation provider <name>.route_task() raised` and reports `Task <i>: delegation backend '<name>' failed: <error>`.
  A return of `None` or of a non-mapping refuses it too. A refusal is per task, and the call is a tool error only when every task is refused.
  A `{}` return is not a refusal: the child inherits the parent's route.
- Hermes routes the tasks of a call in one loop, in index order, in the thread that runs the call. It builds the children after the loop ends.
  `delegate_task` is exempt from the generic sequential tool deadline, so Hermes puts no timeout around `route_task`.
- The main agent's turn is not routed through the provider. Only `delegate_task` tasks are, and internal callers that pass their own credentials bypass the backend.
- `label` is short text shown with the child's progress and result. Every result entry of a task routed by a non-default backend carries `route`, with the backend and what the child runs on, and `label` when the route sets one.
- A delegated task takes the routed model and effort, each task of a call its own, in process and under `plugins.isolation: host`.
  The child session runs with the route's `model` and with `reasoning_config = {enabled: true, effort: <the route's effort>}`.
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
- This repository's plugin declares `description`, `reasoning_effort` and `level`, and appends one line from `constants.json`. None of the three names is reserved, so Hermes puts all three in `tasks.items.properties` and ends the tool description with the line.
- A session routes on the backend its `delegate_task` schema was built from. A plugin update or a backend change applies from the next session, or at the next turn after `/delegation <backend> --now`. A task that carries a parameter its session's schema lacks is refused alone.
- A delegating model fills the parameters that a backend declares, and the child runs on the route that the backend returns for them.
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

- A `hermes -z` turn on a home with no gateway starts one with `gateway run --quiet --idle-exit`. On macOS it starts as a one-off launchd job through `osascript`.
  The provider runs in that gateway process, on a `ThreadPoolExecutor` thread.
- The gateway keeps the plugin loaded between CLI turns, so module state carries over.
  A change of `plugins.isolation` or of the plugin's code applies after `hermes gateway stop`.
  `hermes gateway stop` with `HERMES_HOME` set stops the gateway and its plugin host.
- Under `plugins.isolation: host`, the provider runs in `python3 -m hermes_cli.plugin_host_child`, a child of the gateway, one per profile. The host sets `HERMES_PLUGIN_HOST_PROCESS`, hands the plugin a `RemotePluginContext` and calls it on the thread `plugin-host-rpc`.
  Module state persists across the tasks of one call.
- `hermes_constants.find_node_executable("node")` reads the Node that Hermes's package manager selected, and returns `None` when it installed none. It never falls back to the Node on the user's `PATH`.
  It finds Hermes's Node in process and in the plugin host.
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
- A key-shaped literal in a plugin blocks its install as `dangerous`. The rule matches a name containing `secret`, `token`, `api_key` or `password` assigned a quoted value of 20 or more characters.
  No file of a plugin may hold one outside its `tests/` tree, where the rule caps a finding at medium. A bundled esbuild output gets no finding when no rule matches its text.
- `hermes plugins validate <path>` checks the plugin and warns about its imports of private Hermes modules.
  The warning says such imports can break on any release. CI runs `validate` on the pinned release and a Renovate rule raises the pin, so a break shows in CI ([Hermes CI](#hermes-ci)). The output ends with `Validation passed.`, and with an `Isolation` note when `plugins.isolation: host` is on.
- The admission lint lists a plugin's imports of private Hermes modules with file and line. It is a warning and never a refusal. The public list holds `agent.delegation_provider`, `agent.delegation_backends`, `agent.secret_scope` and `hermes_constants`.

### Hermes CI

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-ci)

- The `hermes` job runs the plugin's tests on Python 3.11 and 3.14 with `uv`, runs `hermes plugins validate` on the plugin, installs the plugin from the checkout through a `file://` route with standard input closed, checks the plugin list, sets `delegation.backend` to `model-router` and reads it back, and runs the tests again under Hermes's own interpreter.
  The install clones the checkout's own commit, as a user's install clones the repository's subfolder.
  Hermes keeps its home under the runner's temp folder, and no key is set.
- The `setup-hermes` action clones the release tag, checks that `HEAD` equals the pinned commit, and runs `uv sync` frozen, without development dependencies and without builds, so only the wheels that Hermes's own `uv.lock` locks install. It then checks that `hermes --version` names the tag.
  It pins a release tag and the commit of that tag. A Renovate rule raises the tag and the commit together with no age delay (see [CONTRIBUTING.md, Dependencies](../CONTRIBUTING.md#dependencies)).
- The tests of the plugin call each handler and the router directly with a fake Hermes API. One test file, `plugins/model-router-hermes/tests/test_real_hermes.py`, runs only under Hermes's interpreter. It calls each Hermes function the shim uses, and compares the default route with Hermes's bundled default backend.
  It also registers the provider with Hermes's delegation registry, reads the `delegate_task` schema, and routes tasks through `resolve_task_routes`, so a pin raise that changes the parameter seam fails CI. Those tests use Hermes's private name `_registry`. They read the schema through `tools.registry.registry.get_definitions` with a temporary `HERMES_HOME`, as Hermes documents.

### Hermes project skills and home

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-project-skills-and-home)

- Hermes reads project skills from `.hermes/skills` and `.agents/skills` under the project root, the nearest folder at or above the working directory that holds `.git`.
  It loads them only when `skills.trusted_project_dirs` lists that root, and the list is empty by default.
  It does not read `.claude/skills`.
- `HERMES_HOME` names the Hermes home.
- On an install that Hermes's package manager manages, a command under a new `HERMES_HOME` first builds a dependency environment of its own under that home.
  `hermes --version`, `hermes --help`, `hermes pm` and a command with `HERMES_DISABLE_LAZY_INSTALLS` set skip that build.
  With no environment built, a command that skipped the build exits with status 1 and `no dependency environment is committed for this install`, unless it is a `hermes pm` command.
- That environment is the folder `installs/<key>/environments/<name>/venv` under the home, and its interpreter is `bin/python` in it, or `Scripts/python.exe` on Windows.
  `<key>` is the first 16 hexadecimal characters of the SHA-256 of the checkout's resolved path, and `<name>` is a random id of one build.
  `installs/<key>/facts.json` names the built environment under `packages.venv.environment`.
- `hermes plugins install "file://<repository>#<folder>"` clones the repository with `git clone --depth 1` and installs `<folder>` from the clone, so it takes the committed `HEAD`, not the working tree.

### Hermes gaps

Evidence: [wiki](https://github.com/Akurganow/model-router/wiki/Evidence-Hermes#hermes-gaps)

Every open point about Hermes is a run that has not happened yet, and the wiki's gaps section lists them.
