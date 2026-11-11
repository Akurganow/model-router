import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { LEVELS, type Level, type Probabilities } from "../src/part.ts";
import { EXIT_USAGE } from "./exit-codes.ts";
import { fitWarnings } from "./jev-fit.ts";

const FOLDS = 5;
const PERCENT = 100;
const USAGE =
	"usage: node scripts/compare-rules.ts <record.jsonl> <rule.ts>...  (record.jsonl comes from calibrate.ts --record; each rule module default-exports a Rule)";

export type Row = {
	description: string;
	expected: Level;
	work: Level;
	tier: Probabilities;
	workProbabilities: Probabilities;
	contested: readonly string[];
	// The model Jev answered as; a record from before calibrate.ts wrote it has none.
	model?: string;
};
export type Pick = (p: Probabilities) => Level;
// A rule may fit its parameters on the training rows; a fixed rule ignores them.
export type Rule = {
	name: string;
	fit: (train: readonly Row[]) => { tier: Pick; work: Pick };
};
export type Score = {
	agreement: number;
	uncontested: number;
	under: number;
	over: number;
	recall: readonly [number, number, number];
	share: readonly [number, number, number];
	confusion: readonly (readonly number[])[];
};

const PARTS = [
	{ key: "tier", label: "expected", probs: "tier" },
	{ key: "work", label: "work", probs: "workProbabilities" },
] as const;

export function readRows(record: string, calibration: string): Row[] {
	const lines = (text: string) =>
		text
			.split("\n")
			.filter((l) => l.trim() !== "")
			.map((l) => JSON.parse(l));
	const cases = lines(calibration);
	const rows = lines(record);
	if (rows.length !== cases.length)
		throw new Error(
			`the record has ${rows.length} rows and calibration.jsonl ${cases.length} cases: record again`,
		);
	return rows.map((r, i) => {
		if (r.description !== cases[i].description)
			throw new Error(
				`record row ${i + 1} is "${r.description}" and calibration.jsonl has "${cases[i].description}": record again`,
			);
		return { ...r, contested: cases[i].contested ?? [] };
	});
}

export function score(
	rows: readonly Row[],
	picked: readonly Level[],
	part: (typeof PARTS)[number],
): Score {
	const pairs = rows.map((r, i) => ({
		want: r[part.label],
		got: picked[i] ?? 1,
		contested: r.contested.includes(part.label),
	}));
	const count = (f: (p: (typeof pairs)[number]) => boolean) =>
		pairs.filter(f).length;
	const of = (a: number, b: number) => (b === 0 ? 0 : a / b);
	const n = pairs.length;
	const clear = pairs.filter((p) => !p.contested);
	const per = (f: (l: Level) => number) => [f(0), f(1), f(2)] as const;
	return {
		agreement: of(
			count((p) => p.got === p.want),
			n,
		),
		uncontested: of(clear.filter((p) => p.got === p.want).length, clear.length),
		under: of(
			count((p) => p.got < p.want),
			n,
		),
		over: of(
			count((p) => p.got > p.want),
			n,
		),
		recall: per((l) =>
			of(
				count((p) => p.want === l && p.got === l),
				count((p) => p.want === l),
			),
		),
		share: per((l) =>
			of(
				count((p) => p.got === l),
				n,
			),
		),
		confusion: LEVELS.map((w) =>
			LEVELS.map((g) => count((p) => p.want === w && p.got === g)),
		),
	};
}

// Held-out picks: each row is picked by the rule fitted on the other folds.
export function crossValidate(
	rule: Rule,
	rows: readonly Row[],
): { tier: Level[]; work: Level[] } {
	const out = { tier: [] as Level[], work: [] as Level[] };
	for (let f = 0; f < FOLDS; f++) {
		const train = rows.filter((_, i) => i % FOLDS !== f);
		const fitted = rule.fit(train);
		rows.forEach((r, i) => {
			if (i % FOLDS !== f) return;
			out.tier[i] = fitted.tier(r.tier);
			out.work[i] = fitted.work(r.workProbabilities);
		});
	}
	return out;
}

const pct = (x: number) => `${(x * PERCENT).toFixed(0)}%`;

export function report(rule: Rule, rows: readonly Row[]): string {
	const held = crossValidate(rule, rows);
	return PARTS.map((part) => {
		const s = score(rows, held[part.key], part);
		return `${rule.name} ${part.key}: agreement ${pct(s.agreement)} (uncontested ${pct(s.uncontested)}), under ${pct(s.under)}, over ${pct(s.over)}, recall ${s.recall.map(pct).join("/")}, picked ${s.share.map(pct).join("/")}, confusion ${JSON.stringify(s.confusion)}`;
	}).join("\n");
}

export async function main(args: readonly string[]): Promise<number> {
	const [record, ...rules] = args;
	if (!record || rules.length === 0) {
		console.error(USAGE);
		return EXIT_USAGE;
	}
	const rows = readRows(
		readFileSync(record, "utf8"),
		readFileSync(new URL("../calibration.jsonl", import.meta.url), "utf8"),
	);
	for (const warning of fitWarnings(rows.map((r) => r.model)))
		console.error(warning);
	for (const path of rules) {
		const rule: Rule | undefined = (await import(pathToFileURL(path).href))
			.default;
		if (typeof rule?.fit !== "function") {
			console.error(`${path} does not default-export a Rule`);
			return EXIT_USAGE;
		}
		console.log(report(rule, rows));
	}
	return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
