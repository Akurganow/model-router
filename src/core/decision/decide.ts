import { decisionSuffix, formatProbability } from "#core/output/line.ts";
import { BAD_REPLY } from "#core/output/reasons.ts";
import type { Level } from "#core/parts/part.ts";
import { tier } from "#core/parts/tier.ts";
import { work } from "#core/parts/work.ts";
import {
	type Decision,
	type RouteInput,
	route,
	type Skipped,
} from "#core/scoring/route.ts";

export type DecidedWithWork = {
	readonly tier: Level;
	readonly work: Level;
	readonly probabilities: string;
	readonly suffix: string;
};

const BAD: Skipped = { skipped: BAD_REPLY };

/**
 * Returns the level and the formatted probability of the keyed part, or
 * undefined when the decision lacks that part. Never throws.
 */
const levelOf = (
	decision: Decision,
	key: string,
): { level: Level; probability: string } | undefined => {
	const part = decision.parts[key];
	return (
		part && {
			level: part.level,
			probability: formatProbability(part.probabilities[part.level]),
		}
	);
};

/**
 * Returns the skip unchanged when the decision is a skip, and a bad-reply skip
 * when the tier part or the work part is missing. Returns both levels with the
 * joined probabilities and the suffix otherwise. Never throws.
 */
export function decide(
	decision: Decision | Skipped,
	tierKey: string,
	workKey: string,
): DecidedWithWork | Skipped {
	if ("skipped" in decision) return decision;
	const tier = levelOf(decision, tierKey);
	if (!tier) return BAD;
	const work = levelOf(decision, workKey);
	if (!work) return BAD;
	return {
		tier: tier.level,
		work: work.level,
		probabilities: `${tier.probability}/${work.probability}`,
		suffix: decisionSuffix({
			holder: decision.holder,
			model: decision.model,
			inputTokens: decision.usage?.input_tokens,
			outputTokens: decision.usage?.output_tokens,
			failed: decision.firstFailed,
		}),
	};
}

/**
 * Asks Jev once for the tier and work parts and reads both levels from the
 * reply. Returns the skip when the call skips or the reply lacks a part.
 * Rejects as route does.
 */
export async function scoreWork(
	input: Omit<RouteInput, "parts">,
): Promise<DecidedWithWork | Skipped> {
	const decision = await route({ ...input, parts: [tier, work] });
	return decide(decision, tier.key, work.key);
}
