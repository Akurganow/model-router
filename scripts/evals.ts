import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ADAPTERS } from "./evals/adapters.ts";
import { loadCases } from "./evals/cases.ts";
import { missingKeys, runCase } from "./evals/run.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CASES_PATH = join(ROOT, "evals", "cases.json");
const USAGE = `usage:
  node scripts/evals.ts run [--client NAME]... [--cases FILE] [--out DIR]`;

function runMode(args: string[]): number {
	const { values } = parseArgs({
		args,
		options: {
			client: { type: "string", multiple: true },
			cases: { type: "string", default: CASES_PATH },
			out: { type: "string", default: "evals-results" },
		},
	});
	const wanted = values.client ?? Object.keys(ADAPTERS);
	const cases = loadCases(values.cases).filter((c) =>
		wanted.includes(c.client),
	);
	if (cases.length === 0) {
		console.error(`no case for ${wanted.join(", ")}`);
		return 2;
	}
	const missing = cases.flatMap((c) => missingKeys(c, process.env));
	if (missing.length > 0) {
		console.error(`unset: ${[...new Set(missing)].join(", ")}`);
		return 2;
	}
	mkdirSync(values.out, { recursive: true });
	let failed = 0;
	for (const c of cases) {
		const result = runCase(c);
		writeFileSync(
			join(values.out, `${c.id}.json`),
			`${JSON.stringify(result, null, 2)}\n`,
		);
		console.log(
			`${c.id}: ${result.passed ? "pass" : `FAIL ${result.failures.join("; ")}`}`,
		);
		if (!result.passed) failed++;
	}
	return failed === 0 ? 0 : 1;
}

if (import.meta.main) {
	const [mode, ...rest] = process.argv.slice(2);
	const modes: Record<string, (args: string[]) => number> = {
		run: runMode,
	};
	const handler = mode ? modes[mode] : undefined;
	if (!handler) {
		console.error(USAGE);
		process.exit(2);
	}
	process.exit(handler(rest));
}
