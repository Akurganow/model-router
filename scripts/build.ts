import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { renderClaude } from "./build/claude.ts";
import { formatJson, type Rendered } from "./build/json.ts";
import { renderOmp } from "./build/omp.ts";
import { BUNDLE_OUTPUTS } from "./build/outputs.ts";
import { README_PATH, renderReadme } from "./build/readme.ts";
import { loadSource, type Source } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TIMERS = "src/timers.ts";
export const MAX_BUNDLE_BYTES = 1048576;
const TIMER_NAMES = ["setTimeout", "clearTimeout"];

type Harness = "claude" | "omp";

// The Claude Code hooks module has no timer globals, so the shim rebinds the free names to $.clock.after.
export async function buildBundle(
	harness: Harness,
	entry: string,
	out: string,
): Promise<string[]> {
	const claude = harness === "claude";
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
		...(claude
			? { platform: "neutral", inject: [TIMERS] }
			: { platform: "node", external: ["@oh-my-pi/*"] }),
	});
	const code = readFileSync(out, "utf8");
	const problems = claude ? checkClaudeBundle(code) : [];
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
		out: BUNDLE_OUTPUTS.claude,
	},
	{
		harness: "omp",
		entry: "src/omp.ts",
		out: BUNDLE_OUTPUTS.omp,
	},
];

export const renderMetadata = (source: Source): Rendered[] => [
	...renderClaude(source),
	...renderOmp(source),
];

function writeMetadata(root: string): void {
	const source = loadSource(root);
	for (const { path, text } of renderMetadata(source))
		writeFileSync(join(root, path), formatJson(path, text, root));
	const readme = join(root, README_PATH);
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
	return problems;
}

if (import.meta.main) {
	const problems = await main();
	for (const problem of problems) console.error(problem);
	process.exitCode = problems.length === 0 ? 0 : 1;
}
