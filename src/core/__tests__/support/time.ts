import type { TestContext } from "node:test";

const FLUSH_ROUNDS = 5;

type Timer = { due: number; done: boolean };

const flush = async () => {
	for (let round = 0; round < FLUSH_ROUNDS; round++) {
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
};

/**
 * Fakes `setTimeout` and `Date` for one test, with the clock at epoch 0, and gives back
 * `pass(ms)`, which moves the clock forward and lets pending promise work settle, and
 * `live()`, which counts the timers set and neither fired nor cleared. Both globals are
 * restored when the test ends.
 */
export function fakeTime(t: TestContext) {
	t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
	const mockedSet = globalThis.setTimeout;
	const mockedClear = globalThis.clearTimeout;
	const timers = new Map<unknown, Timer>();

	globalThis.setTimeout = ((
		callback: (...args: unknown[]) => void,
		delay?: number,
		...args: unknown[]
	) => {
		const timer: Timer = {
			due: Date.now() + Math.max(0, delay ?? 0),
			done: false,
		};
		const handle = mockedSet(
			(...rest: unknown[]) => {
				timer.done = true;
				callback(...rest);
			},
			delay,
			...args,
		);
		timers.set(handle, timer);
		return handle;
	}) as typeof setTimeout;
	globalThis.clearTimeout = ((handle?: Parameters<typeof clearTimeout>[0]) => {
		const timer = timers.get(handle);
		if (timer) timer.done = true;
		mockedClear(handle);
	}) as typeof clearTimeout;

	t.after(() => {
		globalThis.setTimeout = mockedSet;
		globalThis.clearTimeout = mockedClear;
		t.mock.timers.reset();
	});

	const live = () => [...timers.values()].filter((timer) => !timer.done).length;

	/**
	 * Moves the clock forward by exactly `ms`, one due timer at a time so a timer that
	 * a fired callback sets is due from the moment it was set.
	 */
	const pass = async (ms: number) => {
		const end = Date.now() + ms;
		await flush();
		for (;;) {
			const due = Math.min(
				...[...timers.values()]
					.filter((timer) => !timer.done && timer.due <= end)
					.map((timer) => timer.due),
			);
			if (!Number.isFinite(due)) break;
			t.mock.timers.tick(Math.max(0, due - Date.now()));
			await flush();
		}
		if (Date.now() < end) t.mock.timers.tick(end - Date.now());
		await flush();
	};

	return { pass, live };
}
