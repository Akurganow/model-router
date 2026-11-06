import { LIMIT_REACHED, ROUTING_LIMIT_MS } from "./compose.ts";

// The hook gets this much beyond the routing limit before OpenClaw times it out.
const HOOK_MARGIN_MS = 2000;
// The timeout the plugin registers its hook with: the routing limit plus the margin.
export const HOOK_TIMEOUT_MS = ROUTING_LIMIT_MS + HOOK_MARGIN_MS;
// Below this the deadline leaves too little time for one Jev request.
export const MIN_DEADLINE_MS = 1000;
// The shortest hook timeout that still leaves the minimum deadline.
export const MIN_TIMEOUT_MS = MIN_DEADLINE_MS + HOOK_MARGIN_MS;

// The routing time left once the hook's own margin is kept back, capped at the routing limit.
export const deadlineFor = (timeout: number): number =>
	Math.min(ROUTING_LIMIT_MS, timeout - HOOK_MARGIN_MS);

export type Clock = {
	after: (ms: number, fn: () => void) => { cancel: () => void };
};

/**
 * Runs `work` against a deadline. It never rejects. It returns nothing when the work fails,
 * when the deadline passes, or when `hostSignal` aborts before the work ends.
 * The work gets a signal that the deadline and `hostSignal` both abort.
 */
export async function raceDeadline<T>(
	work: (signal: AbortSignal) => Promise<T | undefined>,
	deadlineMs: number,
	clock: Clock,
	hostSignal: AbortSignal | undefined,
): Promise<T | undefined> {
	try {
		const stop = new AbortController();
		const signal = AbortSignal.any(
			hostSignal ? [stop.signal, hostSignal] : [stop.signal],
		);
		return await new Promise<T | undefined>((settle) => {
			const timer = clock.after(deadlineMs, () => {
				stop.abort(LIMIT_REACHED);
				settle(undefined);
			});
			// The host's abort settles the race at once, so a hook the host gave up on does not wait for its work.
			const onHostAbort = () => {
				timer.cancel();
				settle(undefined);
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
		// A throwing signal or clock leaves the spawn unrouted.
		return undefined;
	}
}
