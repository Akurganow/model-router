import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BuildOptions, build } from "esbuild";
import { errorText } from "#utils/error.ts";
import { renderClaude } from "./build/claude.ts";
import { copyNpmFiles } from "./build/copies.ts";
import { renderHermes } from "./build/hermes.ts";
import { formatRendered, type Rendered } from "./build/json.ts";
import { renderNpm } from "./build/npm.ts";
import { renderOmp } from "./build/omp.ts";
import { renderOpenclaw } from "./build/openclaw.ts";
import {
	CLAUDE_OUTPUTS,
	HERMES_OUTPUTS,
	OMP_OUTPUTS,
	OPENCLAW_OUTPUTS,
	README_OUTPUT,
} from "./build/outputs.ts";
import { renderReadme } from "./build/readme.ts";
import { loadSource, type Source } from "./build/source.ts";
import type { Harness } from "./build/values.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MAX_BUNDLE_BYTES = 1048576;
const TIMER_NAMES = ["setTimeout", "clearTimeout"];

// The OpenClaw and Hermes bundles keep no module external except the node: built-ins, which esbuild leaves alone on the node platform.
const HOST_OPTIONS: Readonly<Record<Harness, BuildOptions>> = {
	claude: { platform: "neutral" },
	omp: { platform: "node", external: ["@oh-my-pi/*"] },
	openclaw: { platform: "node" },
	hermes: { platform: "node" },
};

/**
 * Bundles one harness entry to `out` and returns its problems: the Claude Code
 * shape checks and the size limit. The Claude Code hooks module has no timer
 * globals; the core waits on the clock its caller passes.
 */
export async function buildBundle(
	harness: Harness,
	entry: string,
	out: string,
): Promise<string[]> {
	await build({
		absWorkingDir: ROOT,
		entryPoints: [entry],
		outfile: out,
		bundle: true,
		format: "esm",
		minify: false,
		write: true,
		// Keeps the bundle comments free of the real path behind a symlinked node_modules.
		preserveSymlinks: true,
		logLevel: "warning",
		define: {
			MODEL_ROUTER_VERSION: JSON.stringify(loadSource(ROOT).version),
		},
		...HOST_OPTIONS[harness],
	});
	const code = readFileSync(out, "utf8");
	const problems = harness === "claude" ? checkClaudeBundle(code) : [];
	if (Buffer.byteLength(code) >= MAX_BUNDLE_BYTES)
		problems.push(
			`${out} is ${Buffer.byteLength(code)} bytes, over the ${MAX_BUNDLE_BYTES} limit`,
		);
	return problems;
}

/**
 * Lists why a Claude Code bundle would not load as a hooks module: no top-level
 * `function register(`, no final `export { register }`, or a free timer global,
 * which the hooks module does not have.
 */
export function checkClaudeBundle(code: string): string[] {
	const problems: string[] = [];
	if (!/^function register\(/m.test(code))
		problems.push(
			"the bundle must declare `function register(` at top level; an arrow or var form is not accepted",
		);
	if (!/export \{\s*register\s*\};?\s*$/.test(code))
		problems.push("the bundle must end with `export { register }`");
	// A property access such as `globalThis.setTimeout` is no free reference.
	for (const name of TIMER_NAMES)
		if (new RegExp(`(?<![.\\w$])${name}\\b`).test(code))
			problems.push(
				`the bundle uses a free ${name}; the hooks module has no timer globals, so wait on $.clock or on the clock the caller passes`,
			);
	return problems;
}

export const BUNDLES: readonly {
	harness: Harness;
	entry: string;
	out: string;
}[] = [
	{
		harness: "claude",
		entry: "src/adapters/claude/index.ts",
		out: CLAUDE_OUTPUTS.bundle,
	},
	{
		harness: "omp",
		entry: "src/adapters/omp/index.ts",
		out: OMP_OUTPUTS.bundle,
	},
	{
		harness: "openclaw",
		entry: "src/adapters/openclaw/index.ts",
		out: OPENCLAW_OUTPUTS.bundle,
	},
	{
		harness: "openclaw",
		entry: "src/adapters/openclaw/setup.ts",
		out: OPENCLAW_OUTPUTS.setup,
	},
	{
		harness: "hermes",
		entry: "src/adapters/hermes/index.ts",
		out: HERMES_OUTPUTS.bundle,
	},
];

export const renderMetadata = (source: Source): Rendered[] => [
	...renderClaude(source),
	...renderOmp(source),
	...renderOpenclaw(source),
	...renderHermes(source),
	...renderNpm(source),
];

/**
 * Writes the rendered JSON files and the README install region from the
 * validated source. Throws when the source fails its schema.
 */
function writeMetadata(root: string): void {
	const source = loadSource(root);
	for (const { path, text } of renderMetadata(source)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), formatRendered(path, text, root));
	}
	const readme = join(root, README_OUTPUT);
	writeFileSync(readme, renderReadme(readFileSync(readme, "utf8"), source));
}

/**
 * Builds every generated file and returns the problems. A source error stops
 * the run before the bundles are built.
 */
async function main(): Promise<string[]> {
	try {
		writeMetadata(ROOT);
	} catch (error) {
		return [errorText(error)];
	}
	const problems: string[] = [];
	for (const { harness, entry, out } of BUNDLES)
		problems.push(...(await buildBundle(harness, entry, out)));
	// The tree copies the bundles, so they come first.
	if (problems.length === 0) copyNpmFiles(ROOT);
	return problems;
}

if (import.meta.main) {
	const problems = await main();
	for (const problem of problems) console.error(problem);
	process.exitCode = problems.length === 0 ? 0 : 1;
}
