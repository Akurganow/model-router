# How each client loads a package

This page says what each client reads from a package in this repository.
Every fact names its kind: documentation, source read at a commit, or running the client.
A documentation page with no revision is dated by the day it was read.
A running fact names the client version and the command, or cites a GitHub Actions run of this repository on hosted runners.
Install commands and install-time notes are in the [README](../README.md#install).
The reasons built on these facts are in [About this repository's design](design.md).

Two clients are covered: Claude Code and Oh My Pi (omp).

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
Every link is a permalink at commit `96e4d8e`, the head of `main` on 2026-11-05.
The evals workflow pins omp 18.12.6 in `evals/omp/package.json`, and the README asks for that version or later.

### omp manifest and settings

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
- Extension modules load when a session starts.
  After an install, `/reload-plugins` refreshes agents, skills and commands, and a restart loads new extension modules.
  (documentation: [`marketplace.md` L80](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L80),
  [`extension-loading.md` L167–L176](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/extension-loading.md#L167-L176))

### omp catalogue

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

### omp gaps

No documentation page under `docs/` at the commit named describes the `omp.settings` block.
The settings facts above rest on source at that commit.
[`marketplace.md` L129–L164](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L129-L164) lists no `privacyPolicyUrl` entry field.
The [catalogue parser](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/marketplace/fetcher.ts#L123-L215) preserves extra entry fields, but no source read here says what omp does with this one.
