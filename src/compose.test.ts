/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type Decision,
	decisionSuffix,
	LIMIT_REACHED,
	ROUTING_LIMIT_MS,
	route,
} from "./compose.ts";
import { work } from "./effort.ts";
import { tier } from "./model.ts";
import { streamed } from "./omp-fakes.ts";

const KEY = "test-key";
const MODEL = "jev-test";
const STATE = { role: "coder", description: "Fix it", task: "Fix the bug." };
const SECRET = "sk-live-0123456789abcdef";
const NO_WAIT = { "retry-after-ms": "0" };

const PROBS = (a: number, b: number, c: number) => ({
	type: "score",
	probabilities: { 0: a, 1: b, 2: c },
});
const VALID = {
	model: "jev-1.14.0",
	usage: { input_tokens: 120, output_tokens: 8 },
	answers: { tier: PROBS(0.1, 0.2, 0.7), work: PROBS(0.1, 0.8, 0.1) },
};

type Respond = (init: RequestInit, count: number) => Promise<Response>;

function stub(respond: Respond) {
	const bodies: string[] = [];
	const fetchFn = (_url: string, init: RequestInit = {}) => {
		bodies.push(String(init.body));
		return respond(init, bodies.length);
	};
	return { bodies, fetchFn };
}

const answering = (body: unknown) => stub(async () => streamed(200, body));

type Overrides = Partial<Parameters<typeof route>[0]>;

function run(
	fetchFn: ReturnType<typeof stub>["fetchFn"],
	extra: Overrides = {},
) {
	return route({
		parts: [tier, work],
		state: STATE,
		model: MODEL,
		apiKey: KEY,
		fetchFn,
		signal: new AbortController().signal,
		...extra,
	});
}

const asDecision = (routed: Awaited<ReturnType<typeof run>>): Decision => {
	assert.ok(!("skipped" in routed), JSON.stringify(routed));
	return routed;
};

test("the routing limit is 8000 ms", () => {
	assert.equal(ROUTING_LIMIT_MS, 8000);
});

// Captured once from the request body the previous implementation sent for STATE and MODEL.
const TIER_AND_WORK_BODY = {
	model: "jev-test",
	state: {
		role: "coder",
		description: "Fix it",
		task: "Fix the bug.",
	},
	questions: {
		tier: {
			type: "score",
			instructions:
				"How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller's one-line summary of the task.",
			criteria: [
				"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.",
				"Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.",
				"Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause.",
			],
		},
		work: {
			type: "score",
			instructions:
				"How much work does completing `task` take for an agent whose role is `role`, once the judgment is settled? Count the steps, the files and the edge cases to verify.",
			criteria: [
				"A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.",
				"An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.",
				"A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right.",
			],
		},
	},
};

test("tier and work send today's request body", async () => {
	const { bodies, fetchFn } = answering(VALID);
	await run(fetchFn);
	assert.equal(bodies.length, 1);
	assert.deepEqual(JSON.parse(bodies[0] ?? ""), TIER_AND_WORK_BODY);
});

test("tier alone sends no work question", async () => {
	const { bodies, fetchFn } = answering({
		...VALID,
		answers: { tier: VALID.answers.tier },
	});
	await run(fetchFn, { parts: [tier] });
	const sent = JSON.parse(bodies[0] ?? "");
	assert.deepEqual(Object.keys(sent.questions), ["tier"]);
	assert.deepEqual(sent.questions.tier, tier.question);
	assert.equal(sent.model, MODEL);
});

test("a valid reply gives each part its level, probabilities, model and usage", async () => {
	const { fetchFn } = answering(VALID);
	const decision = asDecision(await run(fetchFn));
	const { tier: tierPart, work: workPart } = decision.parts;
	assert.equal(tierPart?.level, 2);
	assert.equal(workPart?.level, 1);
	assert.deepEqual(workPart?.probabilities, {
		0: 0.1,
		1: 0.8,
		2: 0.1,
	});
	assert.equal(decision.model, "jev-1.14.0");
	assert.deepEqual(decision.usage, { input_tokens: 120, output_tokens: 8 });
});

test("a limit abort is a timeout", async () => {
	const { bodies, fetchFn } = stub(
		(init) =>
			new Promise((_, reject) => {
				init.signal?.addEventListener("abort", () =>
					reject(init.signal?.reason),
				);
			}),
	);
	const controller = new AbortController();
	const routed = run(fetchFn, { signal: controller.signal });
	setImmediate(() => controller.abort(LIMIT_REACHED));
	assert.deepEqual(await routed, { skipped: "timeout" });
	assert.equal(bodies.length, 1);
});

test("a plain abort is cancelled", async () => {
	const { fetchFn } = answering(VALID);
	const controller = new AbortController();
	controller.abort();
	assert.deepEqual(await run(fetchFn, { signal: controller.signal }), {
		skipped: "cancelled",
	});
});

test("a fetch rejection is a network error after the SDK retries", async () => {
	const { bodies, fetchFn } = stub(async () => {
		throw new TypeError(`fetch failed for ${SECRET}`);
	});
	const routed = await run(fetchFn);
	assert.deepEqual(routed, { skipped: "network error" });
	assert.equal(bodies.length, 3);
});

test("a 401 is HTTP 401 after one request", async () => {
	const { bodies, fetchFn } = stub(async () => streamed(401, { error: "no" }));
	assert.deepEqual(await run(fetchFn), { skipped: "HTTP 401" });
	assert.equal(bodies.length, 1);
});

test("a 500 then a 200 gives a decision after one retry", async () => {
	const { bodies, fetchFn } = stub(async (_init, count) =>
		count === 1 ? streamed(500, "oops", NO_WAIT) : streamed(200, VALID),
	);
	asDecision(await run(fetchFn));
	assert.equal(bodies.length, 2);
});

test("a malformed or incomplete answer is a bad reply", async () => {
	const broken = [
		{
			...VALID,
			answers: { tier: { type: "score" }, work: VALID.answers.work },
		},
		{ ...VALID, answers: { tier: VALID.answers.tier } },
		"not json",
		{ model: "jev" },
	];
	for (const body of broken) {
		const { fetchFn } = answering(body);
		assert.deepEqual(await run(fetchFn), { skipped: "bad reply" });
	}
});

test("a request the SDK rejects locally is a rejected request with no fetch", async () => {
	const task = "see <image:00112233445566778899aabbccddeeff>";
	const { bodies, fetchFn } = answering(VALID);
	const routed = await run(fetchFn, { state: { ...STATE, task } });
	assert.deepEqual(routed, { skipped: "rejected request" });
	assert.equal(bodies.length, 0);
});

test("no key is key unset and makes no request", async () => {
	const { bodies, fetchFn } = answering(VALID);
	for (const apiKey of [undefined, ""]) {
		assert.deepEqual(await run(fetchFn, { apiKey }), { skipped: "key unset" });
	}
	assert.equal(bodies.length, 0);
});

test("an error outside the SDK's classes is failed", async () => {
	const unserializable = {
		...tier,
		question: {
			...tier.question,
			instructions: {
				toJSON() {
					throw new RangeError("boom");
				},
			} as never,
		},
	};
	const { bodies, fetchFn } = answering(VALID);
	const routed = await run(fetchFn, { parts: [unserializable] });
	assert.deepEqual(routed, { skipped: "failed" });
	assert.equal(bodies.length, 0);
});

test("a skip holds neither the response body, the task nor the key", async () => {
	const task = `Deploy with ${SECRET} now`;
	const { fetchFn } = stub(async () =>
		streamed(401, { error: `bad key ${KEY} ${SECRET}`, echo: task }),
	);
	const routed = await run(fetchFn, { state: { ...STATE, task } });
	const text = JSON.stringify(routed);
	for (const leak of [SECRET, task, KEY, "bad key"])
		assert.ok(!text.includes(leak), `leaked ${leak}`);
});

test("the suffix keeps safe characters, caps the model at 40 and prints usage", async () => {
	const model = `jev 1.14/<b>${"x".repeat(60)}`;
	const { fetchFn } = answering({ ...VALID, model });
	const decision = asDecision(await run(fetchFn));
	assert.equal(decision.model, `jev1.14b${"x".repeat(32)}`);
	assert.equal(
		decisionSuffix(decision),
		` · jev ${decision.model} · 120/8 tok`,
	);
});

test("the suffix leaves out null, missing or unsafe usage", () => {
	const model = "jev-1";
	assert.equal(
		decisionSuffix({ model, usage: { input_tokens: null, output_tokens: 3 } }),
		" · jev jev-1",
	);
	assert.equal(decisionSuffix({ model, usage: undefined }), " · jev jev-1");
	assert.equal(
		decisionSuffix({ model, usage: { input_tokens: -1, output_tokens: 3 } }),
		" · jev jev-1",
	);
	assert.equal(decisionSuffix({ model: "", usage: undefined }), "");
});
