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
import { installCommands, noteLines } from "./readme.ts";
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

const fence = (commands: readonly string[]): string[] => [
	"```sh",
	...commands,
	"```",
];

const readme = (source: Source): string => {
	const { openclaw, omp } = source;
	return [
		`# ${source.npm.name}`,
		"",
		source.npm.description,
		"",
		"model-router sends a lookup to a small model, bounded work to a middle model and open-ended work to a large one. Where no model is set for one of the three, the harness keeps its own. A decision model scores each task the plugin routes: [Jev](https://docs.typesafe.ai) from TypeSafe by default, or OpenAI's or Google's, on the provider's own API or through OpenRouter.",
		"",
		"## Install",
		"",
		`${openclaw.install.heading}:`,
		"",
		...fence(installCommands(source, openclaw.install)),
		"",
		...noteLines(source, openclaw.install),
		`${omp.install.heading}:`,
		"",
		...fence(installCommands(source, { commands: omp.npmCommands })),
		"",
		`Then follow the setup steps: [${openclaw.install.heading} guide](${readmeUrl(source, OPENCLAW_DIR)}), [${omp.install.heading} guide](${readmeUrl(source, OMP_DIR)}).`,
		"",
		"## What leaves the machine",
		"",
		`Each task the plugin scores sends its condensed text and short texts that describe it and its agent, with token-shaped strings masked. They go to the provider's own API, to OpenRouter or to both, as the \`provider\` and \`gateway\` settings allow. The privacy policies list the request: [${openclaw.install.heading} privacy policy](${source.privacyPolicyUrls.openclaw}), [${omp.install.heading} privacy policy](${source.privacyPolicyUrls.omp}).`,
		"",
		"## More",
		"",
		`The source, and the plugins for Claude Code and Hermes Agent, are at ${source.repository}. The licence is ${source.license}.`,
		"",
	].join("\n");
};

export const renderNpm = (source: Source): Rendered[] => [
	{ path: NPM_OUTPUTS.manifest, text: serialize(manifest(source)) },
	{ path: NPM_OUTPUTS.readme, text: readme(source) },
];
