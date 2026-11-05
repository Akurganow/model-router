import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BuildOptions, build } from "esbuild";
import { renderClaude } from "./build/claude.ts";
import { copyNpmFiles } from "./build/copies.ts";
import { formatRendered, type Rendered } from "./build/json.ts";
import { renderNpm } from "./build/npm.ts";
import { renderOmp } from "./build/omp.ts";
import { renderOpenclaw } from "./build/openclaw.ts";
import {
	CLAUDE_OUTPUTS,
	OMP_OUTPUTS,
	OPENCLAW_OUTPUTS,
	README_OUTPUT,
} from "./build/outputs.ts";
import { renderReadme } from "./build/readme.ts";
import { loadSource, type Source } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TIMERS = "src/timers.ts";
export const MAX_BUNDLE_BYTES = 1048576;
const TIMER_NAMES = ["setTimeout", "clearTimeout"];

type Harness = "claude" | "omp" | "openclaw";

// The Claude Code hooks module has no timer globals, so the shim rebinds the free names to $.clock.after.
// OpenClaw's bundle keeps no module external except the node: built-ins, which esbuild leaves alone on the node platform.
const HOST_OPTIONS: Readonly<Record<Harness, BuildOptions>> = {
	claude: { platform: "neutral", inject: [TIMERS] },
	omp: { platform: "node", external: ["@oh-my-pi/*"] },
	openclaw: { platform: "node" },
};

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

export function checkClaudeBundle(code: string): string[] {
	const problems: string[] = [];
	if (!/^function register\(/m.test(code))
		problems.push(
			"the bundle must declare `function register(` at top level; an arrow or var form is not accepted",
		);
	if (!/export \{\s*register\s*\};?\s*$/.test(code))
		problems.push("the bundle must end with `export { register }`");
	// The shim declares both names at top level, so a reference without that declaration is a free global.
	for (const name of TIMER_NAMES) {
		const referenced = new RegExp(`(?<![.\\w$])${name}\\b`).test(code);
		const declared = new RegExp(`^function ${name}\\(`, "m").test(code);
		if (referenced && !declared)
			problems.push(
				`the bundle uses a free ${name}; the inject of ${TIMERS} did not bind it`,
			);
	}
	return problems;
}

export const BUNDLES: readonly {
	harness: Harness;
	entry: string;
	out: string;
}[] = [
	{
		harness: "claude",
		entry: "src/claude.ts",
		out: CLAUDE_OUTPUTS.bundle,
	},
	{
		harness: "omp",
		entry: "src/omp.ts",
		out: OMP_OUTPUTS.bundle,
	},
	{
		harness: "openclaw",
		entry: "src/openclaw.ts",
		out: OPENCLAW_OUTPUTS.bundle,
	},
];

export const renderMetadata = (source: Source): Rendered[] => [
	...renderClaude(source),
	...renderOmp(source),
	...renderOpenclaw(source),
	...renderNpm(source),
];

function writeMetadata(root: string): void {
	const source = loadSource(root);
	for (const { path, text } of renderMetadata(source)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), formatRendered(path, text, root));
	}
	const readme = join(root, README_OUTPUT);
	writeFileSync(readme, renderReadme(readFileSync(readme, "utf8"), source));
}

async function main(): Promise<string[]> {
	try {
		writeMetadata(ROOT);
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)];
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
