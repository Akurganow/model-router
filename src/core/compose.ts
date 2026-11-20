import type { Level, Probabilities } from "./part.ts";
import type { Attempt, Provider } from "./provider.ts";
import { CANCELLED, FAILED, KEY_UNSET, TIMEOUT } from "./reasons.ts";
import { type AskInput, ask, type Reply } from "./scoring/ask.ts";
import { fallsBack, isFailure, skipText } from "./scoring/failure.ts";
import { isCount, type Usage } from "./scoring/reply.ts";

export const ROUTING_LIMIT_MS = 8000;
// Adapters abort their signal with this reason when the limit runs out, so a timeout differs from a cancel.
export const LIMIT_REACHED = Symbol("routing limit reached");

type FailedAttempt = {
	readonly provider: Provider;
	readonly reason: string;
};
type Via = {
	readonly provider: Provider;
	readonly first: Provider;
	readonly reason: string;
};
export type Decision = {
	readonly parts: Readonly<
		Record<string, { level: Level; probabilities: Probabilities }>
	>;
	readonly model: string;
	readonly usage: Usage | undefined;
	readonly via?: Via;
};
export type Skipped = { readonly skipped: string };
export type RouteInput = AskInput & {
	readonly attempts: readonly Attempt[];
	readonly onFallback?: (provider: Provider) => void;
};

/** Returns the skip text for an aborted signal: the routing limit or the caller's cancel. */
export function abortCategory(signal: AbortSignal): string {
	return signal.reason === LIMIT_REACHED ? TIMEOUT : CANCELLED;
}

/**
 * Asks the attempts in order and returns the first decision whose parts all
 * parse. Returns a key-unset skip when there are no attempts, and a skip naming
 * each failed provider when none succeeds. A failed attempt falls to the next
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
				provider: attempt.provider,
				reason: skipText(result, abortCategory(signal)),
			});
			if (!fallsBack(result)) break;
			if (i < attempts.length - 1) input.onFallback?.(attempt.provider);
			continue;
		}
		const decision = decide(result);
		const [first] = failed;
		if (!first) return decision;
		const via = {
			provider: attempt.provider,
			first: first.provider,
			reason: first.reason,
		};
		return { ...decision, via };
	}
	return skip(failed);
}

// A one-attempt skip keeps the bare reason; two attempts name each provider in order.
function skip(failed: readonly FailedAttempt[]): Skipped {
	const [first, ...rest] = failed;
	if (!first || rest.length === 0) return { skipped: first?.reason ?? FAILED };
	return {
		skipped: failed.map((f) => `${f.provider} ${f.reason}`).join(", "),
	};
}

function decide({ answers, model, usage }: Reply): Decision {
	const parts: Record<string, { level: Level; probabilities: Probabilities }> =
		{};
	for (const [part, probabilities] of answers)
		parts[part.key] = { level: part.pick(probabilities), probabilities };
	return { parts, model, usage };
}

// Fields the reply lacks are left out, never guessed.
export function decisionSuffix({
	model,
	usage,
	via,
}: Pick<Decision, "model" | "usage" | "via">): string {
	const input = usage?.input_tokens;
	const output = usage?.output_tokens;
	return (
		(model ? ` · jev ${model}` : "") +
		(isCount(input) && isCount(output) ? ` · ${input}/${output} tok` : "") +
		(via ? ` · via ${via.provider} (${via.first} ${via.reason})` : "")
	);
}
