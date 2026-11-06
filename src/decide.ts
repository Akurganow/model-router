import { type Decision, decisionSuffix, type Skipped } from "./compose.ts";
import { formatProbability, type Level } from "./part.ts";

export type Decided = {
	readonly tier: Level;
	readonly probabilities: string;
	readonly suffix: string;
};
export type DecidedWithWork = Decided & { readonly work: Level };

const BAD_REPLY: Skipped = { skipped: "bad reply" };

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
 * Reads the levels of the asked parts from a decision. A part the reply lacks makes the whole reply bad.
 */
export function decide(
	decision: Decision | Skipped,
	tierKey: string,
): Decided | Skipped;
export function decide(
	decision: Decision | Skipped,
	tierKey: string,
	workKey: string,
): DecidedWithWork | Skipped;
export function decide(
	decision: Decision | Skipped,
	tierKey: string,
	workKey?: string,
): Decided | DecidedWithWork | Skipped {
	if ("skipped" in decision) return decision;
	const tier = levelOf(decision, tierKey);
	if (!tier) return BAD_REPLY;
	const suffix = decisionSuffix(decision);
	if (workKey === undefined)
		return { tier: tier.level, probabilities: tier.probability, suffix };
	const work = levelOf(decision, workKey);
	if (!work) return BAD_REPLY;
	return {
		tier: tier.level,
		work: work.level,
		probabilities: `${tier.probability}/${work.probability}`,
		suffix,
	};
}
