import type { Clock } from "./clock.ts";

/**
 * A clock that runs a timer only when the test calls `fire`.
 * `delays` lists every delay asked for, cancelled or not, and `live` counts the timers not yet fired or cancelled.
 */
export function createFakeClock() {
	const timers: { ms: number; fn: () => void; live: boolean }[] = [];
	const clock: Clock = {
		after: (ms, fn) => {
			const timer = { ms, fn, live: true };
			timers.push(timer);
			return {
				cancel: () => {
					timer.live = false;
				},
			};
		},
	};
	/**
	 * Runs each timer that is still live once, in the order asked for. Throws when
	 * a timer callback throws.
	 */
	const fire = () => {
		for (const timer of timers) {
			if (!timer.live) continue;
			timer.live = false;
			timer.fn();
		}
	};
	return {
		clock,
		fire,
		delays: () => timers.map((t) => t.ms),
		live: () => timers.filter((t) => t.live).length,
	};
}
