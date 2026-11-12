import { readFileSync } from "node:fs";
import type { Level, Probabilities } from "../../src/core/part.ts";
import { tier } from "../../src/core/tier.ts";
import { work } from "../../src/core/work.ts";
import { readRows } from "../compare-rules.ts";
import {
	decide,
	type Fit,
	fitBoth,
	type Mode,
	type Target,
	type Thresholds,
} from "./threshold.ts";

// usage: node scripts/rules/doubt.ts <record.jsonl>
// Prints the thresholds fitted on each fold and the share of held-out cases whose end probability sits within 0.05 of its bar.
const FOLDS = 5;
const BAND = 0.05;
const EPSILON = 1e-9;
const PERCENT = 100;
const RULES: readonly [string, Mode, Target][] = [
	["threshold-agree", "absolute", "agreement"],
	["threshold-cap", "absolute", "cap"],
	["ratio-agree", "ratio", "agreement"],
	["ratio-cap", "ratio", "cap"],
];

type Pick = (p: Probabilities) => Level;

// A case is in doubt when moving one end probability by the band changes its pick.
const doubtful = (pick: Pick, p: Probabilities): boolean =>
	([0, 2] as const).some((end) =>
		[BAND + EPSILON, -(BAND + EPSILON)].some(
			(d) => pick({ ...p, [end]: p[end] + d }) !== pick(p),
		),
	);

const fmt = (t: Thresholds) => `${t.down.toFixed(2)}/${t.up.toFixed(2)}`;

const rows = readRows(
	readFileSync(process.argv[2] ?? "", "utf8"),
	readFileSync(new URL("../../calibration.jsonl", import.meta.url), "utf8"),
);
const rate = (n: number) => `${((n / rows.length) * PERCENT).toFixed(1)}%`;
const doubtOf = (
	tierPick: (i: number) => Pick,
	workPick: (i: number) => Pick,
) => ({
	tier: rows.filter((r, i) => doubtful(tierPick(i), r.tier)).length,
	work: rows.filter((r, i) => doubtful(workPick(i), r.workProbabilities))
		.length,
});

const base = doubtOf(
	() => tier.pick,
	() => work.pick,
);
console.log(`current doubt tier ${rate(base.tier)}, work ${rate(base.work)}`);

for (const [name, mode, target] of RULES) {
	const fits: Fit[] = Array.from({ length: FOLDS }, (_, f) =>
		fitBoth(
			mode,
			target,
			rows.filter((_, i) => i % FOLDS !== f),
		),
	);
	const d = doubtOf(
		(i) => (p) => decide(mode, fits[i % FOLDS]?.tier ?? { down: 1, up: 1 }, p),
		(i) => (p) => decide(mode, fits[i % FOLDS]?.work ?? { down: 1, up: 1 }, p),
	);
	console.log(
		`${name} doubt tier ${rate(d.tier)}, work ${rate(d.work)}; down/up per fold tier ${fits.map((f) => fmt(f.tier)).join(" ")} work ${fits.map((f) => fmt(f.work)).join(" ")}`,
	);
}
