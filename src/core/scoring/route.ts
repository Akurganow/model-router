import { CANCELLED, FAILED, KEY_UNSET, TIMEOUT } from "../output/reasons.ts";
import type { Level, Probabilities } from "../parts/part.ts";
import type { Attempt, Provider } from "../providers/provider.ts";
import { type AskInput, ask, type Reply } from "./ask.ts";
import { fallsBack, isFailure, skipText } from "./failure.ts";
import { isCount, type Usage } from "./reply.ts";

export const ROUTING_LIMIT_MS = 8000;
// Adapters abort their signal with this reason when the limit runs out, so a timeout differs from a cancel.
export const LIMIT_REACHED = Symbol("routing limit reached");

type FailedAttempt = {
	readonly provider: Provider;
	readonly reason: string;
};
export type Decision = {
	readonly parts: Readonly<
		Record<string, { level: Level; probabilities: Probabilities }>
	>;
	// The provider that answered.
	readonly provider: Provider;
	// The model the reply names, cleaned; empty when it names none.
	readonly model: string;
	readonly usage: Usage | undefined;
	// The first failed attempt, set only when the answer came after a fallback.
	readonly firstFailed?: FailedAttempt;
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
		const decision = decide(result, attempt.provider);
		const [first] = failed;
		return first ? { ...decision, firstFailed: first } : decision;
	}
	return skip(failed);
}

// Both the skip text and the routing line name a failed attempt this way.
const named = (f: FailedAttempt): string => `${f.provider} ${f.reason}`;

// A one-attempt skip keeps the bare reason; two attempts name each provider in order.
function skip(failed: readonly FailedAttempt[]): Skipped {
	const [first, ...rest] = failed;
	if (!first || rest.length === 0) return { skipped: first?.reason ?? FAILED };
	return { skipped: failed.map(named).join(", ") };
}

function decide(
	{ answers, model, usage }: Reply,
	provider: Provider,
): Decision {
	const parts: Record<string, { level: Level; probabilities: Probabilities }> =
		{};
	for (const [part, probabilities] of answers)
		parts[part.key] = { level: part.pick(probabilities), probabilities };
	return { parts, provider, model, usage };
}

// The provider always shows. A model or usage the reply lacks is left out, never guessed.
export function decisionSuffix({
	provider,
	model,
	usage,
	firstFailed,
}: Pick<Decision, "provider" | "model" | "usage" | "firstFailed">): string {
	const input = usage?.input_tokens;
	const output = usage?.output_tokens;
	return (
		` · ${provider}` +
		(model ? ` ${model}` : "") +
		(isCount(input) && isCount(output) ? ` · ${input}/${output} tok` : "") +
		(firstFailed ? ` · ${named(firstFailed)}` : "")
	);
}
