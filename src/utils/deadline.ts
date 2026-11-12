import type { Clock } from "./clock.ts";

/**
 * Runs `work` against a deadline. It never rejects. It returns nothing when the work fails,
 * when the deadline passes, or when `hostSignal` aborts before the work ends.
 * The work gets a signal that the deadline and `hostSignal` both abort;
 * the deadline aborts it with `reason`.
 */
export async function raceDeadline<T>(
	work: (signal: AbortSignal) => Promise<T | undefined>,
	deadlineMs: number,
	clock: Clock,
	hostSignal: AbortSignal | undefined,
	reason: unknown,
): Promise<T | undefined> {
	try {
		const stop = new AbortController();
		const signal = AbortSignal.any(
			hostSignal ? [stop.signal, hostSignal] : [stop.signal],
		);
		return await new Promise<T | undefined>((settle) => {
			const timer = clock.after(deadlineMs, () => {
				stop.abort(reason);
				settle(undefined);
			});
			/**
			 * Settles the race with undefined and cancels the deadline timer. The
			 * caller's abort settles the race at once, so a caller that gave up on its
			 * work does not wait for it. Never throws: a throwing cancel stays inside.
			 */
			const onHostAbort = () => {
				settle(undefined);
				try {
					timer.cancel();
				} catch {
					// A throwing cancel must not escape the listener; the race has already settled.
				}
			};
			hostSignal?.addEventListener("abort", onHostAbort, { once: true });
			if (hostSignal?.aborted) onHostAbort();
			work(signal)
				.then(
					(result) => (signal.aborted ? undefined : result),
					() => undefined,
				)
				.then(settle)
				.finally(() => {
					timer.cancel();
					hostSignal?.removeEventListener("abort", onHostAbort);
				})
				// A cancel that throws must not become an unhandled rejection.
				.catch(() => undefined);
		});
	} catch {
		// A throwing signal or clock gives no result.
		return undefined;
	}
}
