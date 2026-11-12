import {
	type Decision,
	decisionSuffix,
	type RouteInput,
	route,
	type Skipped,
} from "./compose.ts";
import { work } from "./effort.ts";
import { tier } from "./model.ts";
import { formatProbability, type Level } from "./part.ts";
import { BAD_REPLY } from "./reasons.ts";

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
		suffix: decisionSuffix(decision),
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
