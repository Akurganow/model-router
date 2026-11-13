import type { Level, Part, Probabilities } from "../../src/core/part.ts";
import { tier as tierPart } from "../../src/core/tier.ts";
import { work as workPart } from "../../src/core/work.ts";
import type { Pick, Row, Rule } from "../compare-rules.ts";

export type Thresholds = { down: number; up: number };
export type Mode = "absolute" | "ratio";
export type Target = "agreement" | "cap";
type Sample = { p: Probabilities; want: Level };

const HUNDRED = 100;
const NEVER_ABSOLUTE = 1.01;
// 2^(k/4) from 1/4 to 16, plus Infinity for "never move".
const FACTORS = [
	...Array.from({ length: 25 }, (_, i) => 2 ** ((i - 8) / 4)),
	Number.POSITIVE_INFINITY,
];
const FRACTIONS = Array.from({ length: 102 }, (_, i) =>
	Math.min(i / HUNDRED, NEVER_ABSOLUTE),
);

// Stay at the middle. An end fires on its own bar. When both fire, the larger probability wins.
export function decide(mode: Mode, t: Thresholds, p: Probabilities): Level {
	const fires = (end: number, x: number) =>
		mode === "absolute" ? end >= x : end > x * p[1];
	const down = fires(p[0], t.down);
	const up = fires(p[2], t.up);
	if (down && up) return p[0] > p[2] ? 0 : p[2] > p[0] ? 2 : 1;
	return down ? 0 : up ? 2 : 1;
}

type Candidate = {
	t: Thresholds;
	agree: number;
	under: number;
	cost: number;
};

function candidate(
	mode: Mode,
	t: Thresholds,
	samples: readonly Sample[],
): Candidate {
	const c = { t, agree: 0, under: 0, cost: 0 };
	for (const { p, want } of samples) {
		const got = decide(mode, t, p);
		c.agree += got === want ? 1 : 0;
		c.under += got < want ? 1 : 0;
		c.cost += got;
	}
	return c;
}

const middle = (xs: readonly number[]): number =>
	[...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 1;

// agreement: most agreement, then least under-routing.
// cap: lowest summed level while under-routing stays at or below the baseline's, then most agreement.
// A plateau of equal candidates yields its componentwise median.
export function fitThresholds(
	mode: Mode,
	target: Target,
	samples: readonly Sample[],
	baseline: Pick,
): Thresholds {
	const grid = mode === "absolute" ? FRACTIONS : FACTORS;
	const limit = samples.filter((s) => baseline(s.p) < s.want).length;
	const key = (c: Candidate) =>
		target === "agreement" ? [-c.agree, c.under] : [c.cost, -c.agree];
	const feasible = grid
		.flatMap((down) => grid.map((up) => candidate(mode, { down, up }, samples)))
		.filter((c) => target === "agreement" || c.under <= limit);
	const order = (a: Candidate, b: Candidate) => {
		const [ka, kb] = [key(a), key(b)];
		return (ka[0] ?? 0) - (kb[0] ?? 0) || (ka[1] ?? 0) - (kb[1] ?? 0);
	};
	const best = feasible.reduce((a, b) => (order(a, b) > 0 ? b : a));
	const tied = feasible.filter((c) => order(c, best) === 0);
	return {
		down: middle(tied.map((c) => c.t.down)),
		up: middle(tied.map((c) => c.t.up)),
	};
}

export type Fit = { tier: Thresholds; work: Thresholds };

export function fitBoth(
	mode: Mode,
	target: Target,
	train: readonly Row[],
): Fit {
	const part = (
		probs: (r: Row) => Probabilities,
		want: (r: Row) => Level,
		base: Part,
	) =>
		fitThresholds(
			mode,
			target,
			train.map((r) => ({ p: probs(r), want: want(r) })),
			base.pick,
		);
	return {
		tier: part(
			(r) => r.tier,
			(r) => r.expected,
			tierPart,
		),
		work: part(
			(r) => r.workProbabilities,
			(r) => r.work,
			workPart,
		),
	};
}

export function makeRule(mode: Mode, target: Target, name: string): Rule {
	return {
		name,
		fit: (train) => {
			const f = fitBoth(mode, target, train);
			return {
				tier: (p) => decide(mode, f.tier, p),
				work: (p) => decide(mode, f.work, p),
			};
		},
	};
}
