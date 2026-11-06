# How each client loads a package

This page says what each client reads from a package in this repository.
Every fact names its kind: documentation, source read at a commit, or running the client.
A documentation page with no revision is dated by the day it was read.
A running fact names the client version and the command, or cites a GitHub Actions run of this repository on hosted runners.
Install commands and install-time notes are in the [README](../README.md#install).
The reasons built on these facts are in [About this repository's design](design.md).

Three clients are covered: Claude Code, Oh My Pi (omp) and OpenClaw.

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
- omp's extension-package discovery also reads a package's sibling folders `skills/`, `hooks/pre|post/`, `tools/`, `commands/`, `rules/`, `prompts/` and `.mcp.json`.
  So the npm package keeps OpenClaw's skills in `openclaw-skills/`.
  (source: [`omp-plugins.ts` L1–L18](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/discovery/omp-plugins.ts#L1-L18))
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

### omp gaps

No documentation page under `docs/` at the commit named describes the `omp.settings` block.
The settings facts above rest on source at that commit.
[`marketplace.md` L129–L164](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/docs/marketplace.md#L129-L164) lists no `privacyPolicyUrl` entry field.
The [catalogue parser](https://github.com/can1357/oh-my-pi/blob/96e4d8eb5ba1212d2d6018f242de266284cffab9/packages/coding-agent/src/extensibility/plugins/marketplace/fetcher.ts#L123-L215) preserves extra entry fields, but no source read here says what omp does with this one.
The [omp install names](#omp-install-names) facts ran on omp 18.16.0.
CI pins omp 18.12.6 in `evals/omp/package.json`, which `.github/actions/setup-omp/action.yml` installs, and the README asks for that version or later.
The `package` job in `.github/workflows/ci.yml` only installs the unpacked tarball and lists the package, so no run exercises the settings name on omp 18.12.6.
The settings-name facts are unchecked on every omp version from 18.12.6 up to 18.16.0.

## OpenClaw

Documentation is the Markdown under `docs/` in `openclaw/openclaw`, published at docs.openclaw.ai.
Documentation pages below were read on 2026-11-05.
Every source link is a permalink at commit `d48be80a6379`, the commit `openclaw --version` of the 2026.10.10 release prints.
It is two commits after tag `v2026.10.10` (`7dc3350cb9f0`), and the two change only `scripts/lib/update-compat-inventory.json`.
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
  this repository's `src/openclaw.ts` registers only the tool in `tool-discovery` mode;
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
  (documentation: [Tool call policy hooks, Tool call policy](https://docs.openclaw.ai/plugins/hooks/tool-policy#tool-call-policy);
  source: [`tool-policy.md` L74–L76](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/hooks/tool-policy.md#L74-L76))
- `hooks.timeouts.<hookName>` overrides `hooks.timeoutMs`, which overrides the plugin's `timeoutMs`.
  Both operator fields take positive integers up to 600000 ms.
  (documentation: [Hook reference, Registration and execution](https://docs.openclaw.ai/plugins/hooks/reference#registration-and-execution);
  source: [`reference.md` L53–L76](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/hooks/reference.md#L53-L76))
- A `before_tool_call` handler gets 15 seconds by default, and a thrown error or a timeout blocks the tool call.
  (documentation: [Hook reference, Registration and execution](https://docs.openclaw.ai/plugins/hooks/reference#registration-and-execution);
  source: [`reference.md` L93](https://github.com/openclaw/openclaw/blob/d48be80a63791215ff337596cf93f0cb5b80a233/docs/plugins/hooks/reference.md#L93))
- A hook timeout does not abort the handler.
  (documentation: [Hook reference, Registration and execution](https://docs.openclaw.ai/plugins/hooks/reference#registration-and-execution))
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
Five paths start a subagent without that tool. [Paths the hook never sees](../plugins/model-router-openclaw/README.md#paths-the-hook-never-sees) lists them.
No source read here lists every such path.
No run covers a sandboxed child with a CLI-backend model, or an `outputSchema` spawn on a model without tools.
The sandbox rule for CLI backends and the collector child's need for tools rest on the documentation cited above.
The source check of the workspace `.env` list left out variables that an installed provider plugin adds.
OpenClaw may drop `TYPESAFE_API_KEY` when such a plugin declares it.
