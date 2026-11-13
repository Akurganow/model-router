# How each client loads a package

This page says what each client reads from a package in this repository.
Every fact names its kind: documentation, source read at a commit, or running the client.
A documentation page with no revision is dated by the day it was read.
A running fact names the client version and the command, or cites a GitHub Actions run of this repository on hosted runners.
Install commands and install-time notes are in the [README](../README.md#install).
The reasons built on these facts are in [About this repository's design](design.md).

Four clients are covered: Claude Code, Oh My Pi (omp), OpenClaw and Hermes Agent.

## Claude Code

Documentation pages below were read on 2026-11-05.
The CI action pins Claude Code 2.1.308 in `.github/actions/setup-claude-code/package.json`, and the README asks for that version or later.

### Manifest

- The manifest is `.claude-plugin/plugin.json` under the plugin root.
  Every other plugin file sits at the plugin root, not inside `.claude-plugin/`.
  (documentation: [Plugin manifest reference, Manifest file](https://code.claude.com/docs/en/plugins/manifest-reference#manifest-file))
- Claude Code strips an unrecognized top-level field, and the plugin loads.
  `claude plugin validate` reports the field as a warning.
  (documentation: [Plugin manifest reference, Unrecognized fields](https://code.claude.com/docs/en/plugins/manifest-reference#unrecognized-fields))
- An unknown key inside a `userConfig` option is an error, and the plugin does not load.
  (documentation: [Plugin manifest reference, Unrecognized fields](https://code.claude.com/docs/en/plugins/manifest-reference#unrecognized-fields))
- A `userConfig` option requires `type`, `title` and `description`.
  It accepts `default`, `options`, `sensitive`, `required` and `multiple`, among others.
  (documentation: [Plugin manifest reference, User configuration](https://code.claude.com/docs/en/plugins/manifest-reference#user-configuration))
- `options` limits a `string` option that is neither `multiple` nor `sensitive`, and `/config` shows a picker.
  `default` must be one of the listed values.
  Claude Code before v2.1.271 cannot load a plugin that declares `options`.
  (documentation: [Plugin manifest reference, Limit a field to fixed options](https://code.claude.com/docs/en/plugins/manifest-reference#limit-a-field-to-fixed-options))
- Claude Code saves non-sensitive values under `pluginConfigs` in `settings.json`.
  It saves `sensitive` values in the platform's secure credential store.
  (documentation: [Plugin manifest reference, Where values are stored](https://code.claude.com/docs/en/plugins/manifest-reference#where-values-are-stored))
- `/config` shows a row for each option, except `sensitive` options and `multiple` lists.
  (documentation: [Plugin manifest reference, User configuration](https://code.claude.com/docs/en/plugins/manifest-reference#user-configuration))
- `commands` accepts an object map from a command name to `source` or `content`.
  Each value sets exactly one of the two, and `description` and `argumentHint` are optional.
  The key becomes the command name after the plugin prefix, as in `/deploy-tools:about`.
  (documentation: [Plugin manifest reference, commands](https://code.claude.com/docs/en/plugins/manifest-reference#commands))
- `skills` takes a path or an array of paths, each a directory.
  `"."` names the plugin root, and the listed directories add to the default `skills/` scan.
  `"."` needs Claude Code v2.1.221 or later.
  (documentation: [Plugin manifest reference, Path rules](https://code.claude.com/docs/en/plugins/manifest-reference#path-rules))
- Every component path starts with `./`, exists, and resolves inside the plugin root.
  (documentation: [Plugin manifest reference, Path rules](https://code.claude.com/docs/en/plugins/manifest-reference#path-rules))
- Anthropic's directory reads `privacyPolicyUrl` and four other listing fields from `plugin.json` only.
  In a catalogue entry, `claude plugin validate` reports each one as an unknown field.
  (documentation: [Plugin manifest reference, Directory listing fields](https://code.claude.com/docs/en/plugins/manifest-reference#directory-listing-fields))

### Catalogue

- The catalogue is `.claude-plugin/marketplace.json`.
  Relative plugin sources resolve from the marketplace root, the folder that holds `.claude-plugin/`.
  (documentation: [Marketplace reference, Marketplace file](https://code.claude.com/docs/en/plugins/marketplace-reference#marketplace-file))
- The catalogue requires `name`, `owner` and `plugins`, and `owner.name` is required.
  A missing `description` raises a warning in `claude plugin validate`.
  (documentation: [Marketplace reference, Top-level fields](https://code.claude.com/docs/en/plugins/marketplace-reference#top-level-fields),
  [Validation messages](https://code.claude.com/docs/en/plugins/marketplace-reference#validation-messages))
- Each entry requires `name` and `source`.
  (documentation: [Marketplace reference, Plugin entries](https://code.claude.com/docs/en/plugins/marketplace-reference#plugin-entries))
- A relative `source` starts with `./` and resolves from the marketplace root.
  A path without the prefix fails with `Invalid string: must start with "./"`, and a path with `..` fails too.
  (documentation: [Marketplace reference, Relative path plugin source](https://code.claude.com/docs/en/plugins/marketplace-reference#relative-path-plugin-source),
  [Validation messages](https://code.claude.com/docs/en/plugins/marketplace-reference#validation-messages))
- Claude Code ignores an unknown top-level or entry key, and `claude plugin validate` warns about it.
  (documentation: [Marketplace reference, Marketplace file](https://code.claude.com/docs/en/plugins/marketplace-reference#marketplace-file))
- Marketplace and plugin names use letters, digits, `.`, `_` and `-`, and start with a letter or digit.
  Users type them as `<plugin>@<marketplace>`.
  (documentation: [Marketplace reference, Top-level fields](https://code.claude.com/docs/en/plugins/marketplace-reference#top-level-fields))
- When an entry and `plugin.json` both set `version`, `plugin.json` wins, and `claude plugin validate` warns.
  The hosting page tells owners to set `version` in one place.
  (documentation: [Marketplace reference, Plugin entries](https://code.claude.com/docs/en/plugins/marketplace-reference#plugin-entries),
  [Host and maintain a marketplace, Release a new version](https://code.claude.com/docs/en/plugins/host-marketplace#release-a-new-version))

### Install and update

- `claude plugin marketplace add <source>` accepts `owner/repo` and a path to a local directory.
  `claude plugin install <plugin>@<marketplace>` installs from a marketplace already added.
  (documentation: [Plugin commands reference, plugin marketplace add](https://code.claude.com/docs/en/plugins/cli-reference#plugin-marketplace-add),
  [Install and manage plugins, Add a marketplace](https://code.claude.com/docs/en/plugins/install#add-a-marketplace))
- `claude plugin install <plugin> --marketplace <source>` adds the marketplace first and then installs.
  The plugin name goes by itself, with no `@marketplace` suffix.
  The shell form needs v2.1.292 or later, and the `/plugin install` form in a session needs v2.1.275.
  (documentation: [Install and manage plugins, Add a marketplace and install in one command](https://code.claude.com/docs/en/plugins/install#add-a-marketplace-and-install-in-one-command))
- `claude plugin install --config <key>=<value>` sets a `userConfig` option at install time.
  The scope defaults to `user`.
  (documentation: [Plugin commands reference, plugin install](https://code.claude.com/docs/en/plugins/cli-reference#plugin-install))
- `claude plugin configure <name>@<marketplace> --values-stdin` saves option values from a JSON object on standard input.
  It needs the full plugin id and v2.1.285 or later.
  (documentation: [Plugin commands reference, plugin configure](https://code.claude.com/docs/en/plugins/cli-reference#plugin-configure))
- Claude Code computes a version for each plugin and reads `version` from `plugin.json` first, then from the entry.
  A new copy reaches users only when that version differs from the one they hold.
  (documentation: [Plugin loading reference, How Claude Code computes the version](https://code.claude.com/docs/en/plugins/loading#how-claude-code-computes-the-version),
  [Host and maintain a marketplace, Release a new version](https://code.claude.com/docs/en/plugins/host-marketplace#release-a-new-version))
- Claude Code copies a marketplace plugin into `cache/<marketplace>/<plugin>/<version>/` and loads that copy.
  A relative-path plugin in a marketplace added from a local path loads in place instead.
  (documentation: [Plugin loading reference, In-place and copied plugins](https://code.claude.com/docs/en/plugins/loading#in-place-and-copied-plugins))
- Background auto-update is off for a third-party marketplace until a user or an administrator turns it on.
  Without it, a user runs `claude plugin update <plugin>@<marketplace>`.
  (documentation: [Install and manage plugins, Keep plugins updated](https://code.claude.com/docs/en/plugins/install#keep-plugins-updated),
  [Host and maintain a marketplace, Turn on auto-update](https://code.claude.com/docs/en/plugins/host-marketplace#turn-on-auto-update))
- `claude plugin marketplace add` of a checkout's path printed `Successfully added marketplace: model-router (declared in user settings)`.
  Then `claude plugin install model-router@model-router` printed `Successfully installed plugin: model-router@model-router (scope: user)`.
  (running: Claude Code 2.1.308, [run 40100906706](https://github.com/Akurganow/model-router/actions/runs/40100906706) of the evals workflow, 2026-10-24)

### Hooks module

- A mod is a plugin whose `hooks/hooks.json` has a `modules` key.
  The key holds an array with one path, relative to that file, to the hooks module.
  (documentation: [Mods reference, Files](https://code.claude.com/docs/en/plugins/mods/reference#files))
- The hooks module is an ES module that exports `register(on, options)`.
  `options` holds the `userConfig` values with their defaults filled in.
  (documentation: [Mods reference, Files](https://code.claude.com/docs/en/plugins/mods/reference#files))
- Claude Code loads `.js` and `.ts` files directly, with no build step.
  A hooks module imports only files inside the plugin directory by relative path, and the one bare import allowed is `claude-code`.
  (documentation: [Create a mod](https://code.claude.com/docs/en/plugins/mods/create),
  [Check what Claude Code reads from your mod](https://code.claude.com/docs/en/plugins/mods/create#check-what-claude-code-reads-from-your-mod))
- When a hooks module fails, Claude Code skips it and the session continues.
  A broken mod can therefore look like one that does nothing.
  (documentation: [Troubleshoot a mod](https://code.claude.com/docs/en/plugins/mods/troubleshoot))
- A mod installed from a marketplace loads at the next start of Claude Code, or at `/reload-plugins` in an open session.
  (documentation: [Mods overview, Install or update a mod](https://code.claude.com/docs/en/plugins/mods/overview#install-or-update-a-mod))
- Claude Code caches an installed plugin by version.
  An edit reaches the installed copy only after the version rises and the user installs again.
  (documentation: [Create a mod, Share your mod](https://code.claude.com/docs/en/plugins/mods/create#share-your-mod))

### Subagent events

These facts hold for Claude Code 2.1.308 and 2.1.318.
The documentation pages were read on 2026-11-11.

- `agent.spawn` fires when a subagent or a teammate is about to start, and when a subagent that finished or stopped is about to run again.
  For a resumed run `e.resume` is `{ agentId }`, and Claude Code ignores a changed event passed to `next`.
  The resumed run raises the event from v2.1.299.
  (documentation: [Mods reference, Subagents](https://code.claude.com/docs/en/plugins/mods/reference#subagents))
- A `SendMessage` to a completed subagent resumes it under the same ID, with no new Agent call.
  Explore and Plan return no agent ID, so Claude cannot resume them.
  A per-invocation `model` and `effort` stay in effect on the resumed run, and `CLAUDE_CODE_EFFORT_LEVEL` outranks the effort.
  (documentation: [Create custom subagents, Resume subagents](https://code.claude.com/docs/en/sub-agents#resume-subagents),
  [Choose an effort level](https://code.claude.com/docs/en/sub-agents#choose-an-effort-level))
- A model that a hook sets at `agent.spawn` stays on the run that `SendMessage` resumes.
  The debug log held one router line, `L0 haiku · medium · p=0.60/0.99 · jev jev-1.14.0`, so the resume was not scored again.
  The subagent's messages carried `message.model` `claude-haiku-5-5` on its first run and on the resumed run.
  The session's own messages carried `claude-sonnet-5-5`.
  The stream carries no request's effort, so the run does not show the effort of the resumed request.
  A run with `--model haiku` routed the same task to `haiku`, so it could not tell the two models apart.
  (running: Claude Code 2.1.318, 2026-11-11, `claude -p --model sonnet --output-format stream-json --verbose` with the plugin at commit `a1de08d` loaded by `--plugin-dir`, one `general-purpose` Agent call, then one `SendMessage` to its agent id)
- `turn.complete` carries a subagent's `agentId` once for each run of its loop.
  No event marks a subagent as gone: an agent that completed, failed or was stopped can still resume under its id.
  (documentation: the declarations Claude Code 2.1.308 writes beside a loaded mod, `TurnCompleteFields.agentId` and `AgentStatus`)
- `turn.step` carries the subagent's `agentId`, and a hook may rewrite its `effort`.
  (documentation: [React to events, Follow a turn](https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn);
  the declarations 2.1.308 writes, `TurnStepInput.effort`)
- `agent.spawn` also carries `provider`, `parentModel`, `parentAgentId`, `permissionMode`, `background` and `cwd`, and `agent.offer` carries `provider`.
  The adapter reads none of them.
  (documentation: [`claude-code.d.ts` L203](https://github.com/anthropics/claude-code/blob/e379c8eca0af5b02a49bf8e784aeefdd1308de6f/mods/types/claude-code.d.ts#L203)
  and [L259–L309](https://github.com/anthropics/claude-code/blob/e379c8eca0af5b02a49bf8e784aeefdd1308de6f/mods/types/claude-code.d.ts#L259-L309), written by Claude Code 2.1.277;
  the declarations 2.1.308 writes hold the same fields)

### Validate and test

- `claude plugin validate <path>` takes a manifest file or a directory.
  A directory that holds `.claude-plugin/marketplace.json` validates the marketplace.
  A directory that holds both files validates the marketplace and then the plugin, on v2.1.289 or later.
  (documentation: [Plugin commands reference, Validate a directory](https://code.claude.com/docs/en/plugins/cli-reference#validate-a-directory))
- `--strict` treats warnings as errors, and the command then exits `1`.
  (documentation: [Plugin commands reference, plugin validate](https://code.claude.com/docs/en/plugins/cli-reference#plugin-validate))
- A validation run does not check a `SKILL.md` at the plugin root.
  (documentation: [Plugin commands reference, Validate a directory](https://code.claude.com/docs/en/plugins/cli-reference#validate-a-directory))
- For a mod, `claude plugin validate` prints `hooks:` and `calls:` lines that list the events and the API calls found in the module.
  It prints a line for each hook that can refuse an action, with or without a `.catch` handler.
  (documentation: [Create a mod, Check what Claude Code reads from your mod](https://code.claude.com/docs/en/plugins/mods/create#check-what-claude-code-reads-from-your-mod))
- `claude plugin validate --strict plugins/model-router` printed those lines and `✔ Validation passed` on Ubuntu and macOS.
  It also noted that its checks apply none of the plugin directory's own rules for hooks modules.
  (running: Claude Code 2.1.308, [run 41879870533](https://github.com/Akurganow/model-router/actions/runs/41879870533), 2026-11-04)
- `claude plugin test [directory]` runs every file under the directory whose name ends in `.test.ts` or `.test.tsx`.
  It needs no session, sign-in or network, and exits `1` when a test fails.
  (documentation: [Plugin commands reference, plugin test](https://code.claude.com/docs/en/plugins/cli-reference#plugin-test))
- `claude plugin test plugins/model-router` printed `130 pass`, `0 fail` and `Ran 130 tests across 9 files` on Ubuntu.
  (running: Claude Code 2.1.308, [run 41879870533](https://github.com/Akurganow/model-router/actions/runs/41879870533), 2026-11-04)

### Package files

- When Claude Code copies a plugin into its cache, it installs the plugin's Node.js dependencies there.
  The install runs only when the plugin's root directory holds both a `package.json` and a supported lockfile, such as `package-lock.json`.
  (documentation: [Plugin loading reference, Node.js package dependencies](https://code.claude.com/docs/en/plugins/loading#node-js-package-dependencies))
- The dependency install runs no lifecycle scripts, times out after 60 seconds, and cannot be turned off.
  (documentation: [Plugin loading reference, Limits on the dependency install](https://code.claude.com/docs/en/plugins/loading#limits-on-the-dependency-install))
- A relative `source` such as `./plugins/formatter` resolves to `<marketplace root>/plugins/formatter`, even though the catalogue sits in `.claude-plugin/`.
  (documentation: [Marketplace reference, Relative path plugin source](https://code.claude.com/docs/en/plugins/marketplace-reference#relative-path-plugin-source))

### Claude Code gaps

No source read here settles three points.
The [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference) and the other pages above give no rule for the declaration form of `register` in a hooks module.
They give none for free `setTimeout` globals or for a size limit on the module.
`checkClaudeBundle` and `MAX_BUNDLE_BYTES` in `scripts/build.ts` check those three anyway.

## Oh My Pi

Documentation is the Markdown under `docs/` in `can1357/oh-my-pi`, and source is the TypeScript under `packages/`.
A link is a permalink at commit `96e4d8e`, the head of `main` on 2026-11-05, unless its section names another commit.
[omp tool_call cost and timeout](#omp-tool_call-cost-and-timeout), [omp thinking levels](#omp-thinking-levels) and the [omp gaps](#omp-gaps) entries on unrouted spawns and on levels were checked at tags `v18.12.6` (commit `45c35e4`) and `v18.18.9` (commit `50da2d3`) on 2026-11-11.
CI and the evals workflow pin two omp versions, which `.github/actions/setup-omp/action.yml` installs: the minimum the README names, in `.github/actions/setup-omp/minimum/package.json`, and the latest omp release, in `.github/actions/setup-omp/latest/package.json`.

### omp manifest and settings

These facts were checked at commit `96e4d8e` only, not at omp 18.12.6 or 18.18.9.

- Marketplace installs load extension modules that `package.json` declares in `omp.extensions`.
  Installation symlinks the cached plugin into the scope's `node_modules` and records it in `omp-plugins.lock.json`.
  (documentation: [`marketplace.md` L18](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L18))
- An extension package declares `"omp": { "extensions": ["./src/main.ts"] }`.
  The loader also accepts the legacy `pi` key, and entries may be `.ts`, `.js`, `.mjs` or `.cjs` files.
  (documentation: [`authoring-extensions.md` L104–L137](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/skills/authoring-extensions.md#L104-L137))
- The loader reads the `omp` object of a package, or `pi` when `omp` is absent, and copies the package `version` into it.
  A package with neither object is not an omp plugin.
  (source: [`loader.ts` L194–L199](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/loader.ts#L194-L199))
- The manifest type has an optional `settings` map of a setting key to a schema.
  A schema has a `type` of `string`, `number`, `boolean` or `enum`, plus `description`, `secret` and `env`.
  An `enum` schema adds `values` and `default`.
  (source: [`types.ts` L25–L49](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/types.ts#L25-L49),
  [L55–L93](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/types.ts#L55-L93))
- Plugin settings are stored in `omp-plugins.lock.json`, keyed by package name and then by setting key.
  Here the package name is the `name` in `plugins/model-router-omp/package.json`, not the catalogue entry name.
  (source: [`types.ts` L141–L146](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/types.ts#L141-L146))
- The lockfile sits in `plugins/` under the scope root, `~/.omp/plugins/` by default for the user scope.
  omp writes it with owner-only permissions, because it can hold values a plugin marks `secret`.
  (documentation: [`marketplace.md` L228–L248](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L228-L248))
- A project file, `<project>/.omp/plugin-overrides.json`, can override a plugin's features and settings.
  (documentation: [`plugin-manager-installer-plumbing.md` L59](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/plugin-manager-installer-plumbing.md#L59);
  source: [`types.ts` L153–L164](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/types.ts#L153-L164))
- omp's extension-package discovery also reads a package's sibling folders `skills/`, `hooks/pre|post/`, `tools/`, `commands/`, `rules/`, `prompts/` and `.mcp.json`.
  So the npm package keeps OpenClaw's skills in `openclaw-skills/`.
  (source: [`omp-plugins.ts` L1–L18](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/discovery/omp-plugins.ts#L1-L18))
- Extension modules load when a session starts.
  After an install, `/reload-plugins` refreshes agents, skills and commands, and a restart loads new extension modules.
  (documentation: [`marketplace.md` L80](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L80),
  [`extension-loading.md` L167–L176](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/extension-loading.md#L167-L176))

### omp catalogue

These facts were checked at commit `96e4d8e` only, not at omp 18.12.6 or 18.18.9.

- omp looks for `.omp-plugin/marketplace.json` first and falls back to `.claude-plugin/marketplace.json`.
  A repository may ship both: omp reads the `.omp-plugin/` copy and Claude Code reads the `.claude-plugin/` copy.
  (documentation: [`marketplace.md` L16](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L16),
  [L100](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L100);
  source: [`fetcher.ts` L224](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/marketplace/fetcher.ts#L224))
- A catalogue requires `name`, `owner.name` and `plugins`, and an entry requires `name` and `source`.
  A string `source` starts with `./`.
  omp logs an invalid entry and skips it, and it preserves extra fields.
  (documentation: [`marketplace.md` L129–L133](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L129-L133),
  [L164](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L164);
  source: [`fetcher.ts` L123–L215](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/marketplace/fetcher.ts#L123-L215))
- Marketplace and plugin names use ASCII letters, digits, hyphens and dots, and hold at most 64 characters.
  A name starts and ends with a letter or digit, and a plugin id `name@marketplace` holds at most 128.
  (documentation: [`marketplace.md` L252–L258](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L252-L258))
- A git or local marketplace source must hold a catalogue at one of the two paths.
  A local source is a path such as `./path`, `~/path` or `/path`.
  (documentation: [`marketplace.md` L86–L96](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L86-L96))

### omp install and update

The documentation facts were read at commit `96e4d8e` only.
The running fact names its omp version.

- The commands are `omp plugin marketplace add <source>`, `omp plugin install name@marketplace` and `omp plugin upgrade [name@marketplace]`.
  `install` accepts `--scope user|project`, and the user scope is its default.
  (documentation: [`marketplace.md` L20–L25](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L20-L25),
  [L63–L78](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L63-L78))
- The installed version comes from the catalogue entry's `version`, then `.claude-plugin/plugin.json`, then a root `plugin.json`, then `package.json`.
  It falls back to the first seven characters of the source SHA, and then to `0.0.0`.
  (documentation: [`marketplace.md` L137](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L137))
- An upgrade of all plugins compares only catalogue entries that declare `version`.
  A semver version must be newer, and a non-semver version counts as changed when it differs.
  This upgrade ignores `--scope`.
  (documentation: [`marketplace.md` L223](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L223))
- `omp plugin marketplace update` refreshes catalogues only and reinstalls nothing.
  Without `--scope`, `omp plugin upgrade name@marketplace` reinstalls every installed scope.
  An upgrade keeps settings and disabled state.
  (documentation: [`marketplace.md` L221–L224](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L221-L224))
- `marketplace.autoUpdate` is `off`, `notify` or `auto`, and `notify` is the default.
  In `notify` mode omp writes update availability to the debug log only.
  (documentation: [`marketplace.md` L225](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L225))
- `omp plugin marketplace add` of a checkout's path printed `✔ Added marketplace`.
  Then `omp plugin install model-router@model-router` printed `✔ Installed model-router from model-router (0.14.0)`, the catalogue version at that commit.
  (running: omp 18.12.6, [run 40100906706](https://github.com/Akurganow/model-router/actions/runs/40100906706) of the evals workflow, 2026-10-24)

### omp install names

These facts ran on omp 18.16.0 on 2026-11-05.
The runs used a scratch config root and a local stand-in for the npm registry, and nothing was published.
Source paths name the `@oh-my-pi/pi-coding-agent@18.16.0` npm package.
No documentation page was read for them.

- omp passes an extension no plugin name.
  The extension's API object has no member that names the plugin, the package, the manifest or the settings.
  (running: omp 18.16.0, an extension printed its API member names while `omp --mode rpc --no-ui` loaded it)
- omp keys the lockfile entries `plugins` and `settings`, the `node_modules/<name>` link and the project override by the `name` in the installed `package.json`.
  An extension reads that name from `new URL("../package.json", import.meta.url)`, because the bundle sits in a folder beside the file.
  The catalogue entry name, `<entry>@<marketplace>` and the other plugin's name returned no settings.
  (running: omp 18.16.0, an extension looked up its settings under each candidate name after `omp plugin install` and `omp plugin config set`)
- A catalogue install of entry `probe` with package name `probe-omp` stored its settings under `probe-omp`.
  `omp plugin config set probe …` printed `Plugin "probe" not found`, and `omp plugin config set probe-omp …` set the value.
  (running: omp 18.16.0, `omp plugin marketplace add`, `omp plugin install probe@probe-market`, `omp plugin config set`)
- An npm install of `@probe-scratch/settings-probe` stored its settings under the scoped name.
  The unscoped name printed `Plugin "settings-probe" not found`.
  (running: omp 18.16.0, `omp plugin install @probe-scratch/settings-probe`, `omp plugin config set`)
- `omp plugin install` takes a registry name for npm.
  A path to a `.tgz` file fails with `ENOTDIR`, and a local folder installs by link.
  (running: omp 18.16.0, `omp plugin install` of a tarball path; source: `@oh-my-pi/pi-coding-agent@18.16.0`, `src/cli/classify-install-target.ts` L92–L112)
- `omp plugin upgrade @probe-scratch/settings-probe` moved the plugin from 0.0.1 to 0.0.2 and kept the stored setting.
  Before 0.0.2 existed it printed `is up to date (0.0.1)`.
  `omp plugin upgrade probe@probe-market` also kept the settings, after a catalogue entry gained a higher `version`.
  (running: omp 18.16.0, `omp plugin upgrade` on both routes)
- A project file, `<project>/.omp/plugin-overrides.json`, overrode the stored setting of the npm plugin and left the catalogue plugin's value alone.
  (running: omp 18.16.0, `omp plugin config get` and an extension's settings read after the file was written)
- With both plugins installed, each extension read its own setting, and no value crossed over.
  (running: omp 18.16.0, one session that loaded both extensions)
- omp rejects a catalogue plugin whose package name equals an installed package name, case-insensitively.
  (source: `@oh-my-pi/pi-coding-agent@18.16.0`, `src/extensibility/plugins/marketplace/manager.ts` L1089–L1135, not run)
- The settings read of an extension covers the user scope lockfile only.
  A plugin installed with `--scope project` keeps its lockfile under the project, and that read does not see it.
  (source: `@oh-my-pi/pi-coding-agent@18.16.0`, `src/extensibility/plugins/loader.ts` L489–L491, not run)
- The plugin at commit `022c3e1` installed from the checkout and from the unpacked tarball, and loaded its commands, on omp 18.12.6 and 18.18.9.
  That run covers the install, not the settings name.
  (running: omp 18.12.6 and 18.18.9, 2026-11-11, an install of the plugin and one `get_available_commands` request to `omp --mode rpc --no-ui` with a local stand-in model provider)

### omp per-call model

These facts hold for omp 18.16.0.
Links point at commit `650f3a1`, tag `v18.16.0`, whose `packages/coding-agent` is `@oh-my-pi/pi-coding-agent@18.16.0`, unless a fact names another version.

- A `task` item may carry `model`, one exact `provider/model-id` selector.
  omp accepts it only when `task.perCallModel` is `on`, and the setting defaults to `off`.
  (documentation: [`task.md` L50](https://github.com/can1357/oh-my-pi/blob/650f3a108229ee11bf68ba3377f4e8c3391cd424/docs/tools/task.md#L50))
- Every item `model` other than `undefined` passes the per-call check before any spawn, unless the item's agent is `seance`.
  With `task.perCallModel` off, or with a value that is not one exact selector, the whole call fails.
  A role alias such as `@smol` fails too.
  (source: [`task/index.ts` L330–L331](https://github.com/can1357/oh-my-pi/blob/650f3a108229ee11bf68ba3377f4e8c3391cd424/packages/coding-agent/src/task/index.ts#L330-L331);
  [`structured-subagent.ts` L363–L373](https://github.com/can1357/oh-my-pi/blob/650f3a108229ee11bf68ba3377f4e8c3391cd424/packages/coding-agent/src/task/structured-subagent.ts#L363-L373))
- An item whose agent is `seance`, named or by default, skips that check.
  The bundled `seance` agent takes `model` as its source session's model, and omp sends it as `seanceModel`, not as a per-call model.
  An agent that shadows the name takes it as a per-call model, checked once the name resolves.
  (source: [`task/index.ts` L360–L372](https://github.com/can1357/oh-my-pi/blob/650f3a108229ee11bf68ba3377f4e8c3391cd424/packages/coding-agent/src/task/index.ts#L360-L372),
  [L374–L379](https://github.com/can1357/oh-my-pi/blob/650f3a108229ee11bf68ba3377f4e8c3391cd424/packages/coding-agent/src/task/index.ts#L374-L379))
- An accepted per-call model replaces the agent's own model and the task role.
  It becomes the spawn's only model pattern, and the spawn has no model role.
  (documentation: [`task.md` L129](https://github.com/can1357/oh-my-pi/blob/650f3a108229ee11bf68ba3377f4e8c3391cd424/docs/tools/task.md#L129);
  source: [`structured-subagent.ts` L595–L597](https://github.com/can1357/oh-my-pi/blob/650f3a108229ee11bf68ba3377f4e8c3391cd424/packages/coding-agent/src/task/structured-subagent.ts#L595-L597))
- `before_subagent_spawn` sends those patterns as `patterns`, or the agent's own patterns when the item sets no model.
  A `model` the hook returns replaces them, a per-call model included.
  (source: [`structured-subagent.ts` L658–L674](https://github.com/can1357/oh-my-pi/blob/650f3a108229ee11bf68ba3377f4e8c3391cd424/packages/coding-agent/src/task/structured-subagent.ts#L658-L674))
- Plugin 0.17.0 returned a role for an item that set its own model, and the spawn ran on that role, not on the item's model.
  A level 0 item that named a large model got `@smol`, and a level 2 item that named a small one got `@slow`.
  (running: omp 18.16.0, 2026-11-06, with `task.perCallModel` set to `on` and one `task` call of those two items, each `model` a `provider/model-id`; the batch line showed `L0 @smol` for task 1 and `L2 @slow` for task 2)
- omp 18.12.6 has no `task.perCallModel` setting: it arrived in 18.14.2.
  (documentation: [`CHANGELOG.md` L566 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/CHANGELOG.md#L566), the 18.14.2 entry)
- At omp 18.12.6 the docs mark the item `model` as seance only.
  Yet the task tool passes it on as the request model for any agent, and the request model outranks the agent's own model.
  (documentation: [`task.md` L47](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/docs/tools/task.md#L47);
  source: [`task/index.ts` L346](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/index.ts#L346), [L923](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/index.ts#L923), [`structured-subagent.ts` L434](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/structured-subagent.ts#L434), not run)
- From omp 18.18.4 the `task` tool advertises the item `model` only when `task.perCallModel` is `on` or the bundled seance is spawnable.
  (documentation: [`CHANGELOG.md` L143 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/CHANGELOG.md#L143), the 18.18.4 entry)
- The plugin skips every item that sets `model`, so these differences do not change what it routes on 18.12.6, 18.16.0 or 18.18.9.

### omp tool_call cost and timeout

These facts hold at omp 18.12.6 and 18.18.9.
Each source fact links both tags: `v18.12.6` is commit `45c35e4` and `v18.18.9` is commit `50da2d3`.
The running facts used omp from npm with a local stand-in model provider and called no paid model.

- While any extension has a handler for `tool_call`, `tool_result`, `tool_approval_requested` or `tool_approval_resolved`, omp's speculation host refuses early work with the reason `active extension lifecycle handler`.
  (source: [`speculation/host.ts` L76–L83 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/speculation/host.ts#L76-L83), [L76–L83 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/speculation/host.ts#L76-L83))
- Early task launch asks that gate: the task tool calls `authorizeLaunch` before a launch, and `authorizeLaunch` calls the policy gate.
  (source: [`task/index.ts` L696 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/index.ts#L696), [L909–L910 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/index.ts#L909-L910);
  [`speculation/host.ts` L216–L234 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/speculation/host.ts#L216-L234), [L216–L235 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/speculation/host.ts#L216-L235))
- `task.speculativeLaunch`, on by default, starts each subagent as soon as its `tasks[]` item has streamed.
  Its description says it requires "no extension tool lifecycle handlers".
  (source: [`task/settings.ts` L268–L279 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/settings.ts#L268-L279), [L311–L322 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/settings.ts#L311-L322);
  documentation: [`task.md` L137 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/docs/tools/task.md#L137), [L164 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/docs/tools/task.md#L164))
- Early local reads ask the same gate. `tools.speculativeExecution.enabled`, which turns them on, is experimental and off by default.
  (source: [`speculation/host.ts` L142–L155 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/speculation/host.ts#L142-L155), [L142–L155 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/speculation/host.ts#L142-L155);
  [`tools/settings.ts` L875–L886 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/tools/settings.ts#L875-L886), [L921–L932 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/tools/settings.ts#L921-L932))
- The default tool approval mode is `yolo`, so without a `tool_call` handler speculative task launch is active by default.
  (source: [`tools/settings.ts` L314–L318 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/tools/settings.ts#L314-L318), [L315–L319 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/tools/settings.ts#L315-L319))
- `pi.on("tool_call", handler)` takes no tool filter, and the runner counts any handler for the event name.
  `tool_execution_start` carries the arguments but is a mirrored notification that does not gate dispatch.
  So no narrower registration avoids the veto.
  (source: [`extensibility/extensions/types.ts` L1714 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/types.ts#L1714), [L1951 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/types.ts#L1951);
  [`extensibility/extensions/runner.ts` L1380–L1388 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/runner.ts#L1380-L1388), [L1558–L1566 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/runner.ts#L1558-L1566);
  [`extensibility/extensions/lifecycle-mirror.ts` L154–L163 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/lifecycle-mirror.ts#L154-L163), [L154–L163 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/lifecycle-mirror.ts#L154-L163))
- The veto is in every omp version the plugin supports: it first appears in 18.1.19, and `task.speculativeLaunch` in 18.4.3.
  (source: the `@oh-my-pi/pi-coding-agent` npm packages 18.1.18, 18.1.19, 18.4.2 and 18.4.3, searched for the veto reason and the setting name, not run)
- omp registers `extensionHandlers.toolCallTimeoutMs`, a number with a default of 30000.
  Time spent in omp's own dialogs does not count against it.
  (source: [`extensibility/settings.ts` L151–L162 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/settings.ts#L151-L162), [L158–L169 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/settings.ts#L158-L169))
- omp reads the setting on every tool call.
  It keeps a finite value above 0 and replaces any other value with 30000.
  (source: [`extensibility/extensions/runner.ts` L1945–L1990 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/runner.ts#L1945-L1990), [L2324–L2369 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/runner.ts#L2324-L2369);
  [`extensibility/extensions/runner.ts` L133–L146 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/runner.ts#L133-L146), [L149–L162 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/runner.ts#L149-L162))
- When a `tool_call` handler passes the timeout, omp blocks the tool call with the reason `Extension <path> timed out after <n>ms`.
  (source: [`extensibility/extensions/runner.ts` L1973 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/runner.ts#L1973), [L2352 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/runner.ts#L2352))
- A `before_subagent_spawn` handler gets a fixed 30 s instead, `extensionHandlerTimeoutMs`.
  On that timeout omp logs it, and the spawn goes on without a model change.
  (source: [`extensibility/extensions/runner.ts` L2309 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/runner.ts#L2309), [L2690 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/runner.ts#L2690);
  [`extensibility/extensions/runner.ts` L1609–L1681 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/runner.ts#L1609-L1681), [L1925–L1998 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/runner.ts#L1925-L1998))
- An extension that read `lookup("extensionHandlers.toolCallTimeoutMs")?.get(pi.pi.settings)` got 30000 with no setting and 2000 with the setting at 2000.
  With the setting at 2000 and a `tool_call` handler that slept 3000 ms, the `task` call ended with `Extension <path> timed out after 2000ms`, and no subagent request reached the provider.
  (running: omp 18.12.6 and 18.18.9, 2026-11-11, `omp -p` with a probe extension)

### omp model roles

These facts hold at omp 18.12.6 and 18.18.9.
The running facts used omp from npm, a probe extension, a throwaway agent folder and a local stand-in model provider, and called no paid model.

- omp knows 16 roles, and `middle` is not one of them. Only `smol`, `slow` and the kind roles have catalogue priority lists.
  (source: [`config/model-roles.ts` L56–L91 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/config/model-roles.ts#L56-L91), [the same lines at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/config/model-roles.ts#L56-L91); [`tui/src/overlays/model-browser.ts` L55–L103 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/tui/src/overlays/model-browser.ts#L55-L103), [L61–L109 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/tui/src/overlays/model-browser.ts#L61-L109))
- `modelRoles` accepts any role name, so a role such as `middle` needs no change in omp.
  (source: [`config/model-settings.ts` L109 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/config/model-settings.ts#L109), [the same line at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/config/model-settings.ts#L109))
- A custom role that `modelRoles` names resolves: `ctx.models.resolve("@mid")` gave the configured model, and a spawn hook that returned `@mid:medium` ran it at `medium`.
  A custom role that `modelRoles` does not name gives `undefined`, and a hook that returned it failed the subagent with `Error: No model selected.` and exit code 1.
  (running: omp 18.12.6 and 18.18.9, 2026-11-12)
- `ctx.models.resolve` resolves against `modelRegistry.getAvailable()`, which checks configured auth without running a key command.
  A built-in provider with no credential gives `undefined`, for the model id and for a role that names it.
  A `models.yml` provider whose `apiKey` is a command that prints nothing gives a full model, and `getApiKeyForProvider` gives `undefined` for it. A hook that returned that role ran the child on the parent's model, with exit 0 and no error.
  (running: omp 18.12.6 and 18.18.9, 2026-11-13;
  source: [`extensibility/extensions/model-api.ts` L19–L38 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/model-api.ts#L19-L38), [the same lines at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/model-api.ts#L19-L38),
  [`config/model-registry.ts` L3093 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/config/model-registry.ts#L3093), [L3475–L3509 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/config/model-registry.ts#L3475-L3509))
- A `smol` or `slow` role that `modelRoles` does not name resolves through an explicitly configured `default` model before omp's built-in priority list.
  With `smol` unset, `ctx.models.resolve("@smol")` gave the `default` model.
  (running: omp 18.12.6 and 18.18.9, 2026-11-12;
  source: [`config/model-resolver.ts` L1102–L1104 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/config/model-resolver.ts#L1102-L1104), [L1168–L1170 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/config/model-resolver.ts#L1168-L1170))
- A child's retry fallback chain is `retry.fallbackChains` at the spawn's own model role, kept from before the role's expansion, and otherwise at `default`.
  A role that a spawn hook returns does not change the spawn's role, so `retry.fallbackChains.middle` does not reach a spawn the plugin gives `@middle`.
  (source: [`task/executor.ts` L285–L326](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/executor.ts#L285-L326) and [L4414–L4423 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/executor.ts#L4414-L4423), [L319–L353](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/executor.ts#L319-L353) and [L4733–L4741 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/executor.ts#L4733-L4741), not run)

### omp thinking levels

These facts hold at omp 18.12.6 and 18.18.9.
Each source fact links both tags: `v18.12.6` is commit `45c35e4` and `v18.18.9` is commit `50da2d3`.
The running facts used omp from npm, a probe extension and a local stand-in model provider that logged each request's `model` and `reasoning_effort`, and called no paid model.

- A `model` that a `before_subagent_spawn` handler returns replaces the spawn's patterns, and omp expands it like a configured role.
  A role alias with a level suffix, such as `@smol:high`, expands to every pattern of the role with `:high` appended.
  (source: [`task/structured-subagent.ts` L492–L521 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/structured-subagent.ts#L492-L521), [`task/structured-subagent.ts` L686–L715 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/structured-subagent.ts#L686-L715);
  [`config/model-resolver.ts` L1194–L1241 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/config/model-resolver.ts#L1194-L1241), [`config/model-resolver.ts` L1260–L1307 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/config/model-resolver.ts#L1260-L1307))
- omp reads the text after a pattern's last colon as a level when it is `inherit`, `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` or `auto`, or a prefix of two characters or more that names one of the first eight only, such as `hi`, `med` or `xhi`.
  The match is case-sensitive. Any other suffix, such as `:free` or `:8b`, stays part of the model id.
  The role and pattern paths pass `MAX_THINKING_SUFFIX_OPTIONS`, so `:max` and `:auto` parse there.
  (source: [`tui/src/thinking.ts` L59–L93 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/tui/src/thinking.ts#L59-L93), [`tui/src/thinking.ts` L59–L93 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/tui/src/thinking.ts#L59-L93);
  [`tui/src/overlays/model-selector.ts` L14–L52 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/tui/src/overlays/model-selector.ts#L14-L52), [`tui/src/overlays/model-selector.ts` L14–L52 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/tui/src/overlays/model-selector.ts#L14-L52))
- The ladder's four efforts, `low`, `medium`, `high` and `xhigh`, are omp `Effort` values with the same strings.
  (source: [`agent/src/thinking.ts` L8–L17 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/agent/src/thinking.ts#L8-L17), [`catalog/src/effort.ts` L1–L18 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/catalog/src/effort.ts#L1-L18))
- The executor ranks the item's `effort` first, then an explicit `:level` on the resolved pattern, then the agent's own level, then a level derived from the pattern.
  (source: [`task/executor.ts` L4484–L4508 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/executor.ts#L4484-L4508), [L4815–L4848 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/executor.ts#L4815-L4848))
- omp passes the item's `effort` on only while `task.enableEffort` is on, and that setting defaults to off.
  The plugin therefore counts an item's `effort` as the caller's only while the setting reads `true`.
  (source: [`task/index.ts` L795–L804 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/index.ts#L795-L804), [`task/index.ts` L1024–L1033 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/index.ts#L1024-L1033);
  [`task/settings.ts` L281–L292 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/settings.ts#L281-L292), [`task/settings.ts` L324–L335 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/settings.ts#L324-L335))
- `task.maxEffort` takes `minimal`, `low`, `medium`, `high`, `xhigh` or `max`, and defaults to `max`.
  omp applies it only to the item's `effort` or a per-call model, not to a level the spawn hook sets.
  (source: [`task/settings.ts` L456–L469 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/settings.ts#L456-L469), [`task/settings.ts` L599–L612 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/settings.ts#L599-L612);
  [`task/executor.ts` L4490 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/executor.ts#L4490), [L4824–L4825 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/executor.ts#L4824-L4825))
- The bundled `task` agent runs at `auto`, which lets omp pick the effort per prompt, and `sonic` at `medium`.
  (source: [`task/agents.ts` L53–L71 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/agents.ts#L53-L71), [`task/agents.ts` L53–L71 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/agents.ts#L53-L71))
- The spawn event's `patterns` are the expanded model patterns omp would spawn with.
  omp fills them from the spawn policy's model override, so the list can be empty.
  A hook that returns an empty list leaves the policy unchanged.
  (source: [`extensibility/extensions/types.ts` L1075–L1086 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/extensibility/extensions/types.ts#L1075-L1086), [`extensibility/extensions/types.ts` L1221–L1232 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/extensibility/extensions/types.ts#L1221-L1232);
  [`task/structured-subagent.ts` L519 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/structured-subagent.ts#L519), [L713 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/structured-subagent.ts#L713))
- At 18.18.9 only, a user agent whose model tag names a level ignores the item's `effort`.
  The plugin skips a user agent that declares a model, so this rule does not reach a routed spawn.
  (source: [`task/structured-subagent.ts` L601–L605 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/structured-subagent.ts#L601-L605), [L676](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/structured-subagent.ts#L676))
- A probe hook's suffix set the child's level. With no hook the child ran on the parent's model at `high`.
  `@smol:high` ran the small model at `high`, `@smol:xhigh` at `xhigh`, and the event's own patterns with `:low` kept the parent's model at `low`.
  (running: omp 18.12.6 and 18.18.9, 2026-11-11)
- The item's `effort` won over the hook: with `task.enableEffort` on, an item `effort: "lo"` and a hook `@smol:high` ran the small model at `minimal`, its lowest level.
  The hook's suffix won over a project agent's `thinking-level: low` and over a level on the role, `modelRoles.smol: stub/small:low`.
  `task.maxEffort: low` with a hook `@smol:high` ran the child at `high`.
  (running: omp 18.12.6 and 18.18.9, 2026-11-11)
- The built plugin, with its Jev requests answered inside the omp process and the stand-in model, set the child's model and level as [Effort](../plugins/model-router-omp/README.md#effort) says.
  Level 0 ran the small model at `high` or `xhigh`, level 1 the parent's model at `low` or `medium`, and level 2 the large model at `medium` or `high`, as the work level picked.
  `task.maxEffort: low` capped level 0 at `low`, and `task.maxEffort: medium` capped level 2 at `medium`.
  With `task.maxEffort: minimal`, an item `effort: "lo"` or `modelRoles.smol: stub/small:low`, the plugin returned `@smol` alone, and the line named `config effort` or `caller effort`.
  (running: omp 18.12.6 and 18.18.9, 2026-11-12, 36 cases, every one alike at both versions)
- A level on the `smol` role reached the spawn's patterns of the bundled `scout` agent as `stub/small:low`.
  At level 1 the plugin then returned nothing and printed `config effort`, and the child ran at `low`, as it did without the plugin.
  A level on the `default` role did not reach the patterns of a `task` spawn, which read `stub/parent`.
  Without the plugin that child ran at `high`, not at the role's `low`.
  A project agent with `thinking-level: low` and no model ran at `low` without the plugin and at the ladder's `medium` on the large model at level 2.
  (running: omp 18.12.6 and 18.18.9, 2026-11-12, under the `extended` scope where an agent is named)
- At level 2 for `scout` with `modelRoles.smol: stub/small:low`, the spawn's patterns read `stub/small:low`, the plugin returned `@slow:medium`, and the child ran the large model at `medium`.
  With `task.enableEffort` off, an item `effort: "hi"` changed nothing without the plugin: the child ran the parent's model at `high`. With the plugin at level 0 and work 2, it returned `@smol:xhigh`, and the child ran the small model at `xhigh`.
  (running: omp 18.12.6 and 18.18.9, 2026-11-12)

### omp gaps

No documentation page under `docs/` at the commit named describes the `omp.settings` block.
The settings facts above rest on source at that commit.
[`marketplace.md` L129–L164](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L129-L164) lists no `privacyPolicyUrl` entry field.
The [catalogue parser](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/marketplace/fetcher.ts#L123-L215) preserves extra entry fields, but no source read here says what omp does with this one.
The [omp install names](#omp-install-names) facts ran on omp 18.16.0.
CI tests the two omp pins that [Oh My Pi](#oh-my-pi) names.
The `package` job in `.github/workflows/ci.yml` installs the unpacked tarball, lists the package and checks that omp loads it, but reads no setting, so no run exercises the settings name on either pin.
The settings-name facts are unchecked on every omp version from 18.12.6 up to 18.16.0.

The plugin routes the subagents of a `task` call only.
omp also fires `before_subagent_spawn` for eval `agent()` and `workpool()` spawns, with `invocationKind` `"eval"`.
The plugin returns nothing for them, because no `task` batch scored them.
Some subagents start with no `before_subagent_spawn` event, so no plugin can change their model:
`/cleanse` workers, vibe workers, follow-up turns of a running subagent, revived subagents, and a seance that reuses a prepared session.
(source: omp 18.12.6 and 18.18.9, not run:
[`task/structured-subagent.ts` L492–L521 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/structured-subagent.ts#L492-L521), [L686–L715 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/structured-subagent.ts#L686-L715) for `applySpawnHook`;
[`eval/agent-bridge.ts` L196 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/eval/agent-bridge.ts#L196), [L204 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/eval/agent-bridge.ts#L204);
[`eval/workpool-bridge.ts` L81 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/eval/workpool-bridge.ts#L81), [L80 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/eval/workpool-bridge.ts#L80);
[`cleanse/agent.ts` L106–L177 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/cleanse/agent.ts#L106-L177), [L94–L168 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/cleanse/agent.ts#L94-L168);
[`vibe/runtime.ts` L1391–L1392 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/vibe/runtime.ts#L1391-L1392), [L1394–L1395 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/vibe/runtime.ts#L1394-L1395);
[`task/workpool.ts` L401 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/workpool.ts#L401), [L406 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/workpool.ts#L406);
[`task/restore.ts` L89 at 18.12.6](https://github.com/can1357/oh-my-pi/blob/45c35e40c46166dc726ccc52f5d27f40f2449f99/packages/coding-agent/src/task/restore.ts#L89), [L90 at 18.18.9](https://github.com/can1357/oh-my-pi/blob/50da2d357039404a81d7c64622740ce13e4c54b4/packages/coding-agent/src/task/restore.ts#L90))

The stand-in model accepted every level, so no run exercised omp's clamp of a level to the range a model supports.
The plugin reads a level on the role it picks and on any role that role names with `@`.
A role left unset falls back to omp's own defaults, which the plugin does not read, so the routed effort replaces a level set there.

## OpenClaw

Documentation is the Markdown under `docs/` in `openclaw/openclaw`, published at docs.openclaw.ai.
Documentation pages below were read on 2026-11-05.
Every source link is a permalink at commit `d48be80a6379`, the commit `openclaw --version` of the 2026.10.10 release prints.
It is two commits after tag `v2026.10.10` (`7dc3350cb9f0`), and the two change only `scripts/lib/update-compat-inventory.json`.
The facts added on 2026-11-11 were also read at tag `v2026.11.3` (`847611dcaa3b`), where the cited files are unchanged.
Every running fact names its OpenClaw version and the date it ran.

### OpenClaw install and update

- `openclaw plugins install npm:<package>` installs from the npm registry only.
  A bare package name installs from npm too, unless it matches an official plugin id.
  An npm spec is a package name with an optional exact version or dist-tag.
  (documentation: [Install plugins, Sources and locators](https://docs.openclaw.ai/cli/plugins/install#sources-and-locators),
  [Hook packs and npm specs](https://docs.openclaw.ai/cli/plugins/install#hook-packs-and-npm-specs))
- A new arbitrary npm, git, local or marketplace source warns and asks before it installs.
  A non-interactive install must pass `--force` after the source is reviewed.
  (documentation: [Install plugins, Install](https://docs.openclaw.ai/cli/plugins/install#install),
  [Manage plugins, Install plugins](https://docs.openclaw.ai/plugins/manage-plugins#install-plugins))
- Non-interactive install, update and enable commands need `--accept-capabilities` when OpenClaw asks for capability consent.
  A local copy or an unverified source always asks.
  (documentation: [Manage plugins, Capability consent](https://docs.openclaw.ai/plugins/manage-plugins#capability-consent))
- `plugins install` adds the plugin to `plugins.allow`, enables its entry and selects its slot, unless `--no-enable` is passed.
  When the plugin's own config is absent and the plugin requires it, OpenClaw records the install disabled.
  `openclaw plugins enable <id>` then enables it.
  (documentation: [Install plugins, Install](https://docs.openclaw.ai/cli/plugins/install#install),
  [Manage plugins, Install plugins](https://docs.openclaw.ai/plugins/manage-plugins#install-plugins))
- With a local Gateway running, install, enable, disable and uninstall apply through it.
  Without one, they save the change for the next start.
  `openclaw plugins inspect <id> --runtime --json` loads the plugin module.
  The page says the report lists what the plugin registered.
  The report lists only what the plugin registers in `tool-discovery` mode, as the next bullet records.
  (documentation: [Manage plugins, Apply changes and inspect](https://docs.openclaw.ai/plugins/manage-plugins#apply-changes-and-inspect))
- `openclaw plugins inspect <id> --runtime` loads the plugin in `tool-discovery` mode, not in `full` mode.
  The mode list calls `tool-discovery` "capability discovery for executable tools", and `full` "live runtime activation".
  In that mode this plugin registers only its config tool, so `inspect` lists `model_router_config` and no hook or command.
  (source: [`plugins-inspect-command.ts` L125–L130](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/cli/plugins-inspect-command.ts#L125-L130),
  [`status.ts` L284](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/status.ts#L284),
  [`loader-registration-plan.ts` L48–L50](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-registration-plan.ts#L48-L50),
  [`plugin-registration.types.ts` L494–L509](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/plugin-registration.types.ts#L494-L509);
  this repository's `src/adapters/openclaw/index.ts` registers only the tool in `tool-discovery` mode;
  running: OpenClaw 2026.10.10, `inspect --runtime --json` of the packed tarball listed `tools: ["model_router_config"]`, `hooks: []` and `commands: []`)
- The `package` job installed the packed tarball and ran `openclaw plugins inspect model-router-openclaw --runtime --json`.
  `scripts/check-openclaw-install.ts` read the report and passed.
  So the report held the plugin id, the package name and the package version, status `loaded`, and `imported` and `enabled` true.
  It also held `model_router_config` in `contracts.tools` and no diagnostics.
  The script then called the installed bundle's `register()` on a recording API in `full` mode, instead of reading the registration from the report.
  The install printed `Installed plugin: model-router-openclaw` and `Saved for the next Gateway start.`, and the script printed `model-router-openclaw 0.16.1 is installed and loaded; it registers before_tool_call, model_router_config and model-router-provider, model-router-scope.`
  (running: OpenClaw 2026.11.1, the `package` job of [run 42119970365](https://github.com/Akurganow/model-router/actions/runs/42119970365), 2026-11-05)
- The Gateway log shows a command registration as `Registered plugin command: /<name> (plugin: <id>)`.
  OpenClaw writes the line through `logVerbose`, which logs under `--verbose` or at file log level `debug`.
  A registered hook counts in `hook runner initialized with <n> registered hooks`, a debug-level line of the `plugins` logger.
  A probe plugin's registration appeared in the Gateway log as `Registered plugin command: /probescope` when the Gateway loaded the plugin.
  (source: [`command-registration.ts` L377](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/command-registration.ts#L377),
  [`globals.ts` L6–L8](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/globals.ts#L6-L8),
  [`hook-runner-global.ts` L22–L27](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hook-runner-global.ts#L22-L27);
  running: OpenClaw 2026.10.10, the probe plugin's Gateway log)
- In the default `hybrid` reload mode, a change under `plugins.entries.<id>` replaces that plugin's runtime instance and reruns registration.
  (documentation: [Config hot reload](https://docs.openclaw.ai/gateway/configuration/hot-reload))
- `openclaw plugins install --link <path>` adds a local folder to `plugins.load.paths`, needs capability consent, and does not inherit official package trust.
  `openclaw plugins reload <id>` reloads a plugin after an edit.
  (documentation: [Install plugins, Local paths and bundle formats](https://docs.openclaw.ai/cli/plugins/install#local-paths-and-bundle-formats),
  [Manage plugins, Apply changes and inspect](https://docs.openclaw.ai/plugins/manage-plugins#apply-changes-and-inspect))
- `openclaw plugins install npm-pack:<path.tgz>` installs a local tarball that `npm pack` built.
  It uses the same managed npm project path as a registry install, and the tarball must sit on the Gateway host.
  (documentation: [Install plugins, Archives](https://docs.openclaw.ai/cli/plugins/install#archives) and [Install](https://docs.openclaw.ai/cli/plugins/install#install), `docs/cli/plugins/install.md`, read 2026-11-05;
  running: OpenClaw 2026.11.1, the `package` job of [run 42119970365](https://github.com/Akurganow/model-router/actions/runs/42119970365), which ran `openclaw plugins install "npm-pack:$TARBALL" --force --accept-capabilities` and `openclaw plugins inspect model-router-openclaw --runtime --json`, 2026-11-05)
- `openclaw plugins update <id>` reuses the tracked install spec.
  (documentation: [Manage plugins, Update plugins](https://docs.openclaw.ai/plugins/manage-plugins#update-plugins))
- `openclaw plugins disable <id>` toggles the plugin's config entry and leaves the installed files.
  (documentation: [Manage plugins, Enable and disable plugins](https://docs.openclaw.ai/plugins/manage-plugins#enable-and-disable-plugins))
- When the manifest id differs from the npm package name, install logs an info line and uses the manifest id as the config key.
  The line reaches the terminal only when the CLI runs the install itself.
  With a Gateway running, the CLI sends the install to it, and the Gateway's logger carries progress events but no `info` method.
  The line then appears nowhere.
  (source: [`install-installed-package.ts` L109–L112](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/install-installed-package.ts#L109-L112),
  [`plugins-install-command.ts` L65–L69](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/cli/plugins-install-command.ts#L65-L69),
  [`plugins-mutations.ts` L85–L93](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-methods/plugins-mutations.ts#L85-L93),
  [`plugins-command-helpers.ts` L7–L15](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/cli/plugins-command-helpers.ts#L7-L15);
  running: OpenClaw 2026.10.10, an `npm-pack:` install printed no such line, 2026-11-06)
- `openclaw logs --plain` tails the Gateway log, and `--follow` follows it.
  (documentation: [`openclaw logs`](https://docs.openclaw.ai/cli/logs))
- `openclaw config set <path> <value>` writes one config key.
  (documentation: [`openclaw config`, Examples](https://docs.openclaw.ai/cli/config#examples))
- The Control UI shows a plugin's schema-backed settings at `/settings/plugins/<plugin-id>`.
  (documentation: [Manage plugins, Use the Control UI](https://docs.openclaw.ai/plugins/manage-plugins#use-the-control-ui))

### OpenClaw package files

- A native plugin archive needs a valid `openclaw.plugin.json` at its root.
  (documentation: [Install plugins, Archives](https://docs.openclaw.ai/cli/plugins/install#archives))
- The manifest requires `id` and `configSchema`.
  `id` is the key in `plugins.entries.<id>`.
  `uiHints` carries labels and sensitivity hints, and `skills` lists skill folders relative to the plugin root.
  (documentation: [Plugin manifest, Top-level field reference](https://docs.openclaw.ai/plugins/manifest#top-level-field-reference))
- OpenClaw validates a plugin's config against the manifest's `configSchema` when it reads or writes the config and before the plugin loads.
  This plugin's schema sets `additionalProperties: false`, so a setting the manifest does not declare fails validation.
  (documentation: [Plugin manifest, JSON Schema requirements](https://docs.openclaw.ai/plugins/manifest#json-schema-requirements))
  `openclaw config set plugins.entries.model-router-openclaw.config.unknown_model x/y` exited 1 and saved nothing.
  It printed `Config change declined. No settings were saved.` and `Config validation failed: plugins.entries.model-router-openclaw.config: invalid config: must not have additional properties: "unknown_model"`.
  With that key written into the config file by hand, `openclaw gateway run` refused to start.
  `openclaw config validate` named the same cause and offered `openclaw doctor --fix`.
  (running: OpenClaw 2026.11.1 and 2026.10.10, 2026-11-13, the built plugin loaded through `plugins.load.paths` on a copy of the configuration; both versions alike)
- `activation.onStartup` set to `true` imports the plugin when the Gateway starts.
  (documentation: [Manifest capabilities, activation reference](https://docs.openclaw.ai/plugins/manifest/capabilities#activation-reference))
- `contracts.tools` lists the tool names a plugin owns, and a runtime `api.registerTool` call must match it.
  (documentation: [Manifest capabilities, contracts reference](https://docs.openclaw.ai/plugins/manifest/capabilities#contracts-reference))
- `configContracts.secretInputs` names the config paths under `plugins.entries.<id>.config` that hold secrets.
  (documentation: [Manifest config and secrets, secretInputs paths](https://docs.openclaw.ai/plugins/manifest/config-and-secrets#secretinputs-paths))
- `package.json` carries `openclaw.extensions`, `openclaw.compat.pluginApi` and `openclaw.install.minHostVersion`.
  OpenClaw enforces the last two when it installs a non-bundled plugin.
  (documentation: [Plugin package.json, package.json fields that affect discovery](https://docs.openclaw.ai/plugins/manifest/package-json))

### OpenClaw entry and registration

- `register(api)` stays synchronous.
  Handlers default to priority `0`, higher priorities run first, and registration order breaks ties.
  (documentation: [Hook reference, Registration and execution](https://docs.openclaw.ai/plugins/hooks/reference#registration-and-execution))
- `api.on(name, handler, opts)` accepts `matcher`, a non-empty list of tool ids, together with `priority` and `timeoutMs`.
  (documentation: [Hook reference, Registration and execution](https://docs.openclaw.ai/plugins/hooks/reference#registration-and-execution);
  source: [`reference.md` L34–L44](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/hooks/reference.md#L34-L44))
- A default export that is a plain object `{ id, register(api) }`, with no import from OpenClaw, loads and registers.
  `openclaw plugins inspect <id> --json` printed status `loaded`.
  (running: OpenClaw 2026.10.10, a probe plugin loaded through `plugins.load.paths`, then `openclaw plugins inspect`)
- `api.registrationMode` read `full` when the Gateway loaded the plugin.
  The plugin registered a second time with `discovery` after an agent turn.
  (running: OpenClaw 2026.10.10, the probe plugin logged `api.registrationMode` on each registration)
- `api.registrationMode` takes six values: `full`, `discovery`, `tool-discovery`, `setup-only`, `setup-runtime` and `cli-metadata`.
  (documentation: [Registration mode](https://docs.openclaw.ai/plugins/sdk-entrypoints/registration-mode#registration-mode);
  source: [`plugin-registration.types.ts` L503–L509](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/plugin-registration.types.ts#L503-L509))
- The loader calls `register(api)` once per load, with the mode of that load's plan.
  (source: [`loader-runtime-candidate.ts` L610–L619](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-runtime-candidate.ts#L610-L619), [`loader-registration-plan.ts` L39–L64](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-registration-plan.ts#L39-L64))
- A plugin that is not a channel meets four modes: `cli-metadata` for CLI metadata capture, `tool-discovery` for a scoped tool load, `full` for a load with runtime side effects, and `discovery` for any other load.
  (source: [`loader-registration-plan.ts` L39–L64](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-registration-plan.ts#L39-L64))
- Gateway startup loads its plugins in `full` mode, scoped to the startup plugin ids, and then activates that registry.
  (source: [`server-plugins.ts` L440–L456](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-plugins.ts#L440-L456), [`server-core-runtime.ts` L446–L466](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-core-runtime.ts#L446-L466))
- Any load with `activate: false` and no `runtimeSideEffects` runs in `discovery` mode and leaves the active registry alone.
  (source: [`loader-load-context.ts` L229–L231](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-load-context.ts#L229-L231), [`loader.ts` L18–L20](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader.ts#L18-L20))
- An agent turn reuses the Gateway registry whole when its plugin set and inputs are unchanged.
  Otherwise it loads its own registry in `discovery` mode and borrows the unchanged plugins from the Gateway registry.
  (source: [`runtime-plugins.ts` L308–L330](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/runtime-plugins.ts#L308-L330), [`prepared-model-runtime.inbound-registry.ts` L87–L117](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/prepared-model-runtime.inbound-registry.ts#L87-L117), [`loader-runtime-core.ts` L85–L114](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-runtime-core.ts#L85-L114))
- A prepared turn borrows from the Gateway registry only when the turn may bind Gateway subagents, passes no environment of its own, runs in a Gateway request scope, and uses the same `workspaceDir` as that registry.
  A plugin is borrowed only when its load inputs match the lent record's.
  Otherwise the turn's `discovery` load calls the plugin's `register`.
  (source: [`prepared-model-runtime.inbound-registry.ts` L63–L78](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/prepared-model-runtime.inbound-registry.ts#L63-L78), [`loader-runtime-core.ts` L105–L113](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-runtime-core.ts#L105-L113), [`loader-runtime-core.ts` L479](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-runtime-core.ts#L479))
- A plugin that a load borrows from the Gateway registry skips `register` in that load.
  `projectPluginContributions` copies its `tools`, `typedHooks` and `commands`, among other arrays, into the borrowing registry.
  (source: [`loader-runtime-core.ts` L539–L549](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-runtime-core.ts#L539-L549), [`registry-contributions.ts` L38–L99](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/registry-contributions.ts#L38-L99), [`registry-empty.ts` L4–L59](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/registry-empty.ts#L4-L59))
- Chat dispatch reads plugin commands from the registry of the current registration context, then of the request scope, then the active one.
  (source: [`plugin-command-registry.ts` L6–L14](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/plugin-command-registry.ts#L6-L14), [`plugin-command-runtime.ts` L189–L197](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/plugin-command-runtime.ts#L189-L197), [`commands-plugin.ts` L43–L47](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/auto-reply/reply/commands-plugin.ts#L43-L47))
- A turn that loads its own registry runs inside it as the request scope, so its command dispatch reads that `discovery` registry.
  A Gateway chat turn takes its prepared inbound registry, or loads one, and dispatches inside that registry's scope.
  (source: [`gateway-request-scope.ts` L184–L203](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/runtime/gateway-request-scope.ts#L184-L203), [`runtime-plugins.ts` L375–L377](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/runtime-plugins.ts#L375-L377), [`dispatch-from-config.ts` L207](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/auto-reply/reply/dispatch-from-config.ts#L207), [`dispatch-from-config.gather.ts` L535–L547](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/auto-reply/reply/dispatch-from-config.gather.ts#L535-L547))
- `/commands` reads the same registry as chat dispatch: `listPluginCommands` takes `requireActivePluginRegistry`, which returns the registration-context registry, then the request-scope registry, then the active one.
  (source: [`commands.ts` L52](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/commands.ts#L52), [`runtime.ts` L499–L503](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/runtime.ts#L499-L503), [`gateway-request-scope.ts` L291–L299](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/runtime/gateway-request-scope.ts#L291-L299))
- An agent run takes a plugin's tools from the registry that holds them, or cold-loads the plugin in `tool-discovery` mode.
  (source: [`tools.ts` L452–L509](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/tools.ts#L452-L509))
- A discovery-registry tool that matches a Gateway-registry tool by declared identity is replaced by the Gateway's tool.
  (source: [`tool-registry-adoption.ts` L9–L50](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/tool-registry-adoption.ts#L9-L50))
- `adoptRuntimeToolRegistrations` walks the tools of the discovery registry, so a plugin that registers no tool in `discovery` mode leaves nothing to replace and no tool for the turn.
  (source: [`tool-registry-adoption.ts` L20–L52](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/tool-registry-adoption.ts#L20-L52))
- `registerTool` and `registerCommand` are live in `full`, `discovery` and `tool-discovery` modes, as is `on`.
  (source: [`registry-state.ts` L52–L61](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/registry-state.ts#L52-L61), [`registry-api.ts` L128–L131](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/registry-api.ts#L128-L131))
- In `setup-only`, `setup-runtime` and `cli-metadata` modes, `registerTool`, `registerCommand` and `on` are no-ops.
  (source: [`api-builder.ts` L15](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/api-builder.ts#L15), [`api-builder.ts` L53](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/api-builder.ts#L53), [`api-builder.ts` L93](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/api-builder.ts#L93))
- In `cli-metadata` and `setup-only` modes, any read of `api.runtime` throws.
  (documentation: [Registration mode](https://docs.openclaw.ai/plugins/sdk-entrypoints/registration-mode#registration-mode);
  source: [`api-builder.ts` L97–L117](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/api-builder.ts#L97-L117))
- Each load builds its own registry, so a name registered in two passes never meets itself.
  (source: [`loader-runtime-core.ts` L267](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-runtime-core.ts#L267), [`registry-state.ts` L98](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/registry-state.ts#L98))
- A second command with the same name in one registry is rejected with a registration error.
  (source: [`command-registration.ts` L355–L365](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/command-registration.ts#L355-L365), [`registry-registrars-operations.ts` L449–L452](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/registry-registrars-operations.ts#L449-L452))
- A second tool with the same name in one registry is kept, then dropped at resolution with a name-conflict error.
  (source: [`registry-registrars-tools-hooks.ts` L276–L292](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/registry-registrars-tools-hooks.ts#L276-L292), [`tools.ts` L707–L713](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/tools.ts#L707-L713))
- `registerTool` needs the tool name in the manifest's `contracts.tools`, or the registration is refused.
  (source: [`registry-registrars-tools-hooks.ts` L228–L275](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/registry-registrars-tools-hooks.ts#L228-L275))
- Before a tool's `execute`, the agent loop checks the call's arguments against the tool's parameter schema and answers a failed check with a validation error.
  So in an agent run, a setting name outside the schema's `enum` never reaches `execute`.
  (source: [`agent-loop.ts` L1037–L1045](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/packages/agent-core/src/agent-loop.ts#L1037-L1045), [`validation.ts` L381–L420](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/packages/llm-core/src/validation.ts#L381-L420))
- With the tool and the commands registered in `full` and `discovery` mode (before the hook joined `discovery`), `/commands` listed `/model-router-provider` and `/model-router-scope`, and `/model-router-scope extended` wrote `extended` to the config.
  That held after a fresh Gateway start and after an install into the running Gateway.
  A build that registered them in `full` mode only also listed them in that run.
  (running: OpenClaw 2026.10.10, the plugin's npm tarball installed with `npm-pack:`, commands sent through `chat.send` over the Gateway WebSocket, 2026-11-06)
- With the hook registered in `full` and `discovery` mode, a Gateway chat turn on `openrouter/openai/gpt-4.1` called `sessions_spawn` with a task alone.
  The plugin logged `model-router L0 openrouter/openai/gpt-4.1-mini · medium · p=0.97/1.00 · jev jev-1.14.0 · 676/30 tok`.
  The child session ran on `openai/gpt-4.1-mini` through OpenRouter with thinking level `medium`.
  (running: OpenClaw 2026.10.10, the plugin's npm tarball installed with `npm-pack:`, one `chat.send` turn over the Gateway WebSocket, 2026-11-06)
- A Gateway chat turn with a prepared plugin generation runs inside that generation's scope, and its hook runner then reads hooks from that registry alone, with no overlay of the Gateway registry.
  `before_tool_call` always runs through that hook runner.
  So a plugin that registers its `before_tool_call` hook only in `full` mode routes no `sessions_spawn` of a turn whose `discovery` load called its `register`.
  A plugin is borrowed or registered in one registry, never both, and the overlay keys typed hooks by plugin id and hook name, so a hook in `full` and `discovery` runs once per call.
  (source: [`agent-command.ts` L692–L699](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-command.ts#L692-L699), [`hook-runner-global-state.ts` L123–L127](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hook-runner-global-state.ts#L123-L127), [`agent-tools.before-tool-call.policy.ts` L145–L146](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-tools.before-tool-call.policy.ts#L145-L146), [`hook-runner-global-state.ts` L79–L81](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hook-runner-global-state.ts#L79-L81), [`hook-runner-global-state.ts` L109–L114](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hook-runner-global-state.ts#L109-L114))
- Activating a registry initialises the global hook runner from it.
  (source: [`loader-shared.ts` L414–L431](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/loader-shared.ts#L414-L431))
- `api.on("before_tool_call", handler, { matcher: ["sessions_spawn"], priority: 100, timeoutMs: 10000 })` was accepted.
  (running: OpenClaw 2026.10.10, the probe plugin's `register`)
- `api.pluginConfig` held only `plugins.entries.<id>.config`.
  The operator's `hooks` settings sat under `api.config.plugins.entries.<id>.hooks`, readable at registration.
  `api.runtime.config.current` exists.
  (running: OpenClaw 2026.10.10, the probe plugin printed `api.pluginConfig`, `api.config` and the member names of `api`)
- A plugin loaded from `plugins.load.paths` without an install record loaded with a trust note and was active.
  (running: OpenClaw 2026.10.10, `openclaw plugins inspect` of the probe plugin)

### OpenClaw hook and spawn

- `before_tool_call` receives `event.toolName` and `event.params`, and `ctx.agentId`, `ctx.sessionKey` and an optional `ctx.abortSignal`.
  It can return `params`, `block` or `requireApproval`.
  (documentation: [Tool call policy hooks, Tool call policy](https://docs.openclaw.ai/plugins/hooks/tool-policy#tool-call-policy))
- A handler that returns `params` rewrites the tool parameters.
  Each handler sees a copy of the original event, and the last returned `params` wins.
  (documentation: [Tool call policy hooks, Tool call policy](https://docs.openclaw.ai/plugins/hooks/tool-policy#tool-call-policy);
  source: [`tool-policy.md` L68–L70](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/hooks/tool-policy.md#L68-L70))
- Native Codex tools reject parameter rewrites.
  OpenClaw passes Codex's own `spawn_agent` to `before_tool_call` under that name, and it refuses the call when a handler changes its arguments.
  The hook runner calls only handlers whose matcher covers the tool, so a handler registered for `sessions_spawn` never sees `spawn_agent`.
  (documentation: [Tool call policy hooks, Tool call policy](https://docs.openclaw.ai/plugins/hooks/tool-policy#tool-call-policy);
  source: [`tool-policy.md` L74–L76](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/hooks/tool-policy.md#L74-L76),
  [`native-hook-relay-codec.ts` L15–L20](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/harness/native-hook-relay-codec.ts#L15-L20),
  [`native-hook-relay-events.ts` L195–L203](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/harness/native-hook-relay-events.ts#L195-L203),
  [`hooks.ts` L218–L222](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hooks.ts#L218-L222))
- The plugin hook `subagent_spawning` was removed before 2026.10.10. Only `subagent_spawned` remains, and it observes a launch without changing it.
  (source: [`hook-types.ts` L124–L127](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hook-types.ts#L124-L127),
  [`registry-records.ts` L318–L335](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/compat/registry-records.ts#L318-L335),
  [`removed-surfaces.md` L242–L265](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/sdk-migration/removed-surfaces.md#L242-L265))
- Swarm's `agents.run` calls the `sessions_spawn` tool from the run's tool catalogue, whose entries carry the `before_tool_call` wrapper.
  The hook sees `toolName` `sessions_spawn` and the swarm keys, such as `collect` and `groupId`, and a returned `params` applies.
  (source: [`code-mode-swarm.runtime.ts` L109–L116](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/code-mode-swarm.runtime.ts#L109-L116),
  [L189–L192](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/code-mode-swarm.runtime.ts#L189-L192),
  [`tool-search-catalog.ts` L156–L160](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/tool-search-catalog.ts#L156-L160))
- `hooks.timeouts.<hookName>` overrides `hooks.timeoutMs`, which overrides the plugin's `timeoutMs`.
  Both operator fields take positive integers up to 600000 ms.
  (documentation: [Hook reference, Registration and execution](https://docs.openclaw.ai/plugins/hooks/reference#registration-and-execution);
  source: [`reference.md` L53–L76](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/hooks/reference.md#L53-L76))
- A `before_tool_call` handler gets 15 seconds by default, and a thrown error or a timeout blocks the tool call.
  The global hook runner marks `before_tool_call` fail-closed.
  (documentation: [Hook reference, Registration and execution](https://docs.openclaw.ai/plugins/hooks/reference#registration-and-execution);
  source: [`reference.md` L93](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/hooks/reference.md#L93),
  [`hook-runner-global.ts` L40–L44](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hook-runner-global.ts#L40-L44),
  [`hooks.ts` L497–L507](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hooks.ts#L497-L507))
- A hook timeout does not abort the handler.
  (documentation: [Hook reference, Registration and execution](https://docs.openclaw.ai/plugins/hooks/reference#registration-and-execution))
- `ctx.abortSignal` aborts only when the owning tool call is cancelled. A hook timeout does not abort it.
  (source: [`hook-types.ts` L531](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hook-types.ts#L531),
  [`reference.md` L78–L80](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/hooks/reference.md#L78-L80))
- The plugin's `api.logger` is the registry logger, bound once when OpenClaw builds the plugin API. No hook call or hook timeout gates it.
  (source: [`registry-api.ts` L120–L125](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/registry-api.ts#L120-L125),
  [`api-builder.ts` L143](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/api-builder.ts#L143))
- At the plugin's routing limit, the Gateway log read `model-router skipped, timeout` once, and the spawn ran unchanged.
  The hook timeout was 3000 ms, so the routing limit was 1000 ms. The Jev request went through a proxy that accepted the connection and never answered.
  The child's first model request followed the line by about 1 s, on the caller's model, a local stub that refused connections.
  No later `model-router` line appeared.
  (running: OpenClaw 2026.10.10, `POST /tools/invoke` with `sessions_spawn` on a copy of the state folder, 2026-11-11)
- The operator's per-hook timeout of 12 s beat the plugin's 10 s and the all-hooks value of 20 s.
  A handler that slept 13 s got `403 Tool call blocked because before_tool_call hook failed`, and the log read `timed out after 12000ms`.
  A handler that slept 11 s, over the plugin's own 10 s, finished and blocked by its own result.
  (running: OpenClaw 2026.10.10, `POST /tools/invoke` with `sessions_spawn`, after `gateway.tools.allow` named it)
- The handler saw event keys `toolName`, `params` and `toolCallId`, and context keys `toolName`, `agentId`, `sessionKey`, `abortSignal` and `toolCallId`.
  `ctx.agentId` was the requester, and `ctx.abortSignal` was an `AbortSignal`.
  The `params` held only the keys the caller passed.
  (running: OpenClaw 2026.10.10, the same call)
- The hook wraps the tool in the agent tool wrapper.
  Loopback MCP calls run the same hook and execute with the hook's `params`.
  (source: [`agent-tools.before-tool-call.wrapper.ts` L253](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-tools.before-tool-call.wrapper.ts#L253),
  [`mcp-http.handlers.ts` L170–L197](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/mcp-http.handlers.ts#L170-L197))
- `before_tool_call` receives the arguments that the tool reads next.
  The wrapper passes the call's `params` to the hook, and `sessions_spawn` defines no `prepareBeforeToolCallParams` to rewrite them first.
  Only a trusted tool policy or a granted approval may adjust them before the hook.
  The tool's `execute` then receives the hook's returned `params`, or the original ones when the hook returns none.
  (source: [`agent-tools.before-tool-call.wrapper.ts` L393–L424](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-tools.before-tool-call.wrapper.ts#L393-L424),
  [L446–L452](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-tools.before-tool-call.wrapper.ts#L446-L452),
  [L483–L492](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-tools.before-tool-call.wrapper.ts#L483-L492),
  [`agent-tools.before-tool-call.policy.ts` L265](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-tools.before-tool-call.policy.ts#L265),
  [L300–L313](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-tools.before-tool-call.policy.ts#L300-L313);
  `sessions-spawn-tool.ts` holds no `prepareBeforeToolCallParams`, which `common.ts` L42 declares as an optional tool member)
- `sessions_spawn` reads `agentId`, `label`, `model` and `thinking` through `readToolStringParam`.
  That function takes the key as written when the params object has it, else the snake_case form, such as `agent_id`.
  A key that is present wins even when its value is empty or not a string.
  It counts the value only when it is a string, trims it, and treats an empty result as absent.
  `model` then passes `normalizeToolModelOverride`, which also treats `default`, in any case, as no override.
  The tool reads `runtime` as `params.runtime === "acp"`, and `taskName` as `params.taskName`, with no snake_case form.
  (source: [`sessions-spawn-tool.ts` L432](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/tools/sessions-spawn-tool.ts#L432),
  [L440–L441](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/tools/sessions-spawn-tool.ts#L440-L441),
  [L459](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/tools/sessions-spawn-tool.ts#L459),
  [L470–L471](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/tools/sessions-spawn-tool.ts#L470-L471),
  [`common.ts` L96–L123](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/tools/common.ts#L96-L123),
  [`param-key.ts` L4–L31](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/param-key.ts#L4-L31))
- A handler that returned `{ params: { model, thinking } }` set both on a real `sessions_spawn`.
  The shallow merge kept `task`, and the result read `status: accepted`, the routed model, `modelApplied: true` and `mode: run`.
  The child transcript held a `model_change` to the routed model and a `thinking_level_change` to the routed level.
  The caller's session read thinking `off` and the child's read the routed level, with reasoning tokens in its reply.
  (running: OpenClaw 2026.10.10, `POST /tools/invoke` with `sessions_spawn`, then the child's transcript)
- The same rewrite took effect when the caller's agent ran on the Claude CLI backend.
  The hook fired for the loopback MCP call, with event keys `toolName`, `params`, `runId` and `toolCallId`.
  The result, `resolvedModel` and the child's transcript matched the embedded-runtime run.
  The run showed no login, logout, expiry or credential message.
  (running: OpenClaw 2026.10.10, one agent turn on the `claude-cli` backend, read from the Gateway log and the child transcript)
- A native sub-agent inherits the caller's model and explicitly chosen thinking level, unless `agents.defaults.subagents.model` or `.thinking` is set, or the agent sets `subagents.model` or `subagents.thinking`.
  An explicit `sessions_spawn.model` or `.thinking` still wins.
  (documentation: [Sub-agent tool reference, Tool: `sessions_spawn`](https://docs.openclaw.ai/tools/subagents/tool-reference#tool-sessions_spawn))
- `sessions_spawn` takes `taskName`, `label`, `agentId`, `runtime` (`subagent` or `acp`), `model`, `thinking`, `context`, `mode`, `thread`, `visible` and `sandbox`.
  An invalid `model` is skipped with a warning in the tool result.
  (documentation: [Sub-agent tool reference, Tool parameters](https://docs.openclaw.ai/tools/subagents/tool-reference#tool-parameters))
- A visible session is created through `sessions.create`, and a thinking override is unavailable on that path.
  (documentation: [Sub-agent tool reference, Tool parameters](https://docs.openclaw.ai/tools/subagents/tool-reference#tool-parameters);
  source: [`tool-reference.md` L266](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/tools/subagents/tool-reference.md#L266))
- OpenClaw rejects a spawn's `thinking` only when the string does not normalise to a known level.
  The error reads `Invalid thinking level`.
  A known level that the model does not support, such as `xhigh`, passes the spawn.
  At run time OpenClaw clamps it to the closest supported level and shows a notice, `Thinking level clamped to <effective> for <provider>/<model> (requested <level>; preference retained).`
  `api.runtime.agent.resolveThinkingPolicy` exists.
  (source: [`subagent-spawn-thinking.ts` L24–L30](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/subagents/spawn/subagent-spawn-thinking.ts#L24-L30),
  [`subagent-spawn-plan.ts` L78–L87](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/subagents/spawn/subagent-spawn-plan.ts#L78-L87),
  [`thinking.ts` L421–L441](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/auto-reply/thinking.ts#L421-L441),
  [`thinking.shared.ts` L61–L83](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/auto-reply/thinking.shared.ts#L61-L83);
  running: OpenClaw 2026.10.10, the probe plugin listed `resolveThinkingPolicy` among the members of `api.runtime.agent`)
- Explicit native subagent model selections keep their normal precedence and strictness.
  An agent's `model` is strict unless it carries its own `fallbacks`.
  (documentation: [Model failover, Selection source policy](https://docs.openclaw.ai/concepts/model-failover#selection-source-policy))
- `outputSchema` requires `collect: true`, and a collector child needs a tool policy that permits the collector tools.
  (source: [`sessions-spawn-tool.ts` L243–L247](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/tools/sessions-spawn-tool.ts#L243-L247),
  [L402–L404](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/tools/sessions-spawn-tool.ts#L402-L404);
  documentation: [Swarm](https://docs.openclaw.ai/tools/swarm))
- `sandbox: "require"` rejects a spawn unless the child runtime is sandboxed.
  A CLI backend runs under the external CLI's own sandboxing, not OpenClaw's.
  (documentation: [Sub-agent tool reference, `sandbox`](https://docs.openclaw.ai/tools/subagents/tool-reference#tool-parameters);
  [CLI backends](https://docs.openclaw.ai/gateway/cli-backends))

### OpenClaw model and credential checks

- `api.runtime.modelConfig` offers `resolveDefaultModelForAgent`, `resolveAllowedModelRef` and `resolveModelRuntimePolicy`.
  `api.runtime.modelAuth` offers `isProviderApiKeyConfiguredAsync`, and `api.runtime.agent` offers `resolveAgentDir`.
  (running: OpenClaw 2026.10.10, the probe plugin listed the members of `api.runtime`)
- `resolveAllowedModelRef` with an empty catalogue, the agent's id and the agent's default provider accepted `provider/model`, a configured alias and a bare name.
  It returned a reference with no `error` for a provider that does not exist.
  A bare name took the default provider.
  (running: OpenClaw 2026.10.10, `resolveAllowedModelRef({ cfg, catalog: [], raw, defaultProvider, agentId })` on a copy of the config)
- `isProviderApiKeyConfiguredAsync` with `agentDir` returned true for a provider whose key sat only in a stored profile.
  Without `agentDir` it returned false for the same provider.
  A provider with no key returned false, and so did a provider served only by the Claude CLI backend.
  (running: OpenClaw 2026.10.10, `isProviderApiKeyConfiguredAsync` with and without `agentDir` for four providers)

### OpenClaw commands and owner check

- A plugin command declares `requiredScopes`, and a command with a non-empty list can receive `senderIsOwner`.
  The admin scope is `operator.admin`.
  (source: [`command-registry-state.ts` L26–L31](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/command-registry-state.ts#L26-L31),
  [`operator-scopes.ts` L1](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/operator-scopes.ts#L1))
- A client with `operator.admin` ran the command, and the handler got `senderIsOwner: true` and `gatewayClientScopes` with the scope.
  A client with `operator.read` and `operator.write` only got `This command requires gateway scope: operator.admin.`, and the handler did not run.
  (running: OpenClaw 2026.10.10, a probe command with `requiredScopes: ["operator.admin"]`, called through `chat.send` over the Gateway WebSocket)
- A channel message carries no gateway scopes.
  `GatewayClientScopes` is set only for a message from the gateway client, and the command context passes it on as `gatewayClientScopes`.
  (source: [`templating.ts` L381–L382](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/auto-reply/templating.ts#L381-L382),
  [`gateway-client-identity.ts` L160](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-methods/gateway-client-identity.ts#L160),
  [`commands-context.ts` L27](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/auto-reply/reply/commands-context.ts#L27))
- For a command with `requiredScopes`, OpenClaw blocks a client whose scopes lack the scope.
  It blocks a caller with no scopes unless `senderIsOwner` is true.
  So a channel owner passes the check and the handler runs with no `gatewayClientScopes`.
  OpenClaw exposes `senderIsOwner` to the handler, and it runs `assertOwnerCurrent` when the scopes are not an array.
  The plugin's handler therefore checks `senderIsOwner === true` and does not read the scopes.
  (source: [`plugin-command-execution.ts` L162–L174](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/plugin-command-execution.ts#L162-L174),
  [L193–L194](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/plugin-command-execution.ts#L193-L194),
  [L272–L275](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/plugin-command-execution.ts#L272-L275))
- A Gateway client with `operator.admin` reaches the handler, and `senderIsOwner` is `true` for it.
  `chat.send` sets the provider of every Gateway client's message to the internal channel and passes the client's scopes on.
  The command check then marks the sender as owner when the provider is the internal channel and the scopes include `operator.admin`.
  So a handler that checks `senderIsOwner` alone refuses no admin Gateway client from `chat.send`.
  (source: [`gateway-client-identity.ts` L148](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-methods/gateway-client-identity.ts#L148),
  [L160](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-methods/gateway-client-identity.ts#L160),
  [`command-auth.ts` L489–L500](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/auto-reply/command-auth.ts#L489-L500),
  [`commands-context.ts` L75](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/auto-reply/reply/commands-context.ts#L75),
  [`plugin-command-execution.ts` L166–L170](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/plugin-command-execution.ts#L166-L170),
  [L193–L194](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/plugin-command-execution.ts#L193-L194))
- OpenClaw compares agent ids after `normalizeAgentId`, which trims, lower-cases and turns invalid characters into dashes.
  It finds an agent in `agents.entries`, or in the older `agents.list` array of `{ id }` items when `entries` is absent.
  (source: [`agent-id.ts` L3–L30](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/packages/normalization-core/src/agent-id.ts#L3-L30),
  [`agent-scope-config.ts` L317–L349](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-scope-config.ts#L317-L349),
  [`agent-roster.ts` L84–L99](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/agent-roster.ts#L84-L99))
- Configuration, enable, disable, install and uninstall changes through the Control UI need `operator.admin`.
  (documentation: [Manage plugins, Use the Control UI](https://docs.openclaw.ai/plugins/manage-plugins#use-the-control-ui))

### OpenClaw runtime, logs and environment

- The Gateway ran on Bun.
  `fetch`, `AbortSignal.any` and `AbortSignal.timeout` were functions in the hook and the command handler, and `fetch` reached an external host.
  (running: OpenClaw 2026.10.10, the probe plugin's handlers printed `typeof` of each and fetched `https://api.typesafe.ai/`)
- A config write under `plugins.entries.<id>` makes the Gateway replace that plugin's runtime instance.
  The replacement waits for the old instance's retained work to finish, up to a 60 s drain budget.
  While it waits, the Gateway logs `Plugin replacement queued behind <n> retained work item(s) for plugin <id>; applies when they finish within the 60s drain budget.`
  It logs `Plugin replacement applied: <id>` when the replacement takes over.
  Until then the old instance serves every call, and its `api.runtime.config.current()` returns the old config.
  OpenClaw throws `Gateway requester authority changed` when a request's client authority is no longer current.
  (source: [`server-plugin-reload-cleanup.ts` L30](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-plugin-reload-cleanup.ts#L30),
  [L107–L110](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-plugin-reload-cleanup.ts#L107-L110),
  [L332–L335](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-plugin-reload-cleanup.ts#L332-L335),
  [`server-plugin-reload.ts` L404](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/server-plugin-reload.ts#L404),
  [`http-request-authority.ts` L143–L148](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/gateway/http-request-authority.ts#L143-L148);
  running: OpenClaw 2026.10.10, a command write at 11:25:22 left a spawn at 11:25:30 under the old scope, and the replacement applied at 11:25:43; three runs showed about 9 s; a spawn that overlapped the replacement could fail with `Gateway requester authority changed`, 2026-11-06)
- `api.logger` is a scoped logger with `debug`, `info`, `warn` and `error`.
  (documentation: [Plugin SDK overview, Registration API](https://docs.openclaw.ai/plugins/sdk-overview#registration-api))
- A workspace `.env` is a lower-trust source.
  OpenClaw drops known provider credential variables from it, and `OPENROUTER_API_KEY` is on that list.
  `TYPESAFE_API_KEY` is not on the static list.
  The global `~/.openclaw/.env` and the Gateway's process environment are trusted sources.
  (documentation: [Environment variables, Provider credentials and workspace `.env`](https://docs.openclaw.ai/help/environment#provider-credentials-and-workspace-env);
  source: [`dotenv.ts` L21–L78](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/infra/dotenv.ts#L21-L78),
  [L238–L247](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/infra/dotenv.ts#L238-L247))
- Plugins receive resolved values for the `secretInputs` paths a manifest declares.
  The page says: "plugins receive resolved values with defaults selected from the source config".
  This plugin declares `api_key` and `openrouter_api_key`.
  It reads the live config first, where it skips a value that is not text, such as an unresolved SecretRef object, and then `api.pluginConfig`.
  No live probe has checked a SecretRef.
  (documentation: [Manifest config and secrets, secretInputs paths](https://docs.openclaw.ai/plugins/manifest/config-and-secrets#secretinputs-paths), `docs/plugins/manifest/config-and-secrets.md` L71, read 2026-11-05)

### OpenClaw gaps

CI installs the packed tarball through `npm-pack:` on OpenClaw 2026.11.1, and the probes loaded the plugin through `plugins.load.paths`.
The registry install of the npm package has not run, because the package is not published yet.
The `npm:` install command above rests on documentation.
No run kept the `inspect --runtime` report.
The `package` job's log holds the check's verdict, not the JSON, so that the report lists no hook or command rests on the source above.
The commands write the config through `api.runtime.config.mutateConfigFile`, and no live run has checked that write.
The [update page](https://docs.openclaw.ai/cli/plugins/uninstall-and-update) says updates need a stopped Gateway.
The [manage page](https://docs.openclaw.ai/plugins/manage-plugins#apply-changes-and-inspect) says an update refreshes a running one.
The two pages disagree, and no run settled it.
The hook runs only when a tool call runs.
Five paths start an agent session without that tool. [Paths the hook never sees](../plugins/model-router-openclaw/README.md#paths-the-hook-never-sees) lists them.
No source read here lists every such path.
The meeting bot's realtime consult also runs an agent under a sub-agent session key without that tool.
(source: [`agent-consult.ts` L92–L121](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/meeting-bot/agent-consult.ts#L92-L121))
No run covers a sandboxed child with a CLI-backend model, or an `outputSchema` spawn on a model without tools.
The sandbox rule for CLI backends and the collector child's need for tools rest on the documentation cited above.
The source check of the workspace `.env` list left out variables that an installed provider plugin adds.
OpenClaw may drop `TYPESAFE_API_KEY` when such a plugin declares it.
No run has shown the `skipped, cancelled` line. It rests on the `ctx.abortSignal` source above and the unit tests.
`before_model_resolve` can replace a run's model, provider and fallback chain.
It receives only the prompt and attachment metadata, and its result holds no thinking level.
It runs at the start of every embedded agent run, a sub-agent's included, unless the session's model selection is locked.
A sub-agent run shows only in `ctx.sessionKey`, which reads `agent:<id>:subagent:<uuid>`.
The plugin does not use this hook.
It would run on every turn of every session, not once per spawn.
It also cannot set the effort, which the plugin sets through `sessions_spawn`'s `thinking` as the other plugins set theirs.
(source: [`hook-before-agent-start.types.ts` L1–L20](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hook-before-agent-start.types.ts#L1-L20),
[`run-entry-model-selection.ts` L17–L63](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/embedded-agent-runner/run-entry-model-selection.ts#L17-L63),
[`setup.ts` L82–L137](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/embedded-agent-runner/run/setup.ts#L82-L137),
[`spawn-plan.ts` L60–L66](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/agents/spawn-plan.ts#L60-L66),
[`hook-agent-context.types.ts` L26–L67](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/src/plugins/hook-agent-context.types.ts#L26-L67))

## Hermes Agent

Documentation is the Markdown under `website/docs/` in `NousResearch/hermes-agent`, published at hermes-agent.nousresearch.com/docs.
Documentation pages below were read on 2026-11-06, as Markdown at tag `v0.23.0`.
Every source link is a permalink at commit `2bd378ed1b8d`, the commit of tag `v0.23.0`, the release CI installs.
Hermes v0.22.7 is commit `b200f5bc60e3`. Between v0.22.7 and v0.23.0, the delegation, plugin, registrar, manifest, host, constants, runtime-provider, `models_dev` and `secret_scope` files are unchanged. The two exceptions are an additive `delegation.prefix_stagger_seconds` setting in `tools/delegate_tool_config.py` and one entry added to the public-import list. (running: `git diff v0.22.7 v0.23.0` over those files, 2026-11-06)
Every running fact names its Hermes version and the date it ran.
The probe facts ran on Hermes v0.22.7 on a fresh Hermes home with a scrubbed environment, through a probe plugin named `probe-router`.
It was a `DelegationProvider` that records what `route_task` sees and returns a route.
Its live turns used `hermes -z "<call delegate_task once …>" -m google/gemini-2.5-flash --provider openrouter -t delegation --ignore-rules --usage-file <file>`.
The other probe calls ran in a Python process of that Hermes with its network functions blocked, or inside such a turn.
The facts marked Hermes v0.23.0 ran on a fresh Hermes home too, with the `hermes` command of the release CI installs.
This repository's plugin requires Hermes 0.22.6 or later, set by `requires_hermes` in `plugin.yaml`, and CI pins v0.23.0 in `.github/actions/setup-hermes/action.yml`.

### Hermes install and update

- `hermes plugins install` takes a catalog name, `user/repo`, or a path inside a repository: `owner/repo/path/to/plugin` downloads only that folder's files.
  Third-party plugins are off until their name is in `plugins.enabled`, and `plugins.disabled` always wins.
  After an install, Hermes asks `Enable 'name' now? [y/N]`, which defaults to no. `--enable` and `--no-enable` skip the question.
  (documentation: [Plugins, Plugins are opt-in](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins#plugins-are-opt-in-with-a-few-exceptions),
  [Managing plugins](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins#managing-plugins))
- `--ref <40-character commit>` pins an install to one immutable commit. Tags, branches and short hashes are not accepted.
  `hermes plugins update` refuses to move a pinned plugin. `hermes plugins install <source> --force --ref <new-commit>` moves the pin.
  (documentation: [Plugins, Plugins are opt-in](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins#plugins-are-opt-in-with-a-few-exceptions))
- `hermes plugins update <name>` pulls the latest code of a Git-installed plugin and scans it first.
  (documentation: [Managing plugins](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins#managing-plugins),
  [Install-time security scanning](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins#install-time-security-scanning))
- Hermes checks `requires_hermes` before it imports a plugin and blocks the load with `requires hermes <spec>, running <version>`.
  (source: [`plugins_manifest.py` L502–L510](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/plugins_manifest.py#L502-L510))
- `ctx.register_delegation_provider(provider)` takes an instance of `DelegationProvider`, and `provider.name` is matched by `delegation.backend`.
  A registration logs `Plugin '<name>' registered delegation provider: <backend>` at INFO.
  (source: [`plugins_registrars.py` L85–L90](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/plugins_registrars.py#L85-L90),
  [`plugins.py` L345–L374](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/plugins.py#L345-L374))
- A delegation backend change applies from the next session. `/delegation <backend> --now` rebuilds the running session's tools at its next turn.
  A hand edit of `delegation.backend` changes nothing in a running session.
  (documentation: [Delegation provider plugins, Picker metadata and switching backends](https://hermes-agent.nousresearch.com/docs/developer-guide/delegation-provider-plugin#picker-metadata-and-switching-backends))
- A configured backend that no enabled plugin provides fails closed. `delegate_task` returns a tool error that ends in `No subagent was started.` and names `hermes config set delegation.backend default` as the fix.
  A disabled or removed plugin is such a case.
  (documentation: [Delegation provider plugins](https://hermes-agent.nousresearch.com/docs/developer-guide/delegation-provider-plugin);
  source: [`delegation_registry.py` L107–L134](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/delegation_registry.py#L107-L134))
- `hermes plugins install file://<repo>#plugins/<name> --enable` with standard input closed installed and enabled a plugin from a subfolder with no prompt.
  The scan gave the verdict `safe`.
  (running: Hermes v0.22.7, a probe plugin installed from a `file://` clone of a local repository, 2026-11-06;
  Hermes v0.23.0, this repository's plugin installed the same way, which printed `Plugin model-router-hermes enabled.`, `hermes plugins list --plain --no-bundled` listed `model-router-hermes` as enabled, from the user source, at version 0.18.1, and `hermes config set delegation.backend model-router` followed by `hermes config get delegation.backend` printed `model-router`, 2026-11-06)
- `hermes plugins capabilities model-router-hermes` printed `declared: (none)`, and `hermes plugins doctor model-router-hermes` passed discovery, manifest, import and registration with `registrations: 1 tool(s), 0 hook(s)`.
  (running: Hermes v0.23.0, after the install above, 2026-11-06)

### Hermes package files

- A plugin folder holds `plugin.yaml` and `__init__.py` with `register(ctx)`.
  `plugin.yaml` carries `name`, `version`, `description`, `kind`, `requires_hermes`, `provides_tools` and `config_schema`, among others.
  `provides_tools` lists the tools the plugin registers and does not decide whether they load.
  (documentation: [Build a Hermes plugin, Write the manifest](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins#step-2-write-the-manifest),
  [Manifest v2 reference](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins#manifest-v2-reference))
- `config_schema` describes the keys under `plugins.entries.<id>.settings`. A mismatch logs a warning and never fails the load.
  The types are `str`, `int`, `float`, `bool`, `list`, `dict` and `secret`. A `secret` entry names the `.env` variable that stores it with `env:`.
  (documentation: [Manifest v2 reference](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins#manifest-v2-reference),
  [Settings form in the Desktop](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins#settings-form-in-the-desktop))
- This repository's `plugin.yaml` holds JSON text, which is valid YAML. The builder writes it from `metadata/source.json` and `src/`.
  `hermes plugins validate` parsed it, and reported `requires_hermes — spec '>=0.22.5' parses` for the manifest of that day and `config schema — shape valid`.
  (running: Hermes v0.23.0, `hermes plugins validate plugins/model-router-hermes`, 2026-11-06)
- The plugin registers its skill folders with `ctx.register_skill(<folder name>, <SKILL.md>)`. The agent loads a plugin skill as `skill_view("<plugin>:<skill>")`.
  Plugin skills are read-only, and the system prompt's skill index does not list them.
  (documentation: [Build a Hermes plugin, Bundle skills](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins#bundle-skills))

### Hermes registration and settings

- `ctx.get_config(key, default)` reads `plugins.entries.<plugin id>.settings.<key>`, and returns `default` when the entry or the key is absent. It applies no `config_schema` default.
  `ctx.set_config(key, value)` writes one value in that subtree.
  (source: [`plugins.py` L266–L280](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/plugins.py#L266-L280))
- `hermes config set plugins.entries.model-router-hermes.settings.small_model '{"provider": "openrouter", "model": "openai/gpt-4.1-mini"}'` stored a mapping with those two fields. `hermes config get` printed them on two lines.
  (running: Hermes v0.23.0, a fresh Hermes home, 2026-11-06)
- A `secret` entry never reaches `config.yaml`. The Desktop settings form stores it in `.env` under the entry's `env:` name, and the plugin reads it with `get_secret(NAME)` from `agent.secret_scope`.
  (documentation: [Settings form in the Desktop](https://hermes-agent.nousresearch.com/docs/developer-guide/plugins#settings-form-in-the-desktop);
  source: [`secret_scope.py` L230–L261](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/secret_scope.py#L230-L261))
- `get_secret("TYPESAFE_API_KEY")` returned the value from the Hermes home's `.env`, for a plugin that declared a `config_schema` secret with `env: TYPESAFE_API_KEY`, in process and in the plugin host. The variable was also in the environment of the host and of the gateway.
  (running: Hermes v0.22.7, a probe plugin, `plugins.isolation: host` and in process, 2026-11-06)
- `ctx.get_config("probe_setting")` returned the value from `plugins.entries.probe-router.settings`, in process and in the plugin host.
  (running: Hermes v0.22.7, the probe plugin, 2026-11-06)
- A plugin slash command's handler runs in the gateway process that owns the session. It can declare `session_id`, `session_key`, `platform` or `source` as keyword arguments, and Hermes passes them.
  The handler returns its text.
  (documentation: [Plugins, What plugins can do](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins#what-plugins-can-do))
- Hermes names `api_server`, `cli`, `codex`, `desktop`, `gateway`, `kanban`, `local`, `msgraph_webhook`, `tool`, `tui` and `webhook` as surfaces that are not a human messaging channel.
  The plugin's `/model-router-provider` writes only for `local`, `cli`, `tui` and `desktop`, four of those names. `localPlatforms` in `constants.json` lists them.
  (source: [`session_context.py` L197–L203](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/gateway/session_context.py#L197-L203))
- With no saved tool selection, a plugin's toolset is on by default. Enabling a plugin puts its toolset back into a saved selection.
  (documentation: [Plugins, Plugins are opt-in](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins#plugins-are-opt-in-with-a-few-exceptions))

### Hermes routing and refusals

- `DelegationProvider` is an abstract class. A backend implements `name` and the synchronous `route_task(task, config)`. `is_available()` returns true by default, and false fails delegation closed.
  `config` is the `delegation` section of the active profile's `config.yaml`, and `dict(config)` is the default route.
  (documentation: [Delegation provider plugins, The interface](https://hermes-agent.nousresearch.com/docs/developer-guide/delegation-provider-plugin#the-interface);
  source: [`delegation_provider.py` L62–L110](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/delegation_provider.py#L62-L110))
- `route_task` gets `{goal, context, index}` plus the parameters the backend declared. This plugin declares three, as [Hermes task parameters](#hermes-task-parameters) says, and `context` can be `None`.
  Nothing else crosses: no role, no agent description, no toolsets, no images and no output schema.
  (source: [`delegate_tool_routes.py` L299](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L299);
  running: Hermes v0.22.7, the probe plugin saw the task keys `context, goal, index`, and `context` was `None` when the model gave none, 2026-11-06)
- The `config` argument held `api_key, api_mode, backend, backends, base_url, child_timeout_seconds, compression_threshold_tokens, fallback_providers, gateway_mode, independent_completions, inherit_mcp_toolsets, max_concurrent_children, max_iterations, max_spawn_depth, max_summary_chars, model, oneshot_max_children, orchestrator_enabled, provider, reasoning_effort, request_overrides, subagent_auto_approve, surface_child_process_notifications`. `backend` was the plugin's backend name.
  (running: Hermes v0.22.7, the probe plugin, 2026-11-06)
- A route may carry `model`, `provider`, `base_url`, `api_key`, `api_mode`, `request_overrides`, `reasoning_effort`, `service_tier`, `fallback_providers`, `profile` and `label`. Hermes drops every other key silently.
  Hermes's own default backend returns the `delegation` section without `service_tier`.
  (source: [`delegation_provider.py` L51–L54](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/delegation_provider.py#L51-L54),
  [`delegate_tool_routes.py` L103–L108](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L103-L108),
  [`plugins/delegation/default/__init__.py` L32–L34](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/plugins/delegation/default/__init__.py#L32-L34);
  this repository's `router.py` returns the same dict with a `label`, a `model`, a `provider` and a `reasoning_effort` changed on top, so `api_mode` and `request_overrides` stay in every route, also when the provider changes)
- A returned route resolves through the credential resolver of the `delegation` section. A `provider` runs `resolve_runtime_provider`; an empty route inherits the parent's route.
  `request_overrides` apply on every branch.
  (source: [`delegate_tool_routes.py` L233–L238](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L233-L238),
  [`delegate_tool_config.py` L478–L488](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_config.py#L478-L488))
- A child's effort is the route's effort, else `delegation.reasoning_effort`, else the parent's level.
  A backend's `reasoning_effort` outside the known levels refuses the task, except a value equal to `delegation.reasoning_effort`.
  (source: [`delegate_tool_config.py` L552–L560](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_config.py#L552-L560),
  [`delegate_tool_routes.py` L255–L265](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L255-L265))
- A child pinned by provider, endpoint or model gets no fallback providers unless `delegation.fallback_providers` declares them.
  (source: [`config_defaults.py` L1318–L1322](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/config_defaults.py#L1318-L1322))
- A raise from `route_task` refuses that task: Hermes logs `delegation provider <name>.route_task() raised` and reports `Task <i>: delegation backend '<name>' failed: <error>`.
  A return of `None` or of a non-mapping refuses it too. A refusal is per task, and the call is a tool error only when every task is refused.
  A returned `{}` is not a refusal: the child inherits the parent's route.
  (documentation: [Delegation provider plugins, Refusals are per task](https://hermes-agent.nousresearch.com/docs/developer-guide/delegation-provider-plugin#refusals-are-per-task);
  source: [`delegate_tool_routes.py` L103–L108](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L103-L108),
  [L288–L306](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L288-L306),
  [L309–L332](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L309-L332))
- Hermes routes the tasks of a call in one loop, in index order, in the thread that runs the call. It builds the children after the loop ends.
  `delegate_task` is exempt from the generic sequential tool deadline, so Hermes puts no timeout around `route_task`.
  (source: [`delegate_tool_routes.py` L325–L331](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L325-L331),
  [`delegate_tool.py` L613](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool.py#L613),
  [L654](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool.py#L654),
  [`tool_executor.py` L856](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/tool_executor.py#L856);
  running: Hermes v0.22.7, under `plugins.isolation: host`, task 1 started 1747 ms after task 0, which included the host's cold start, 2026-11-06)
- The main agent's turn is not routed through the provider. Only `delegate_task` tasks are, and internal callers that pass their own credentials bypass the backend.
  (documentation: [Delegation provider plugins](https://hermes-agent.nousresearch.com/docs/developer-guide/delegation-provider-plugin);
  source: [`delegate_tool.py` L507–L518](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool.py#L507-L518))
- `label` is short text shown with the child's progress and result. Every result entry of a task routed by a non-default backend carries `route`: the backend, the label, and what the child ran on.
  (documentation: [Delegation provider plugins, Result route](https://hermes-agent.nousresearch.com/docs/developer-guide/delegation-provider-plugin#result-route);
  source: [`delegation_provider.py` L29](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/delegation_provider.py#L29))
- A delegated task takes the routed model and effort. One in-process task, routed to `openai/gpt-4.1-mini` at effort `low`, ran a child session with `model = openai/gpt-4.1-mini` and `reasoning_config = {enabled: true, effort: low}`.
  The result entry carried `route: {backend: probe-router, label, model, provider: openrouter, reasoning_effort: low, service_tier: normal}` and the summary `pong`.
  Under `plugins.isolation: host`, two tasks of one call routed to `openai/gpt-6-luna` at effort `low` ran two child sessions with `model = openai/gpt-6-luna` and effort `low`; the summaries were `ping` and `pong`.
  (running: Hermes v0.22.7, the probe plugin, `hermes -z "<call delegate_task once …>" -m google/gemini-2.5-flash --provider openrouter -t delegation --ignore-rules --usage-file <file>` under a 330 s alarm, once for each turn, 2026-11-06)
- This repository's plugin routed a real call. One `delegate_task` call held a lookup task and a design task. The provider was `typesafe`, `small_model` was `openrouter openai/gpt-6-luna` and `large_model` was `openrouter openai/gpt-6.1-terra`.
  In process, the lookup task read `model-router L0 openai/gpt-6-luna · medium · p=0.67/0.99 · jev jev-1.14.0 · 686/30 tok`, and the design task read `model-router L2 openai/gpt-6.1-terra · high · p=1.00/0.60 · jev jev-1.14.0 · 705/30 tok`.
  The child sessions ran `openai/gpt-6-luna` at effort `medium` and `openai/gpt-6.1-terra` at effort `high`. Each result entry carried the line in `route.label`, and `agent.log` held both lines.
  After `hermes gateway stop` and `plugins.isolation: host`, the same call gave the same levels, models and efforts, with `p=0.63/0.99` and `p=1.00/0.61`. `route.label` carried both lines, and `agent.log` held no routing line.
  (running: Hermes v0.22.7, the plugin installed with `hermes plugins install "file://<clone>#plugins/model-router-hermes" --enable` on a fresh Hermes home and set up as its README says, `hermes -z "<call delegate_task once with two tasks …>" -m openai/gpt-6-luna --provider openrouter -t delegation --ignore-rules --usage-file <file>` under a 400 s alarm, once for each mode, 2026-11-06, repeated after the request began to key the models by slot and the reply dropped the level)
- Hermes maps a requested effort that a wire does not support to the nearest weaker supported level, and to the weakest level when none is weaker.
  (source: [`reasoning_effort.py` L127–L139](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/reasoning_effort.py#L127-L139))

### Hermes task parameters

- `DelegationProvider.task_parameters(config)` returns `{name: json_schema}`, which Hermes merges into `delegate_task`'s `tasks.items.properties`. `description(config)` returns a line that Hermes appends to the tool description after a line break.
  Hermes calls both when it builds a session's tool list, and both must give the same bytes for the same `config`, because the schema is part of the cached prompt.
  (source: [`delegation_provider.py` L86–L101](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/delegation_provider.py#L86-L101),
  [`delegate_tool.py` L763–L772](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool.py#L763-L772);
  documentation: [Delegation provider plugins, Prompt caching](https://hermes-agent.nousresearch.com/docs/developer-guide/delegation-provider-plugin#prompt-caching))
- Both methods exist from Hermes v0.22.5, the first release with delegation providers. They are unchanged in v0.22.6, v0.23.0 and v0.23.1.
  (running: `git log --diff-filter=A -- agent/delegation_provider.py` and `git diff v0.22.6 v0.23.1 -- agent/delegation_provider.py tools/delegate_tool_routes.py` in a clone of `NousResearch/hermes-agent`, 2026-11-11)
- A parameter name must match `^[a-z][a-z0-9_]{0,63}$` and stay out of the reserved names `goal, context, index, output_schema, images, group, role, toolsets, acp_command, acp_args, provider, model, base_url, api_key, api_mode`. Hermes drops a refused name with a warning and keeps the others.
  (source: [`delegate_tool_routes.py` L26](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L26),
  [L60–L78](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L60-L78),
  [`delegation_provider.py` L45–L48](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/delegation_provider.py#L45-L48);
  running: Hermes v0.23.0, a probe that declared `model` and `Effort` logged `task parameter 'model' refused (reserved or invalid name)` and the same for `Effort`, 2026-11-11)
- Before `route_task`, Hermes checks only three things. A non-`None` value for a name no backend declared refuses the task. A value outside a declared `enum` refuses it. A `None` value counts as absent.
  Hermes checks no `type`. A `level` of `True` passes the enum `[0, 1, 2]`, because Python compares `True` equal to `1`.
  (source: [`delegate_tool_routes.py` L96–L100](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L96-L100),
  [L288–L306](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L288-L306);
  running: Hermes v0.23.0, `plugins/model-router-hermes/tests/test_real_hermes.py` under Hermes's interpreter, 2026-11-11: `reasoning_effort: "max"` and `level: "2"` were refused with `must be one of`, `priority` was refused with `does not take 'priority'`, and `level: True` reached `route_task`)
- The payload is `{goal, context, index}` plus each declared parameter whose value is not `None`.
  (source: [`delegate_tool_routes.py` L299](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L299);
  running: Hermes v0.23.0, the same test file, 2026-11-11: a task with `description` and `reasoning_effort` reached `route_task` as `{goal, context: None, index: 0, description, reasoning_effort}`)
- This repository's plugin declares `description`, `reasoning_effort` and `level`, and appends one line from `constants.json`. Under Hermes v0.23.0, `schema_extension` returned all three, none reserved, and `_build_dynamic_schema_overrides()` put them in `tasks.items.properties` and ended the tool description with the line.
  (running: `plugins/model-router-hermes/tests/test_real_hermes.py`, 2026-11-11)
- A session routes on the backend its `delegate_task` schema was built from. A plugin update or a backend change applies from the next session, or at the next turn after `/delegation <backend> --now`. A task that carries a parameter its session's schema lacks is refused alone.
  (documentation: [`delegation-provider-plugin.md` L171–L188](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/website/docs/developer-guide/delegation-provider-plugin.md#L171-L188))
- A real delegating model filled the parameters. One `delegate_task` call held a new task and a re-dispatch of a task described as failed at level 1. The provider was `typesafe`, `small_model` was `openrouter qwen/qwen3.7-flash` and `large_model` was `openrouter openai/gpt-6-luna`.
  The model gave both tasks a `description`, and gave the re-dispatch `level: 2` and `reasoning_effort: "high"`. The new task read `model-router L0 qwen/qwen3.7-flash · medium · p=0.99/1.00 · jev jev-1.14.0 · 699/30 tok`.
  The re-dispatch ran on `openai/gpt-6-luna` at effort `high`, and its result's `route` held `backend`, `provider`, `model`, `reasoning_effort` and `service_tier` but no `label`. `agent.log` held the first line only.
  (running: Hermes v0.23.0, the plugin installed from this branch with `hermes plugins install "file://<clone>#plugins/model-router-hermes" --enable` on a fresh Hermes home, `hermes -z "<call delegate_task once with two tasks …>" -m qwen/qwen3.7-flash --provider openrouter -t delegation --ignore-rules --usage-file <file>` under a 400 s alarm, 2026-11-11)
- Under `plugins.isolation: host`, the parent builds a `DelegationProvider` whose methods run in the plugin host, so `task_parameters` and `description` cross as plain JSON.
  (source: [`plugin_isolation.py` L63–L78](https://github.com/NousResearch/hermes-agent/blob/3b421578588243f920886e6fe79a6faa87ea026e/hermes_cli/plugin_isolation.py#L63-L78), at v0.23.1)
- A route without a `fallback_providers` of its own takes `delegation.fallback_providers`, and a profile route keeps its profile's chain. The plugin's route copies the `delegation` section, so a routed child gets exactly that list, and none when it is `null`.
  (source: [`delegate_tool_routes.py` L224–L230](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/delegate_tool_routes.py#L224-L230))
- A route may name a `profile`, which runs the child as another Hermes profile with its own config, model, credentials, skills and `SOUL.md`. Hermes ignores every other route key on it. Hermes v0.23.1 adds a `route_keys` property for settings editors, which routing does not use. The plugin sets neither.
  (source: [`delegation_provider.py` L25–L28](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/delegation_provider.py#L25-L28);
  [`delegation_provider.py` L81–L86](https://github.com/NousResearch/hermes-agent/blob/3b421578588243f920886e6fe79a6faa87ea026e/agent/delegation_provider.py#L81-L86), at v0.23.1)

### Hermes model and credential checks

- With sockets blocked in the process, `agent.models_dev.list_provider_models(p, allow_network=False)` read the Hermes home's models.dev cache with zero network attempts.
  It listed models for openrouter (378), anthropic (17), openai (51), gemini (34), deepseek (4), xai (12), openai-codex (51), zai (18) and minimax (8). It listed none for nous, copilot, custom, ollama, lmstudio, kimi-coding or an unknown id.
  `openai/gpt-6-luna` and `openai/gpt-4.1-mini` were listed for openrouter. The same call worked in the plugin host.
  (running: Hermes v0.22.7, 2026-11-06;
  source: [`models_dev.py` L1–L8](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/models_dev.py#L1-L8), where the module text says hot paths pass `allow_network=False` and never do I/O,
  [L936–L942](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/models_dev.py#L936-L942))
- `resolve_runtime_provider(requested=p)` made zero network attempts with sockets blocked, for openrouter, anthropic, openai, gemini, deepseek, nous, openai-codex, xai, qwen-oauth, copilot, minimax-oauth, custom, ollama and an unknown id.
  None of the OAuth providers had stored credentials, so they raised `AuthError` at once.
  It checks the provider and its credentials, not that the model exists.
  (running: Hermes v0.22.7, 2026-11-06;
  source: [`runtime_provider.py` L1044](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/runtime_provider.py#L1044))
- `PROVIDER_REGISTRY[p].auth_type` is `api_key` for 69 providers, `oauth_device_code` for nous, `oauth_external` for openai-codex, qwen-oauth, solstice, solstice-oauth and xai-oauth, `oauth_minimax` for minimax-oauth, `aws_sdk` for bedrock and `vertex` for vertex.
  (running: Hermes v0.22.7, 2026-11-06;
  source: [`auth.py` L144–L152](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/auth.py#L144-L152), [L242–L243](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/auth.py#L242-L243))
- `api_key` as an auth type is not enough. `anthropic` is `api_key`-typed, yet with `ANTHROPIC_API_KEY` unset it resolves Claude Code's OAuth credentials, and with `ANTHROPIC_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN` set it reads them to prefer a refreshable token. The resolve source read `env` in each case.
  (running: Hermes v0.22.7, 2026-11-06;
  source: [`anthropic_credentials.py` L700–L718](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/anthropic_credentials.py#L700-L718))
- `is_refreshable_oauth_provider(p)` is true for the providers in `REFRESHABLE_OAUTH_PROVIDERS` (anthropic and nous among them) and for plugin profiles with a refresh hook.
  (running: Hermes v0.22.7, 2026-11-06;
  source: [`auth_plugin_providers.py` L340–L344](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/auth_plugin_providers.py#L340-L344))
- `PROVIDER_REGISTRY` has no `openrouter` entry: Hermes resolves OpenRouter through its credential pool and its OpenRouter rung, outside the registry. A live `delegate_task` run with two OpenRouter slots left both unresolved while the check required a registry entry.
  (running: Hermes v0.22.7, 2026-11-06, `hermes -z` with the plugin installed from this repository;
  source: [`runtime_provider.py` L1044–L1088](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/runtime_provider.py#L1044-L1088))
- The rule this repository's `checks.py` applies: a provider is checked offline only when `is_refreshable_oauth_provider` is false and the provider is either absent from `PROVIDER_REGISTRY` or listed with the auth type `api_key`; `anthropic` instead needs `ANTHROPIC_API_KEY` set and `ANTHROPIC_TOKEN` and `CLAUDE_CODE_OAUTH_TOKEN` unset. Every other provider reads as unresolved. A custom or local provider passes this rule and then fails the catalogue check, which lists no model for it. A test under Hermes's interpreter reads the real registry: openrouter, gemini and deepseek pass, nous, openai-codex, qwen-oauth, minimax-oauth and bedrock do not.
- `resolve_runtime_provider` first calls `recover_for_provider`, which can install a left-core provider plugin. The context manager `installs_held()` turns that off, and the plugin resolves inside it.
  (running: Hermes v0.22.7, 2026-11-06;
  source: [`left_core_migration.py` L616](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/left_core_migration.py#L616),
  [L709–L720](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/left_core_migration.py#L709-L720))
- `resolve_runtime_provider` refreshes no credential for `openrouter`, `custom` or a named custom provider. They read an environment variable, a config key or a credential-pool entry. A pool refreshes an OAuth entry only for `anthropic`, a provider with a refresh hook, `openai-codex` and `xai-oauth`, and never refreshes any other entry. The OAuth runtime rung covers only `nous`, `openai-codex`, `xai-oauth` and `qwen-oauth`. A named custom provider with `key_cmd` runs that command at request time to mint its token. Such a provider reads as unresolved, because the catalogue lists no model for it.
  (source: [`credential_pool.py` L1943–L1956](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/agent/credential_pool.py#L1943-L1956),
  [`runtime_provider.py` L829–L838](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/runtime_provider.py#L829-L838),
  [`runtime_provider_custom.py` L508–L516](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/runtime_provider_custom.py#L508-L516), read 2026-11-06)
- `installs_held` first appears in Hermes v0.22.6. At v0.22.5 (commit `bf0203a794a0`), `hermes_cli/left_core_migration.py` has neither `installs_held` nor `recover_for_provider`, so the slot check's import fails there and every slot would read as unresolved. Every other Hermes function, context method, task key and manifest field the plugin uses exists at v0.22.5. The plugin therefore requires v0.22.6.
  (source: [`left_core_migration.py` L709–L720 at v0.22.6](https://github.com/NousResearch/hermes-agent/blob/f0d94882e89ab8d4098b5bb2f166adfb9ee0a0ab/hermes_cli/left_core_migration.py#L709-L720), read 2026-11-06)
- Hermes ingests an `OPENROUTER_API_KEY` from the environment into the home's credential pool at start-up and prints one line to standard error. The resolve source then reads `env:OPENROUTER_API_KEY`.
  (running: Hermes v0.22.7, 2026-11-06)
- One offline slot check (`checks.slot_resolves`) took 3.5 to 5.3 ms warm and 3.9 to 13.8 ms on its first call, for openrouter, anthropic, openai, gemini, deepseek and xai, with sockets blocked. The first call of a process took 21 ms.
  (running: Hermes v0.23.1, 2026-11-13, one cold and ten warm calls per provider under `hermes --run-module unittest discover`)

### Hermes runtime, logs and environment

- A `hermes -z` turn on a home with no gateway starts one, with `python3 -m hermes_cli.main --profile default gateway run --quiet --idle-exit`. On macOS it starts as a one-off launchd job through `osascript`.
  The provider runs in that gateway process, on a `ThreadPoolExecutor` thread.
  (running: Hermes v0.22.7, 2026-11-06;
  source: [`gateway_launchd_runtime.py` L1–L13](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/gateway_launchd_runtime.py#L1-L13))
- The gateway keeps the plugin loaded between CLI turns. Module state carried over from turn 1 to turn 2: a counter read 1, then 2 and 3, in one process.
  A change of `plugins.isolation` or of the plugin's code applies after `hermes gateway stop`. The turn that followed a change of `plugins.isolation` without a stop did not run in host mode, so the probe did not count it.
  `hermes gateway stop` with `HERMES_HOME` set stops the gateway and its plugin host.
  (running: Hermes v0.22.7, 2026-11-06)
- Under `plugins.isolation: host`, the provider ran in `python3 -m hermes_cli.plugin_host_child`, a child of the gateway, one per profile. `HERMES_PLUGIN_HOST_PROCESS` was set, the context was `RemotePluginContext`, and the call thread was `plugin-host-rpc`.
  Module state persisted across the tasks of one call: a counter read 1, then 2, in one host process.
  (running: Hermes v0.22.7, 2026-11-06;
  documentation: [Plugins, Running plugins out of process](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins#running-plugins-out-of-process-pluginsisolation),
  [Delegation provider plugins, Process isolation](https://hermes-agent.nousresearch.com/docs/developer-guide/delegation-provider-plugin#process-isolation))
- `hermes_constants.find_node_executable("node")` reads the Node that Hermes's package manager selected, and returns `None` when it installed none. It never falls back to the Node on the user's `PATH`.
  It found Hermes's Node in both modes. A Node round trip (spawn, standard input, standard output) took 63 to 89 ms in process and 376 to 388 ms in the host.
  `route_task` took 78 to 102 ms in process, 1726 ms for the first task in a fresh host and 401 ms for the next.
  (running: Hermes v0.22.7, 2026-11-06;
  source: [`hermes_constants.py` L575–L613](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_constants.py#L575-L613))
- Hermes writes `agent.log` at INFO and above, in the `logs` folder of the Hermes home. The plugin host sets its own log level from `HERMES_PLUGIN_HOST_LOG_LEVEL`, with `WARNING` as the default, so it drops INFO lines unless the variable says otherwise.
  (source: [`hermes_logging.py` L3](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_logging.py#L3),
  [L360–L369](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_logging.py#L360-L369),
  [L396–L397](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_logging.py#L396-L397),
  [`plugin_host_child.py` L600–L601](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/plugin_host_child.py#L600-L601))
- Hermes runs natively on Windows 10 and Windows 11, without WSL. `find_node_executable` has Windows branches.
  A program started with a replaced environment on Windows needs `SYSTEMROOT`, so the plugin passes it to Node.
  (documentation: [Windows (Native) Guide](https://hermes-agent.nousresearch.com/docs/user-guide/windows-native), [`windows-native.md` L10](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/website/docs/user-guide/windows-native.md#L10),
  [Python `subprocess`, Popen constructor](https://docs.python.org/3/library/subprocess.html#popen-constructor);
  source: [`hermes_constants.py` L585–L586](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_constants.py#L585-L586), [L605–L612](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_constants.py#L605-L612), read 2026-11-06)
- `NODE_USE_ENV_PROXY=1` makes Node parse `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` at start-up and route requests through the proxy. Node added it in v24.0.0 and v22.21.0.
  The plugin sets it when `HTTPS_PROXY`, `HTTP_PROXY` or their lower-case forms are present, unless the environment sets it.
  (documentation: [Node.js command-line API, `NODE_USE_ENV_PROXY=1`](https://nodejs.org/docs/latest/api/cli.html#node_use_env_proxy1), read 2026-11-06)

### Hermes install scan and validate

- Every `hermes plugins install` and `hermes plugins update` scans the plugin tree before it activates it. The verdicts are `safe`, `caution` (confirm, or pass `--force`) and `dangerous` (blocked, and `--force` does not override).
  Documentation prose cannot make a verdict `dangerous` alone, but a leaked provider key keeps its full severity there, and so does anything under a bundled `skills/` tree.
  (documentation: [Plugins, Install-time security scanning](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins#install-time-security-scanning);
  source: [`skills_guard.py` L953–L956](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/skills_guard.py#L953-L956))
- A medium finding alone is `safe`. The rule `python_subprocess` is medium severity.
  (source: [`skills_guard.py` L384–L385](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/skills_guard.py#L384-L385),
  [`plugin_guard.py` L383–L391](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/plugin_guard.py#L383-L391))
- `scan_plugin` over `plugins/model-router-hermes` gave the verdict `safe` with one finding: `python_subprocess`, severity medium, category execution, at `node.py` line 87.
  (running: Hermes v0.23.0, `tools.plugin_guard.scan_plugin` over the plugin folder, 2026-11-06)
- A probe plugin that shipped a copy of the OpenClaw esbuild bundle (71 KB) gave one medium finding, `python_subprocess`, at the `subprocess.run(` line, and none for the bundle. Its first install attempt was blocked as `dangerous` by a key-shaped literal.
  The rule matches a name containing `secret`, `token`, `api_key` or `password` assigned a quoted value of 20 or more characters. No file of the plugin may hold one outside its `tests/` tree, where the rule caps a finding at medium.
  (running: Hermes v0.22.7, 2026-11-06;
  source: [`threat_patterns.py` L102–L104](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/tools/threat_patterns.py#L102-L104))
- `hermes plugins validate plugins/model-router-hermes` passed with 15 checks marked passed, including `security scan — safe`, and one warning.
  The warning names `hermes_api.py` lines 39, 46, 52, 53 and 61: `hermes_cli.auth.PROVIDER_REGISTRY`, `hermes_cli.auth_plugin_providers.is_refreshable_oauth_provider`, `hermes_cli.left_core_migration.installs_held`, `hermes_cli.runtime_provider.resolve_runtime_provider` and `agent.models_dev.list_provider_models`.
  It says these imports can break on any release. CI runs `validate` on the pinned release and a Renovate rule raises the pin, so a break shows in CI ([Hermes CI](#hermes-ci)). It ends with `Isolation — runs in the plugin host (plugins.isolation: host)` and `Validation passed.`
  (running: Hermes v0.23.0, 2026-11-06)
- The admission lint lists a plugin's imports of private Hermes modules with file and line. It is a warning and never a refusal. The public list holds `agent.delegation_provider`, `agent.delegation_backends`, `agent.secret_scope` and `hermes_constants`, and none of the five modules above.
  (source: [`plugin_validate_private_imports.py` L1–L9](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/plugin_validate_private_imports.py#L1-L9),
  [L27–L68](https://github.com/NousResearch/hermes-agent/blob/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19/hermes_cli/plugin_validate_private_imports.py#L27-L68))
- A probe plugin's `hermes plugins validate` passed with one warning that listed four private core imports, and a note that the plugin runs in the plugin host under `plugins.isolation: host`. `hermes plugins doctor <name>` passed discovery, manifest, import and registration.
  (running: Hermes v0.22.7, 2026-11-06)

### Hermes CI

- The `hermes` job runs the plugin's tests on Python 3.11 and 3.14 with `uv`, runs `hermes plugins validate plugins/model-router-hermes`, installs the plugin from the checkout with `hermes plugins install "file://$PWD#plugins/model-router-hermes" --enable < /dev/null`, checks `hermes plugins list --plain --no-bundled`, sets `delegation.backend` to `model-router` and reads it back, and runs the tests again under Hermes's own interpreter.
  The install clones the checkout's own commit through a `file://` route, as a user's install clones the repository's subfolder.
  Hermes keeps its home under the runner's temp folder, and no key is set.
  (source: `.github/workflows/ci.yml`, job `hermes`)
- The `setup-hermes` action clones the release tag, checks that `HEAD` equals the pinned commit, and runs `uv sync --frozen --no-dev --no-build --python 3.14`, so only the wheels that Hermes's own `uv.lock` locks install. It then checks that `hermes --version` names the tag.
  It pins `v0.23.0` at commit `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`. A Renovate rule raises the tag and the commit together with no age delay.
  (source: `.github/actions/setup-hermes/action.yml`; [CONTRIBUTING.md, Dependencies](../CONTRIBUTING.md#dependencies))
- The tests of the plugin call each handler and the router directly with a fake Hermes API. One test file, `plugins/model-router-hermes/tests/test_real_hermes.py`, runs only under Hermes's interpreter. It calls each Hermes function the shim uses, and compares the default route with Hermes's bundled default backend.
  It also registers the provider with Hermes's delegation registry, builds the `delegate_task` schema, and routes tasks through `resolve_task_routes`, so a pin raise that changes the parameter seam fails CI. Those tests use Hermes's private names `_registry` and `_build_dynamic_schema_overrides`.
  Its catalogue test writes a one-provider `models_dev_cache.json` into a scratch Hermes home, because Hermes ships no catalogue and reads only that disk cache offline.
  (source: `plugins/model-router-hermes/tests/`)

### Hermes gaps

Most probes ran a probe plugin, `probe-router`, and not this repository's plugin.
The probe plugin ran Node on a small script and shipped the OpenClaw bundle for the scanner.
This repository's plugin passed `validate`, the scan and the `file://` install on Hermes v0.23.0, as the facts above record. It routed one real call of two tasks on Hermes v0.22.7, in process and in the plugin host, and one call with task parameters on Hermes v0.23.0, in process. No run used a fallback between providers, and no run with task parameters used the plugin host.
The `hermes` job has not run on a pushed commit yet, so this page cites no run of it.
No run used the repository form `Akurganow/model-router/plugins/model-router-hermes` from the README, a `--ref` pin or `hermes plugins update`.
No run used native Windows, so the `SYSTEMROOT` rule rests on the Python documentation.
No run used a proxy, so the proxy behaviour rests on the Node documentation and on the commit that added the switch.
No run sent two concurrent sessions through one gateway. That they share one budget record follows from the gateway facts above.
No run checked that Hermes clamps a routed effort for a delegated child. The clamp is read from `reasoning_effort.py`.
No live session ran `/model-router-provider`, the settings form in Hermes Desktop or the `model_router_config` tool. Their tests call the handlers directly.
The settings form edits a `dict` slot in a JSON editor, as the documentation says, and no run used it.
