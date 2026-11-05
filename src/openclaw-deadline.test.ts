import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMIT_REACHED, ROUTING_LIMIT_MS } from "./compose.ts";
import {
	deadlineFor,
	MIN_DEADLINE_MS,
	MIN_TIMEOUT_MS,
	raceDeadline,
} from "./openclaw-deadline.ts";
import { createFakeClock } from "./openclaw-fakes.ts";

describe("deadlineFor", () => {
	it("leaves the minimum deadline at the minimum hook timeout", () => {
		assert.equal(deadlineFor(MIN_TIMEOUT_MS), MIN_DEADLINE_MS);
		assert.ok(deadlineFor(MIN_TIMEOUT_MS - 1) < MIN_DEADLINE_MS);
	});

	it("caps the deadline at the routing limit", () => {
		assert.equal(deadlineFor(600000), ROUTING_LIMIT_MS);
	});
});

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
