import type { TestContext } from "node:test";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

type Outcome<T> = { value: T } | { error: unknown };

/**
 * Fakes `setTimeout` and `Date` for one test, with the clock at epoch 0. `setInterval`,
 * `AbortSignal.timeout` and `performance.now` stay real, and `setImmediate` stays real.
 * Gives back `pass(ms)`, which moves the clock forward and lets pending promise work settle,
 * `live()`, which counts the `setTimeout` timers neither fired nor cleared, and `settled`.
 * Both faked globals are restored when the test ends.
 */
export function fakeTime(t: TestContext) {
	t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
	const mockedSet = globalThis.setTimeout;
	const mockedClear = globalThis.clearTimeout;
	const due = new Map<unknown, number>();

	globalThis.setTimeout = ((callback: () => void, delay?: number) => {
		const handle = mockedSet(() => {
			due.delete(handle);
			callback();
		}, delay);
		due.set(handle, Date.now() + (delay ?? 0));
		return handle;
	}) as typeof setTimeout;
	globalThis.clearTimeout = ((handle?: Parameters<typeof clearTimeout>[0]) => {
		due.delete(handle);
		mockedClear(handle);
	}) as typeof clearTimeout;

	t.after(() => {
		globalThis.setTimeout = mockedSet;
		globalThis.clearTimeout = mockedClear;
		t.mock.timers.reset();
	});

	const live = () => due.size;

	/**
	 * Moves the clock forward by exactly `ms`, one due timer at a time so a timer that
	 * a fired callback sets is due from the moment it was set.
	 */
	const pass = async (ms: number) => {
		const end = Date.now() + ms;
		await flush();
		for (;;) {
			const next = Math.min(...[...due.values()].filter((at) => at <= end));
			if (!Number.isFinite(next)) break;
			t.mock.timers.tick(Math.max(0, next - Date.now()));
			await flush();
		}
		if (Date.now() < end) t.mock.timers.tick(end - Date.now());
		await flush();
	};

	/** Gives back the promise's outcome once pending work is flushed, or rejects at once if it is still pending. */
	const settled = async <T>(promise: Promise<T>): Promise<T> => {
		const box: { outcome?: Outcome<T> } = {};
		promise.then(
			(value) => {
				box.outcome = { value };
			},
			(error: unknown) => {
				box.outcome = { error };
			},
		);
		await flush();
		const { outcome } = box;
		if (!outcome) {
			throw new Error(`still pending after ${Date.now()} ms of fake time`);
		}
		if ("error" in outcome) throw outcome.error;
		return outcome.value;
	};

	return { pass, live, settled };
}
