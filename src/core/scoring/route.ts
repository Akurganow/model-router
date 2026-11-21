import { FAILED, failedAttemptText, KEY_UNSET } from "#core/output/reasons.ts";
import type { Level, Probabilities } from "#core/parts/part.ts";
import type { Attempt, KeyHolder } from "#core/providers/provider.ts";
import { type AskInput, ask, type Reply } from "./ask.ts";
import { fallsBack, isFailure, skipText } from "./failure.ts";
import { abortCategory } from "./limit.ts";
import type { Usage } from "./reply.ts";

type FailedAttempt = {
	readonly holder: KeyHolder;
	readonly reason: string;
};
export type Decision = {
	readonly parts: Readonly<
		Record<string, { level: Level; probabilities: Probabilities }>
	>;
	// The key holder that answered.
	readonly holder: KeyHolder;
	// The model the reply names, cleaned; empty when it names none.
	readonly model: string;
	readonly usage: Usage | undefined;
	// The first failed attempt, set only when the answer came after a fallback.
	readonly firstFailed?: FailedAttempt;
};
export type Skipped = { readonly skipped: string };
export type RouteInput = AskInput & {
	readonly attempts: readonly Attempt[];
	readonly onFallback?: (holder: KeyHolder) => void;
};

/**
 * Asks the attempts in order and returns the first decision whose parts all
 * parse. Returns a key-unset skip when there are no attempts, and a skip naming
 * each failed key holder when none succeeds. A failed attempt falls to the next
 * one only when fallsBack allows it, and a bad reply ends the loop. One signal
 * covers every attempt, so the routing limit also ends a fallback. A failed attempt never throws out of it.
 */
export async function route(input: RouteInput): Promise<Decision | Skipped> {
	const { attempts, signal } = input;
	if (attempts.length === 0) return { skipped: KEY_UNSET };
	const failed: FailedAttempt[] = [];
	for (const [i, attempt] of attempts.entries()) {
		const result = await ask(input, attempt);
		if (isFailure(result)) {
			failed.push({
				holder: attempt.holder,
				reason: skipText(result, abortCategory(signal)),
			});
			if (!fallsBack(result)) break;
			if (i < attempts.length - 1) input.onFallback?.(attempt.holder);
			continue;
		}
		const decision = toDecision(result, attempt.holder);
		const [first] = failed;
		return first ? { ...decision, firstFailed: first } : decision;
	}
	return skip(failed);
}

// A one-attempt skip keeps the bare reason; two attempts name each key holder in order.
function skip(failed: readonly FailedAttempt[]): Skipped {
	const [first, ...rest] = failed;
	if (!first || rest.length === 0) return { skipped: first?.reason ?? FAILED };
	return { skipped: failed.map(failedAttemptText).join(", ") };
}

function toDecision(
	{ answers, model, usage }: Reply,
	holder: KeyHolder,
): Decision {
	const parts: Record<string, { level: Level; probabilities: Probabilities }> =
		{};
	for (const [part, probabilities] of answers)
		parts[part.key] = { level: part.pick(probabilities), probabilities };
	return { parts, holder, model, usage };
}
