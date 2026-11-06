import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { LIMIT_REACHED } from "./compose.ts";
import { type Clock, raceDeadline } from "./deadline.ts";
import { createFakeClock } from "./fake-clock.ts";

describe("raceDeadline", () => {
	const DEADLINE_MS = 5000;

	it("returns the work's result and cancels the timer", async () => {
		const time = createFakeClock();
		const result = await raceDeadline(
			async () => "done",
			DEADLINE_MS,
			time.clock,
			undefined,
		);
		assert.equal(result, "done");
		assert.deepEqual(time.delays(), [DEADLINE_MS]);
		assert.equal(time.live(), 0);
	});

	it("returns nothing when the work rejects", async () => {
		const time = createFakeClock();
		const work = async () => {
			throw new Error("work");
		};
		assert.equal(
			await raceDeadline(work, DEADLINE_MS, time.clock, undefined),
			undefined,
		);
	});

	it("aborts the work's signal at the deadline and returns nothing", async () => {
		const time = createFakeClock();
		let seen: AbortSignal | undefined;
		const pending = raceDeadline(
			(signal) => {
				seen = signal;
				return new Promise<string>(() => undefined);
			},
			DEADLINE_MS,
			time.clock,
			undefined,
		);
		time.fire();
		assert.equal(await pending, undefined);
		assert.equal(seen?.reason, LIMIT_REACHED);
	});

	it("returns nothing when the host signal aborts before the work ends", async () => {
		const time = createFakeClock();
		const host = new AbortController();
		let release: (value: string) => void = () => undefined;
		const pending = raceDeadline(
			() =>
				new Promise<string>((resolve) => {
					release = resolve;
				}),
			DEADLINE_MS,
			time.clock,
			host.signal,
		);
		host.abort();
		release("late");
		assert.equal(await pending, undefined);
	});

	it("settles at once when the host aborts, without waiting for the work or the deadline", async () => {
		const time = createFakeClock();
		const host = new AbortController();
		const pending = raceDeadline(
			() => new Promise<string>(() => undefined),
			DEADLINE_MS,
			time.clock,
			host.signal,
		);
		host.abort();
		assert.equal(await pending, undefined);
		assert.equal(time.live(), 0);
	});

	it("settles at once when the host signal is already aborted", async () => {
		const time = createFakeClock();
		const pending = raceDeadline(
			() => new Promise<string>(() => undefined),
			DEADLINE_MS,
			time.clock,
			AbortSignal.abort(),
		);
		assert.equal(await pending, undefined);
		assert.equal(time.live(), 0);
	});

	it("settles on a host abort even when cancelling the timer throws", async () => {
		const throwingCancel: Clock = {
			after: () => ({
				cancel: () => {
					throw new Error("cancel failed");
				},
			}),
		};
		const host = new AbortController();
		const pending = raceDeadline(
			() => new Promise<string>(() => undefined),
			DEADLINE_MS,
			throwingCancel,
			host.signal,
		);
		host.abort();
		assert.equal(await pending, undefined);
	});

	it("stops listening to the host signal once the work ends", async () => {
		const time = createFakeClock();
		const host = new AbortController();
		const added = mock.method(host.signal, "addEventListener");
		const removed = mock.method(host.signal, "removeEventListener");
		await raceDeadline(
			async () => "done",
			DEADLINE_MS,
			time.clock,
			host.signal,
		);
		assert.equal(added.mock.calls[0]?.arguments[0], "abort");
		assert.equal(removed.mock.calls[0]?.arguments[0], "abort");
		assert.equal(
			removed.mock.calls[0]?.arguments[1],
			added.mock.calls[0]?.arguments[1],
		);
	});

	it("returns nothing when the clock or the signal throws", async () => {
		const clock = {
			after: () => {
				throw new Error("clock");
			},
		};
		assert.equal(
			await raceDeadline(async () => "x", DEADLINE_MS, clock, undefined),
			undefined,
		);
		const time = createFakeClock();
		assert.equal(
			await raceDeadline(
				async () => "x",
				DEADLINE_MS,
				time.clock,
				{} as AbortSignal,
			),
			undefined,
		);
	});
});
