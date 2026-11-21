import { CANCELLED, TIMEOUT } from "#core/output/reasons.ts";
import type { Clock } from "#utils/clock.ts";

export const ROUTING_LIMIT_MS = 10000;
// limitSignal aborts with this reason when the limit runs out, so a timeout differs from a cancel.
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
 * A caller of this form awaits its own work, as Claude Code, omp and the
 * calibration script do. The work must end on the abort. Its own result comes
 * back, with the skip text that names each provider.
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
	// The timer is armed first, so a clock that throws leaves no listener on the parent.
	const timer = clock.after(ms, () => controller.abort(LIMIT_REACHED));
	const onParentAbort = () => controller.abort(parent?.reason);
	parent?.addEventListener("abort", onParentAbort, { once: true });
	return {
		signal,
		disarm: () => {
			parent?.removeEventListener("abort", onParentAbort);
			timer.cancel();
		},
	};
}

/**
 * Runs `work` against a deadline. It never rejects. It returns nothing when the work fails,
 * when the deadline passes, or when `parent` aborts before the work ends.
 * The work gets a signal that the deadline and `parent` both abort;
 * the deadline aborts it with LIMIT_REACHED.
 * This form settles its caller at the deadline even when the work has not
 * ended, as the hosts of OpenClaw and Hermes need. The work's result is lost
 * then, and the caller writes the plain reason itself. It tells the ends apart
 * by catching inside `work` and by abortCategory(signal) in an abort listener.
 */
export async function raceDeadline<T>(
	work: (signal: AbortSignal) => Promise<T | undefined>,
	deadlineMs: number,
	clock: Clock,
	parent: AbortSignal | undefined,
): Promise<T | undefined> {
	try {
		const { signal, disarm } = limitSignal(deadlineMs, clock, parent);
		try {
			return await new Promise<T | undefined>((settle) => {
				// The deadline and the parent's abort both settle the race at once, so
				// the caller does not wait for work that has not ended.
				const onAbort = () => settle(undefined);
				signal.addEventListener("abort", onAbort, { once: true });
				if (signal.aborted) onAbort();
				work(signal).then(settle, () => settle(undefined));
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
