import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DEADLINE_MS,
	RETRY_DELAY_MS,
	score,
	TIER_TEXTS,
	TransportError,
} from "./core.ts";

const OK = JSON.stringify({
	answers: {
		tier: { type: "score", probabilities: { "0": 1, "1": 0, "2": 0 } },
		work: { type: "score", probabilities: { "0": 0.2, "1": 0.6, "2": 0.2 } },
	},
});
const input = { role: "r", description: "d", prompt: "p", model: "m" };

// Each call takes the next step: an Error is thrown, a string is returned.
const run = async (steps: (Error | string)[], withSleep = true) => {
	const waits: number[] = [];
	let calls = 0;
	const post = async () => {
		const step = steps[calls++];
		if (step === undefined) throw new Error("no more steps");
		if (typeof step === "string") return step;
		throw step;
	};
	const sleep = async (ms: number) => {
		waits.push(ms);
	};
	const result = await score(
		input,
		TIER_TEXTS,
		post,
		withSleep ? { sleep } : {},
	);
	return { result, calls, waits };
};

const http = (status: number) => new TransportError("http", { status });

test("the error carries its kind and status", () => {
	const err = new TransportError("http", { status: 429 });
	assert.ok(err instanceof Error);
	assert.equal(err.kind, "http");
	assert.equal(err.status, 429);
	assert.equal(new TransportError("network").status, undefined);
});

test("each kind has its skip text", () => {
	assert.equal(new TransportError("network").message, "network error");
	assert.equal(http(529).message, "HTTP 529");
	assert.equal(new TransportError("http").message, "HTTP error");
	assert.equal(
		new TransportError("timeout").message,
		`no answer in ${DEADLINE_MS} ms`,
	);
	assert.equal(DEADLINE_MS, 8000);
});

test("a timeout keeps the message its caller gives", () => {
	const err = new TransportError("timeout", { message: "no answer in 5 ms" });
	assert.equal(err.message, "no answer in 5 ms");
});

test("a network error retries once after the delay and then succeeds", async () => {
	const { result, calls, waits } = await run([
		new TransportError("network"),
		OK,
	]);
	assert.ok("level" in result);
	assert.equal(calls, 2);
	assert.deepEqual(waits, [RETRY_DELAY_MS]);
	assert.equal(RETRY_DELAY_MS, 300);
});

test("408, 429 and every 5xx retry once", async () => {
	for (const status of [408, 429, 500, 502, 503, 529, 599]) {
		const { result, calls, waits } = await run([http(status), OK]);
		assert.ok("level" in result, `status ${status}`);
		assert.equal(calls, 2);
		assert.deepEqual(waits, [RETRY_DELAY_MS]);
	}
});

test("a second failure is the skip, with no third request", async () => {
	const { result, calls, waits } = await run([http(503), http(500), OK]);
	assert.deepEqual(result, { skipped: "HTTP 500" });
	assert.equal(calls, 2);
	assert.equal(waits.length, 1);
});

test("a repeated network error reads network error", async () => {
	const { result, calls } = await run([
		new TransportError("network"),
		new TransportError("network"),
	]);
	assert.deepEqual(result, { skipped: "network error" });
	assert.equal(calls, 2);
});

test("a timeout, other statuses and plain errors do not retry", async () => {
	const cases: [Error, string][] = [
		[new TransportError("timeout"), "no answer in 8000 ms"],
		[http(400), "HTTP 400"],
		[http(401), "HTTP 401"],
		[http(407), "HTTP 407"],
		[http(499), "HTTP 499"],
		[http(600), "HTTP 600"],
		[new TransportError("http"), "HTTP error"],
		[new Error("api_key unset"), "api_key unset"],
	];
	for (const [err, skipped] of cases) {
		const { result, calls, waits } = await run([err, OK]);
		assert.deepEqual(result, { skipped });
		assert.equal(calls, 1);
		assert.deepEqual(waits, []);
	}
});

test("a malformed answer is not retried", async () => {
	const { result, calls } = await run(["not json", OK]);
	assert.deepEqual(result, { skipped: "malformed answer" });
	assert.equal(calls, 1);
});

test("without a wait there is no retry", async () => {
	const { result, calls } = await run(
		[new TransportError("network"), OK],
		false,
	);
	assert.deepEqual(result, { skipped: "network error" });
	assert.equal(calls, 1);
});
