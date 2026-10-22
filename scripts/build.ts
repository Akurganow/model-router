import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

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

if (import.meta.main) {
	const problems = [
		...(await buildBundle(
			"claude",
			"src/claude.ts",
			"plugins/model-router/hooks/register.js",
		)),
		...(await buildBundle(
			"omp",
			"src/omp.ts",
			"plugins/model-router-omp/extension/index.js",
		)),
	];
	for (const problem of problems) console.error(problem);
	process.exitCode = problems.length === 0 ? 0 : 1;
}
