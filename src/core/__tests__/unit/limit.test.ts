import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createFakeClock } from "../../../utils/__tests__/support/fake-clock.ts";
import type { Clock } from "../../../utils/clock.ts";
import {
	abortCategory,
	LIMIT_REACHED,
	limitSignal,
	raceDeadline,
} from "../../scoring/limit.ts";

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

	it("returns the work's result even when cancelling the timer throws", async () => {
		const throwingCancel: Clock = {
			after: () => ({
				cancel: () => {
					throw new Error("cancel failed");
				},
			}),
		};
		const result = await raceDeadline(
			async () => "done",
			DEADLINE_MS,
			throwingCancel,
			undefined,
		);
		assert.equal(result, "done");
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

describe("limitSignal", () => {
	const LIMIT_MS = 8000;

	it("aborts with the limit reason when the timer fires, and not before", () => {
		const time = createFakeClock();
		const { signal } = limitSignal(LIMIT_MS, time.clock);
		assert.deepEqual(time.delays(), [LIMIT_MS]);
		assert.equal(signal.aborted, false);
		time.fire();
		assert.equal(signal.aborted, true);
		assert.equal(signal.reason, LIMIT_REACHED);
		assert.equal(abortCategory(signal), "timeout");
	});

	for (const ms of [0, -1])
		it(`is aborted with the limit reason at once for ${ms} ms and arms no timer`, () => {
			const time = createFakeClock();
			const { signal, disarm } = limitSignal(ms, time.clock);
			assert.equal(signal.aborted, true);
			assert.equal(signal.reason, LIMIT_REACHED);
			assert.deepEqual(time.delays(), []);
			disarm();
		});

	it("aborts with the parent's reason when the parent aborts", () => {
		const time = createFakeClock();
		const parent = new AbortController();
		const { signal } = limitSignal(LIMIT_MS, time.clock, parent.signal);
		const reason = new Error("cancelled by the user");
		parent.abort(reason);
		assert.equal(signal.aborted, true);
		assert.equal(signal.reason, reason);
		assert.equal(abortCategory(signal), "cancelled");
	});

	it("is aborted with the parent's reason at once when the parent is already aborted", () => {
		const time = createFakeClock();
		const { signal } = limitSignal(
			LIMIT_MS,
			time.clock,
			AbortSignal.abort("gone"),
		);
		assert.equal(signal.reason, "gone");
		assert.equal(time.live(), 0);
	});

	it("disarm cancels the timer and leaves no parent listener", () => {
		const time = createFakeClock();
		const parent = new AbortController();
		const added = mock.method(parent.signal, "addEventListener");
		const removed = mock.method(parent.signal, "removeEventListener");
		const { signal, disarm } = limitSignal(LIMIT_MS, time.clock, parent.signal);
		assert.equal(time.live(), 1);
		disarm();
		assert.equal(time.live(), 0);
		time.fire();
		assert.equal(signal.aborted, false);
		assert.equal(removed.mock.calls[0]?.arguments[0], "abort");
		assert.equal(
			removed.mock.calls[0]?.arguments[1],
			added.mock.calls[0]?.arguments[1],
		);
	});
});
