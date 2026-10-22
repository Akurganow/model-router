import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ADAPTERS } from "./evals/adapters.ts";
import { loadCases } from "./evals/cases.ts";
import { JSON_INDENT, missingKeys, runCase } from "./evals/run.ts";
import { EXIT_USAGE } from "./exit-codes.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CASES_PATH = join(ROOT, "evals", "cases.json");
const USAGE = `usage:
  node scripts/evals.ts run [--client NAME]... [--cases FILE] [--out DIR]`;

type Run = typeof runCase;

function runMode(args: string[], run: Run): number {
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
		return EXIT_USAGE;
	}
	const missing = cases.flatMap((c) => missingKeys(c, process.env));
	if (missing.length > 0) {
		console.error(`unset: ${[...new Set(missing)].join(", ")}`);
		return EXIT_USAGE;
	}
	mkdirSync(values.out, { recursive: true });
	let failed = 0;
	for (const c of cases) {
		const result = run(c);
		writeFileSync(
			join(values.out, `${c.id}.json`),
			`${JSON.stringify(result, null, JSON_INDENT)}\n`,
		);
		console.log(
			`${c.id}: ${result.passed ? "pass" : `FAIL ${result.failures.join("; ")}`}`,
		);
		if (!result.passed) failed++;
	}
	return failed === 0 ? 0 : 1;
}

export function main(argv: string[], run: Run = runCase): number {
	const [mode, ...rest] = argv;
	if (mode !== "run") {
		console.error(USAGE);
		return EXIT_USAGE;
	}
	return runMode(rest, run);
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
