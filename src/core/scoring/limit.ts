import type { Clock } from "../../utils/clock.ts";
import { CANCELLED, TIMEOUT } from "../output/reasons.ts";

export const ROUTING_LIMIT_MS = 8000;
// Adapters abort their signal with this reason when the limit runs out, so a timeout differs from a cancel.
export const LIMIT_REACHED = Symbol("routing limit reached");

/** Returns the skip text for an aborted signal: the routing limit or the caller's cancel. */
export function abortCategory(signal: AbortSignal): string {
	return signal.reason === LIMIT_REACHED ? TIMEOUT : CANCELLED;
}

/**
 * Returns a signal that the clock aborts with LIMIT_REACHED after `ms`, and
 * that an abort of `parent` aborts with the parent's reason. A limit of zero or
 * less is aborted at once and arms no timer. `disarm` cancels the timer and
 * removes the parent listener.
 */
export function limitSignal(
	ms: number,
	clock: Clock,
	parent?: AbortSignal,
): { readonly signal: AbortSignal; readonly disarm: () => void } {
	const controller = new AbortController();
	const { signal } = controller;
	const disarmed = { signal, disarm: () => undefined };
	if (ms <= 0) {
		controller.abort(LIMIT_REACHED);
		return disarmed;
	}
	if (parent?.aborted) {
		controller.abort(parent.reason);
		return disarmed;
	}
	const onParentAbort = () => controller.abort(parent?.reason);
	parent?.addEventListener("abort", onParentAbort, { once: true });
	try {
		const timer = clock.after(ms, () => controller.abort(LIMIT_REACHED));
		return {
			signal,
			disarm: () => {
				parent?.removeEventListener("abort", onParentAbort);
				timer.cancel();
			},
		};
	} catch (error) {
		parent?.removeEventListener("abort", onParentAbort);
		throw error;
	}
}

/**
 * Runs `work` against a deadline. It never rejects. It returns nothing when the work fails,
 * when the deadline passes, or when `hostSignal` aborts before the work ends.
 * The work gets a signal that the deadline and `hostSignal` both abort;
 * the deadline aborts it with LIMIT_REACHED.
 */
export async function raceDeadline<T>(
	work: (signal: AbortSignal) => Promise<T | undefined>,
	deadlineMs: number,
	clock: Clock,
	hostSignal: AbortSignal | undefined,
): Promise<T | undefined> {
	try {
		const { signal, disarm } = limitSignal(deadlineMs, clock, hostSignal);
		try {
			// The caller's abort settles the race at once, so a caller that gave up on its
			// work does not wait for it.
			return await new Promise<T | undefined>((settle) => {
				const onAbort = () => settle(undefined);
				signal.addEventListener("abort", onAbort, { once: true });
				if (signal.aborted) onAbort();
				work(signal)
					.then(
						(result) => (signal.aborted ? undefined : result),
						() => undefined,
					)
					.then(settle);
			});
		} finally {
			try {
				disarm();
			} catch {
				// A throwing cancel must not escape: the race has already settled.
			}
		}
	} catch {
		// A throwing signal or clock gives no result.
		return undefined;
	}
}
