import { type JsonObject, type Rendered, serialize } from "./json.ts";
import { ompSettings } from "./omp.ts";
import {
	NPM_FILE_COPIES,
	NPM_FOLDER_COPIES,
	NPM_OUTPUTS,
	NPM_ROOT,
	OMP_DIR,
	OPENCLAW_DIR,
} from "./outputs.ts";
import type { Source } from "./source.ts";

const GIT_PREFIX = "git+";
const GIT_SUFFIX = ".git";

// npm always packs these, so the files list leaves them out.
const ALWAYS_PACKED = ["package.json", "README.md", "LICENSE"];

/**
 * Lists the top-level entries of the npm tree that the copies fill, in copy
 * order. Files that npm always packs stay out of the list.
 */
const filesList = (): string[] => [
	...new Set(
		[...NPM_FILE_COPIES, ...NPM_FOLDER_COPIES]
			.map(({ to }) => to.slice(NPM_ROOT.length + 1).split("/")[0] ?? "")
			.filter((name) => !ALWAYS_PACKED.includes(name)),
	),
];

// package.json docs of npm: `repository` as an object with `directory` for a package in a subfolder.
const repository = (source: Source): JsonObject => ({
	type: "git",
	url: `${GIT_PREFIX}${source.repository}${GIT_SUFFIX}`,
	directory: NPM_ROOT,
});

// docs/plugins/manifest/package-json.md of OpenClaw 2026.10.10: `compat.pluginApi` and `install.minHostVersion` are semver floors, `build.openclawVersion` the version built against.
const openclawBlock = (source: Source): JsonObject => ({
	extensions: [...source.openclaw.extensions],
	compat: { pluginApi: `>=${source.openclaw.hostFloor}` },
	build: { openclawVersion: source.openclaw.hostFloor },
	install: {
		npmSpec: source.npm.name,
		minHostVersion: `>=${source.openclaw.hostFloor}`,
	},
});

const manifest = (source: Source): JsonObject => ({
	name: source.npm.name,
	version: source.version,
	private: source.npm.private,
	type: source.npm.type,
	description: source.npm.description,
	license: source.license,
	homepage: source.homepage,
	repository: repository(source),
	keywords: [...source.npm.keywords],
	publishConfig: { ...source.npm.publishConfig },
	files: filesList(),
	omp: {
		extensions: [...source.omp.package.extensions],
		settings: ompSettings(source),
	},
	openclaw: openclawBlock(source),
});

const readmeUrl = (source: Source, dir: string): string =>
	`${source.homepage}/blob/main/${dir}/README.md`;

const readme = (source: Source): string =>
	[
		`# ${source.npm.name}`,
		"",
		source.npm.description,
		"",
		"The package carries the Model Router plugin for two harnesses. The README of each plugin has its install steps and settings. Its privacy policy says what leaves the machine.",
		"",
		`- ${source.openclaw.install.heading}: [README](${readmeUrl(source, OPENCLAW_DIR)}), [privacy policy](${source.privacyPolicyUrls.openclaw})`,
		`- ${source.omp.install.heading}: [README](${readmeUrl(source, OMP_DIR)}), [privacy policy](${source.privacyPolicyUrls.omp})`,
		"",
		`The source is at ${source.repository}. The licence is ${source.license}.`,
		"",
	].join("\n");

export const renderNpm = (source: Source): Rendered[] => [
	{ path: NPM_OUTPUTS.manifest, text: serialize(manifest(source)) },
	{ path: NPM_OUTPUTS.readme, text: readme(source) },
];
