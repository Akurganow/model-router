/// <reference types="node" />

import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import {
	brokenReply,
	scoringReply,
	stalledReply,
} from "#core/__tests__/support/replies.ts";
import { fakeTime } from "#core/__tests__/support/time.ts";
import { routingState } from "#core/brief/brief.ts";
import { settingsOf } from "#core/options/settings.ts";
import { KEY_UNSET } from "#core/output/reasons.ts";
import { tier } from "#core/parts/tier.ts";
import { work } from "#core/parts/work.ts";
import {
	type Attempt,
	collectKeys,
	type Gateway,
	plan,
} from "#core/providers/provider.ts";
import { LIMIT_REACHED, ROUTING_LIMIT_MS } from "#core/scoring/limit.ts";
import { type Decision, type RouteInput, route } from "#core/scoring/route.ts";
import { realClock } from "#utils/clock.ts";

const KEY = "test-key";
const OR_KEY = "test-openrouter-key";
const KEYS = { typesafe: KEY, openrouter: OR_KEY };
const BOTH = plan({ provider: "typesafe", gateway: "auto" }, KEYS);
const MODEL = "jev-test";
const STATE = routingState({
	role: "coder",
	description: "Fix it",
	task: "Fix the bug.",
});
const SECRET = "sk-live-0123456789abcdef";
const NO_WAIT = { "retry-after-ms": "0" };
// The longest the two backoffs of one attempt can take together: 500 + 1000.
const BACKOFFS_MS = 1500;

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
	const sent: string[] = [];
	const inits: RequestInit[] = [];
	const at: number[] = [];
	const fetchFn = (url: string, init: RequestInit = {}) => {
		at.push(Date.now());
		bodies.push(String(init.body));
		inits.push(init);
		sent.push(`${url} ${new Headers(init.headers).get("authorization")}`);
		return respond(init, bodies.length);
	};
	return { bodies, sent, inits, at, fetchFn };
}

const hang: Respond = (init) =>
	new Promise((_, reject) => {
		const { signal } = init;
		if (signal?.aborted) return reject(signal.reason);
		signal?.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});

const answering = (body: unknown) => stub(async () => scoringReply(200, body));

type Overrides = Partial<Parameters<typeof route>[0]>;

function run(
	fetchFn: ReturnType<typeof stub>["fetchFn"],
	extra: Overrides = {},
) {
	return route({
		parts: [tier, work],
		state: STATE,
		attempts: [
			{
				maker: "typesafe",
				path: "direct",
				holder: "typesafe",
				key: KEY,
				model: MODEL,
			},
		],
		fetchFn,
		clock: realClock,
		signal: new AbortController().signal,
		...extra,
	});
}

const asDecision = (routed: Awaited<ReturnType<typeof run>>): Decision => {
	assert.ok(!("skipped" in routed), JSON.stringify(routed));
	return routed;
};

test("route takes only a state that routingState built", () => {
	const raw = { role: "r", description: "d", task: "t" };
	// @ts-expect-error A raw state would skip the masking.
	const state: RouteInput["state"] = raw;
	assert.equal(state, raw);
});

test("the routing limit is 8000 ms", () => {
	assert.equal(ROUTING_LIMIT_MS, 8000);
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

test("a valid reply gives each part its level, probabilities, provider, model and usage", async () => {
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
	assert.equal(decision.holder, "typesafe");
	assert.equal(decision.model, "jev-1.14.0");
	assert.deepEqual(decision.usage, { input_tokens: 120, output_tokens: 8 });
});

test("a limit abort is a timeout", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(hang);
	const controller = new AbortController();
	const routed = run(fetchFn, { signal: controller.signal });
	await time.pass(0);
	controller.abort(LIMIT_REACHED);
	assert.deepEqual(await time.settled(routed), { skipped: "timeout" });
	assert.equal(bodies.length, 1);
});

test("a fetch rejection is a network error after two retries", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async () => {
		throw new TypeError(`fetch failed for ${SECRET}`);
	});
	const routed = run(fetchFn);
	await time.pass(BACKOFFS_MS);
	assert.deepEqual(await time.settled(routed), { skipped: "network error" });
	assert.equal(bodies.length, 3);
});

test("a 401 is HTTP 401 after one request", async () => {
	const { bodies, fetchFn } = stub(async () =>
		scoringReply(401, { error: "no" }),
	);
	assert.deepEqual(await run(fetchFn), { skipped: "HTTP 401" });
	assert.equal(bodies.length, 1);
});

test("a 500 then a 200 gives a decision after one retry", async () => {
	const { bodies, fetchFn } = stub(async (_init, count) =>
		count === 1 ? scoringReply(500, "oops", NO_WAIT) : scoringReply(200, VALID),
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

test("a task that quotes an image reference is sent as text and gives a decision", async () => {
	const task = "see <image:00112233445566778899aabbccddeeff>";
	const { bodies, fetchFn } = answering(VALID);
	const state = routingState({ ...STATE, task });
	asDecision(await run(fetchFn, { state }));
	assert.equal(bodies.length, 1);
	assert.equal(JSON.parse(bodies[0] ?? "").state.task, task);
});

test("no attempt is key unset and makes no request", async () => {
	const { bodies, fetchFn } = answering(VALID);
	assert.deepEqual(await run(fetchFn, { attempts: [] }), {
		skipped: KEY_UNSET,
	});
	assert.equal(bodies.length, 0);
});

test("a part whose question cannot be serialised is failed and sends no request", async () => {
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

test("a setting that is not valid skips the task with its setup reason, and looks up no key or sends nothing", async () => {
	for (const [stored, reason] of [
		[{ provider: "auto" }, "provider not valid: run setup"],
		[{ gateway: "fast", scope: "wide" }, "gateway not valid: run setup"],
	] as const) {
		const looked: string[] = [];
		const { sent, fetchFn } = answering(VALID);
		const settings = settingsOf(stored);
		const keys = await collectKeys(settings, async (holder) => {
			looked.push(holder);
			return KEYS[holder];
		});
		assert.deepEqual(await run(fetchFn, { attempts: plan(settings, keys) }), {
			skipped: reason,
		});
		assert.deepEqual(looked, []);
		assert.deepEqual(sent, []);
	}
});

test("a skip holds neither the response body, the task nor the key", async () => {
	const task = `Deploy with ${SECRET} now`;
	const { fetchFn } = stub(async () =>
		scoringReply(401, { error: `bad key ${KEY} ${SECRET}`, echo: task }),
	);
	// The raw task skips the masking on purpose: the skip text itself must drop it.
	const state = { ...STATE, task } as RouteInput["state"];
	const routed = await run(fetchFn, { state });
	const text = JSON.stringify(routed);
	for (const leak of [SECRET, task, KEY, "bad key"])
		assert.ok(!text.includes(leak), `leaked ${leak}`);
});

test("the model keeps safe characters and / and is capped at 40", async () => {
	const model = `typesafe/jev 1.14<b>${"x".repeat(60)}`;
	const { fetchFn } = answering({ ...VALID, model });
	const decision = asDecision(await run(fetchFn));
	assert.equal(decision.model, `typesafe/jev1.14b${"x".repeat(23)}`);
});

test("a 503 falls back once to the next provider with its own host and key", async () => {
	const { sent, fetchFn } = stub(async (_init, count) =>
		count === 1 ? scoringReply(503, "down", NO_WAIT) : scoringReply(200, VALID),
	);
	const decision = asDecision(await run(fetchFn, { attempts: BOTH }));
	assert.deepEqual(sent, [
		`https://api.typesafe.ai/v1/systemone Bearer ${KEY}`,
		`https://openrouter.ai/api/v1/systemone Bearer ${OR_KEY}`,
	]);
	assert.equal(decision.holder, "openrouter");
	assert.deepEqual(decision.firstFailed, {
		holder: "typesafe",
		reason: "HTTP 503",
	});
});

test("a fallback reports the failed provider before the next attempt's request", async () => {
	const log: string[] = [];
	const { fetchFn } = stub(async (_init, count) => {
		log.push(`request ${count}`);
		return count === 1
			? scoringReply(503, "down", NO_WAIT)
			: scoringReply(200, VALID);
	});
	const onFallback = (holder: string) => void log.push(holder);
	asDecision(await run(fetchFn, { attempts: BOTH, onFallback }));
	assert.deepEqual(log, ["request 1", "typesafe", "request 2"]);
});

test("no fallback, no report: a 400, or a 503 with no attempt left", async () => {
	const fallbacks: string[] = [];
	const onFallback = (holder: string) => void fallbacks.push(holder);
	const bad = stub(async () => scoringReply(400, "bad"));
	await run(bad.fetchFn, { attempts: BOTH, onFallback });
	const down = stub(async () => scoringReply(503, "down", NO_WAIT));
	await run(down.fetchFn, { onFallback });
	assert.deepEqual(fallbacks, []);
});

test("openrouter-first asks OpenRouter first and falls back after a network error", async () => {
	const { sent, fetchFn } = stub(async (_init, count) => {
		if (count === 1) throw new TypeError("fetch failed");
		return scoringReply(200, VALID);
	});
	const attempts = plan(
		{ provider: "typesafe", gateway: "openrouter-first" },
		KEYS,
	);
	const decision = asDecision(await run(fetchFn, { attempts }));
	assert.equal(sent.length, 2);
	assert.match(sent[0] ?? "", /^https:\/\/openrouter\.ai\//);
	assert.equal(decision.holder, "typesafe");
	assert.deepEqual(decision.firstFailed, {
		holder: "openrouter",
		reason: "network error",
	});
});

test("an attempt whose provider has no endpoint is skipped as failed and sends nothing", async () => {
	const { sent, fetchFn } = answering(VALID);
	const attempts = [
		{ maker: "toString", path: "direct", holder: "typesafe", key: KEY },
	] as unknown as Attempt[];
	assert.deepEqual(await run(fetchFn, { attempts }), { skipped: "failed" });
	assert.equal(sent.length, 0);
});

test("a per-attempt timeout falls back and reports timeout", async (t) => {
	const time = fakeTime(t);
	const attempts: Attempt[] = [
		{
			maker: "typesafe",
			path: "direct",
			holder: "typesafe",
			key: KEY,
			timeout: 20,
			retries: 0,
		},
		{
			maker: "typesafe",
			path: "openrouter",
			holder: "openrouter",
			key: OR_KEY,
		},
	];
	const { bodies, fetchFn } = stub((init, count) =>
		count === 1 ? hang(init, count) : Promise.resolve(scoringReply(200, VALID)),
	);
	const routed = run(fetchFn, { attempts });
	await time.pass(19);
	assert.equal(bodies.length, 1);
	await time.pass(1);
	const decision = asDecision(await time.settled(routed));
	assert.equal(bodies.length, 2);
	assert.equal(decision.firstFailed?.reason, "timeout");
});

test("a 400, a 422 or a bad reply ends the call with its one-attempt reason", async () => {
	const cases: [Respond, string][] = [
		[async () => scoringReply(400, "bad"), "HTTP 400"],
		[async () => scoringReply(422, "bad"), "HTTP 422"],
		[async () => scoringReply(200, "not json"), "bad reply"],
	];
	for (const [respond, skipped] of cases) {
		const { bodies, fetchFn } = stub(respond);
		assert.deepEqual(await run(fetchFn, { attempts: BOTH }), { skipped });
		assert.equal(bodies.length, 1);
	}
});

test("a cancel during the first attempt does not fall back", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(hang);
	const controller = new AbortController();
	const routed = run(fetchFn, { attempts: BOTH, signal: controller.signal });
	await time.pass(0);
	controller.abort();
	assert.deepEqual(await time.settled(routed), { skipped: "cancelled" });
	assert.equal(bodies.length, 1);
});

test("the routing limit during the first attempt does not fall back", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(hang);
	const controller = new AbortController();
	const routed = run(fetchFn, { attempts: BOTH, signal: controller.signal });
	await time.pass(0);
	controller.abort(LIMIT_REACHED);
	assert.deepEqual(await time.settled(routed), { skipped: "timeout" });
	assert.equal(bodies.length, 1);
});

test("one routing limit covers both attempts", async (t) => {
	const time = fakeTime(t);
	const controller = new AbortController();
	const { bodies, fetchFn } = stub((init, count) =>
		count === 1
			? Promise.resolve(scoringReply(503, "down", NO_WAIT))
			: hang(init, count),
	);
	const routed = run(fetchFn, {
		attempts: BOTH,
		signal: controller.signal,
	});
	await time.pass(0);
	assert.equal(bodies.length, 2);
	controller.abort(LIMIT_REACHED);
	assert.deepEqual(await time.settled(routed), {
		skipped: "typesafe HTTP 503, openrouter timeout",
	});
});

test("two failed attempts send at most four requests and name both providers", async () => {
	const { bodies, fetchFn } = stub(async () =>
		scoringReply(503, "down", NO_WAIT),
	);
	assert.deepEqual(await run(fetchFn, { attempts: BOTH }), {
		skipped: "typesafe HTTP 503, openrouter HTTP 503",
	});
	assert.equal(bodies.length, 4);
});

test("a bad reply after a fallback names both providers", async () => {
	const { fetchFn } = stub(async (_init, count) =>
		count === 1
			? scoringReply(429, "slow", NO_WAIT)
			: scoringReply(200, "not json"),
	);
	assert.deepEqual(await run(fetchFn, { attempts: BOTH }), {
		skipped: "typesafe HTTP 429, openrouter bad reply",
	});
});

test("a single-provider failure that allows fallback keeps its bare reason", async () => {
	const { bodies, fetchFn } = stub(async () =>
		scoringReply(503, "down", NO_WAIT),
	);
	assert.deepEqual(await run(fetchFn), { skipped: "HTTP 503" });
	assert.equal(bodies.length, 3);
});

const DECISION = {
	parts: {
		tier: { level: 2, probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 } },
		work: { level: 1, probabilities: { 0: 0.1, 1: 0.8, 2: 0.1 } },
	},
	holder: "typesafe",
	model: "jev-1.14.0",
	usage: { input_tokens: 120, output_tokens: 8 },
};

test("tier and work send the System One body as one string", async () => {
	const { bodies, fetchFn } = answering(VALID);
	await run(fetchFn);
	assert.equal(
		bodies[0],
		'{"state":{"role":"coder","description":"Fix it","task":"Fix the bug."},"model":"jev-test",' +
			'"questions":{"tier":{"type":"score",' +
			'"instructions":"How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller\'s one-line summary of the task.",' +
			'"criteria":[' +
			'"Lookup or transcription: the brief names the exact files to read or string to find, or holds the exact code, config or prose to write. It gives the commands to run and the check that proves the work done. No choice is left.",' +
			'"Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.",' +
			'"Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause."]},' +
			'"work":{"type":"score",' +
			'"instructions":"How much work does completing `task` take for an agent whose role is `role`, once the judgment is settled? Count the steps, the files and the edge cases to verify.",' +
			'"criteria":[' +
			'"A short task: one or two mechanical steps in one place, nothing to diagnose, and the given command is the whole check.",' +
			'"An ordinary task: reading or diagnosing code, a few steps or files, and a result to verify.",' +
			'"A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right."]}}}',
	);
});

// One row per endpoint: the gateway that plans it, its address, and its key header as sent.
const ADDRESSES: readonly [
	gateway: Gateway,
	address: string,
	authorization: string,
][] = [
	["direct", "https://api.typesafe.ai/v1/systemone", "Bearer test-key"],
	[
		"openrouter",
		"https://openrouter.ai/api/v1/systemone",
		"Bearer test-openrouter-key",
	],
];

for (const [gateway, address, authorization] of ADDRESSES)
	test(`${gateway} sends its key to its own address in one header`, async () => {
		const { sent, bodies, inits, fetchFn } = answering(VALID);
		await run(fetchFn, {
			attempts: plan({ provider: "typesafe", gateway }, KEYS),
		});
		assert.deepEqual(sent, [`${address} ${authorization}`]);
		assert.equal(JSON.parse(bodies[0] ?? "").model, "jev-latest");
		assert.deepEqual(inits[0]?.headers, {
			Authorization: authorization,
			Accept: "application/json",
			"Content-Type": "application/json",
			"User-Agent":
				"model-router/dev (+https://github.com/Akurganow/model-router)",
		});
	});

test("a status gives HTTP n after one request, or after three when it is retried", async (t) => {
	const time = fakeTime(t);
	const cases: [number, string, number][] = [
		[400, "HTTP 400", 1],
		[402, "HTTP 402", 1],
		[403, "HTTP 403", 1],
		[404, "HTTP 404", 1],
		[422, "HTTP 422", 1],
		[499, "HTTP 499", 1],
		[408, "HTTP 408", 3],
		[429, "HTTP 429", 3],
		[500, "HTTP 500", 3],
		[599, "HTTP 599", 3],
	];
	for (const [status, skipped, requests] of cases) {
		const { bodies, fetchFn } = stub(async () => scoringReply(status, "x"));
		const routed = run(fetchFn);
		await time.pass(BACKOFFS_MS);
		assert.deepEqual(await time.settled(routed), { skipped });
		assert.equal(bodies.length, requests);
	}
});

test("a status that falls back gives the next provider's decision, any other ends the call", async (t) => {
	const time = fakeTime(t);
	const fellBack = (reason: string) => ({
		...DECISION,
		holder: "openrouter",
		firstFailed: { holder: "typesafe", reason },
	});
	const cases: [number, unknown, number][] = [
		[401, fellBack("HTTP 401"), 2],
		[402, fellBack("HTTP 402"), 2],
		[403, fellBack("HTTP 403"), 2],
		[404, fellBack("HTTP 404"), 2],
		[408, fellBack("HTTP 408"), 2],
		[500, fellBack("HTTP 500"), 2],
		[599, fellBack("HTTP 599"), 2],
		[499, { skipped: "HTTP 499" }, 1],
	];
	for (const [status, expected, requests] of cases) {
		const { bodies, fetchFn } = stub(async (_init, count) =>
			count === 1 ? scoringReply(status, "x") : scoringReply(200, VALID),
		);
		const routed = run(fetchFn, { attempts: BOTH });
		await time.pass(BACKOFFS_MS);
		assert.deepEqual(await time.settled(routed), expected, String(status));
		assert.equal(bodies.length, requests, String(status));
	}
});

test("the first of two attempts times out at 2000 ms and falls back", async (t) => {
	const time = fakeTime(t);
	const { bodies, inits, fetchFn } = stub((init, count) =>
		count === 1 ? hang(init, count) : Promise.resolve(scoringReply(200, VALID)),
	);
	const routed = run(fetchFn, { attempts: BOTH });
	await time.pass(1999);
	assert.equal(bodies.length, 1);
	assert.equal(inits[0]?.signal?.aborted, false);
	await time.pass(1);
	assert.equal(bodies.length, 2);
	assert.equal(inits[0]?.signal?.aborted, true);
	assert.equal(
		asDecision(await time.settled(routed)).firstFailed?.reason,
		"timeout",
	);
});

test("each request of the last attempt times out at 10000 ms", async (t) => {
	const time = fakeTime(t);
	const { bodies, inits, at, fetchFn } = stub(hang);
	const routed = run(fetchFn);
	await time.pass(9999);
	assert.equal(bodies.length, 1);
	assert.equal(inits[0]?.signal?.aborted, false);
	await time.pass(1);
	assert.equal(inits[0]?.signal?.aborted, true);
	assert.equal(bodies.length, 1);
	await time.pass(3 * 10000 + BACKOFFS_MS - 10000);
	assert.equal(bodies.length, 3);
	const [first = 0, second = 0, third = 0] = at;
	const [gap1, gap2] = [second - first, third - second];
	assert.ok(gap1 >= 10375 && gap1 <= 10500, `second request after ${gap1} ms`);
	assert.ok(gap2 >= 10750 && gap2 <= 11000, `third request after ${gap2} ms`);
	assert.deepEqual(await time.settled(routed), { skipped: "timeout" });
});

test("the last attempt of a plan times out at 10000 ms", async (t) => {
	const time = fakeTime(t);
	const { bodies, inits, fetchFn } = stub((init, count) =>
		count === 1
			? Promise.resolve(scoringReply(503, "down", NO_WAIT))
			: hang(init, count),
	);
	const controller = new AbortController();
	const routed = run(fetchFn, { attempts: BOTH, signal: controller.signal });
	await time.pass(0);
	assert.equal(bodies.length, 2);
	await time.pass(9999);
	assert.equal(inits[1]?.signal?.aborted, false);
	await time.pass(1);
	assert.equal(inits[1]?.signal?.aborted, true);
	controller.abort();
	assert.deepEqual(await time.settled(routed), {
		skipped: "typesafe HTTP 503, openrouter cancelled",
	});
});

test("a fetch that ignores its signal ends at the attempt timeout and falls back", {
	timeout: 2000,
}, async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub((_init, count) =>
		count === 1
			? new Promise<Response>(() => undefined)
			: Promise.resolve(scoringReply(200, VALID)),
	);
	const routed = run(fetchFn, { attempts: BOTH });
	await time.pass(2000);
	assert.equal(bodies.length, 2);
	assert.equal(
		asDecision(await time.settled(routed)).firstFailed?.reason,
		"timeout",
	);
});

test("a signal aborted before the call is cancelled and sends no request", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = answering(VALID);
	const controller = new AbortController();
	controller.abort();
	assert.deepEqual(
		await time.settled(run(fetchFn, { signal: controller.signal })),
		{
			skipped: "cancelled",
		},
	);
	assert.equal(bodies.length, 0);
});

test("a reply whose text never arrives ends at the attempt timeout", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async (_init, count) =>
		count === 1 ? stalledReply() : scoringReply(200, VALID),
	);
	const routed = run(fetchFn, { attempts: BOTH });
	await time.pass(1999);
	assert.equal(bodies.length, 1);
	await time.pass(1);
	assert.equal(bodies.length, 2);
	assert.equal(
		asDecision(await time.settled(routed)).firstFailed?.reason,
		"timeout",
	);
});

test("a network error is retried after 375–500 ms and then 750–1000 ms", async (t) => {
	const time = fakeTime(t);
	const { bodies, at, fetchFn } = stub(async () => {
		throw new TypeError("fetch failed");
	});
	const routed = run(fetchFn);
	await time.pass(BACKOFFS_MS);
	assert.equal(bodies.length, 3);
	const [first = 0, second = 0, third = 0] = at;
	const [gap1, gap2] = [second - first, third - second];
	assert.ok(gap1 >= 375 && gap1 <= 500, `first wait ${gap1} ms`);
	assert.ok(gap2 >= 750 && gap2 <= 1000, `second wait ${gap2} ms`);
	assert.deepEqual(await time.settled(routed), { skipped: "network error" });
});

test("retry-after: 2 sets the wait to 2000 ms", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async (_init, count) =>
		count === 1
			? scoringReply(503, "x", { "retry-after": "2" })
			: scoringReply(200, VALID),
	);
	const routed = run(fetchFn);
	await time.pass(1999);
	assert.equal(bodies.length, 1);
	await time.pass(1);
	assert.equal(bodies.length, 2);
	asDecision(await time.settled(routed));
});

test("a Retry-After date sets the wait until that date", async (t) => {
	const time = fakeTime(t);
	// The clock stands at 2000 ms when the reply arrives, so the wait is the date minus now.
	await time.pass(2000);
	const { bodies, fetchFn } = stub(async (_init, count) =>
		count === 1
			? scoringReply(503, "x", {
					"retry-after": "Thu, 01 Jan 1970 00:00:07 GMT",
				})
			: scoringReply(200, VALID),
	);
	const routed = run(fetchFn);
	await time.pass(4999);
	assert.equal(bodies.length, 1);
	await time.pass(1);
	assert.equal(bodies.length, 2);
	asDecision(await time.settled(routed));
});

test("retry-after-ms: 60000 is waited out", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async (_init, count) =>
		count === 1
			? scoringReply(503, "x", { "retry-after-ms": "60000" })
			: scoringReply(200, VALID),
	);
	const routed = run(fetchFn);
	await time.pass(59999);
	assert.equal(bodies.length, 1);
	await time.pass(1);
	assert.equal(bodies.length, 2);
	asDecision(await time.settled(routed));
});

test("retry-after-ms: 60001 falls back to backoff", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async (_init, count) =>
		count === 1
			? scoringReply(503, "x", { "retry-after-ms": "60001" })
			: scoringReply(200, VALID),
	);
	const routed = run(fetchFn);
	await time.pass(374);
	assert.equal(bodies.length, 1);
	await time.pass(126);
	assert.equal(bodies.length, 2);
	asDecision(await time.settled(routed));
});

test("an unusable Retry-After falls back to backoff", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async (_init, count) =>
		count === 1
			? scoringReply(503, "x", { "retry-after": "soon" })
			: scoringReply(200, VALID),
	);
	const routed = run(fetchFn);
	await time.pass(374);
	assert.equal(bodies.length, 1);
	await time.pass(126);
	assert.equal(bodies.length, 2);
	asDecision(await time.settled(routed));
});

test("an abort during a backoff is cancelled and sends no second request", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async () => scoringReply(500, "x"));
	const controller = new AbortController();
	const routed = run(fetchFn, { signal: controller.signal });
	await time.pass(100);
	controller.abort();
	await time.pass(1000);
	assert.equal(bodies.length, 1);
	assert.deepEqual(await time.settled(routed), { skipped: "cancelled" });
});

test("an abort while the reply text is read is cancelled", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async () => stalledReply());
	const controller = new AbortController();
	const routed = run(fetchFn, { signal: controller.signal });
	await time.pass(100);
	controller.abort();
	assert.equal(bodies.length, 1);
	assert.deepEqual(await time.settled(routed), { skipped: "cancelled" });
});

test("a 400 whose body read rejects ends the call and does not fall back", async () => {
	const { sent, fetchFn } = stub(async () => brokenReply(400));
	assert.deepEqual(await run(fetchFn, { attempts: BOTH }), {
		skipped: "HTTP 400",
	});
	assert.deepEqual(sent, [
		`https://api.typesafe.ai/v1/systemone Bearer ${KEY}`,
	]);
});

test("a 400 whose body never ends ends the call at the attempt timeout and does not fall back", async (t) => {
	const time = fakeTime(t);
	const { sent, fetchFn } = stub(async () => stalledReply(400));
	const routed = run(fetchFn, { attempts: BOTH });
	await time.pass(2000);
	assert.deepEqual(await time.settled(routed), { skipped: "HTTP 400" });
	assert.deepEqual(sent, [
		`https://api.typesafe.ai/v1/systemone Bearer ${KEY}`,
	]);
});

test("a 200 whose body read rejects is a network error after three requests", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async () => brokenReply(200));
	const routed = run(fetchFn);
	await time.pass(BACKOFFS_MS);
	assert.deepEqual(await time.settled(routed), { skipped: "network error" });
	assert.equal(bodies.length, 3);
});

test("an abort while the text of a 400 is read is cancelled", async (t) => {
	const time = fakeTime(t);
	const { bodies, fetchFn } = stub(async () => stalledReply(400));
	const controller = new AbortController();
	const routed = run(fetchFn, { signal: controller.signal });
	await time.pass(100);
	controller.abort();
	assert.equal(bodies.length, 1);
	assert.deepEqual(await time.settled(routed), { skipped: "cancelled" });
});

type Exit = {
	readonly exit: string;
	readonly attempts?: Attempt[];
	readonly respond: Respond;
	readonly passMs: number;
	readonly abort?: "cancel";
	readonly expected: unknown;
};

const EXITS: readonly Exit[] = [
	{
		exit: "a decision",
		respond: async () => scoringReply(200, VALID),
		passMs: 0,
		expected: DECISION,
	},
	{
		exit: "a failure with no retry",
		respond: async () => scoringReply(401, { error: "no" }),
		passMs: 0,
		expected: { skipped: "HTTP 401" },
	},
	{
		exit: "a failure after retries",
		respond: async () => {
			throw new TypeError("fetch failed");
		},
		passMs: BACKOFFS_MS,
		expected: { skipped: "network error" },
	},
	{
		exit: "a cancel while a request hangs",
		respond: hang,
		passMs: 0,
		abort: "cancel",
		expected: { skipped: "cancelled" },
	},
	{
		exit: "an attempt timeout that falls back",
		attempts: BOTH,
		respond: (init, count) =>
			count === 1
				? hang(init, count)
				: Promise.resolve(scoringReply(200, VALID)),
		passMs: 2000,
		expected: {
			...DECISION,
			holder: "openrouter",
			firstFailed: { holder: "typesafe", reason: "timeout" },
		},
	},
	{
		exit: "attempt timeouts to the end",
		respond: hang,
		passMs: 3 * 10000 + BACKOFFS_MS,
		expected: { skipped: "timeout" },
	},
	{
		exit: "an abort during a backoff",
		respond: async () => scoringReply(500, "x"),
		passMs: 100,
		abort: "cancel",
		expected: { skipped: "cancelled" },
	},
];

for (const exit of EXITS) {
	test(`${exit.exit} leaves no listener on the caller's signal and no live timer`, async (t) => {
		const time = fakeTime(t);
		const controller = new AbortController();
		const { fetchFn } = stub(exit.respond);
		const routed = run(fetchFn, {
			...(exit.attempts && { attempts: exit.attempts }),
			signal: controller.signal,
		});
		await time.pass(exit.passMs);
		if (exit.abort === "cancel") controller.abort();
		assert.deepEqual(await time.settled(routed), exit.expected);
		assert.equal(getEventListeners(controller.signal, "abort").length, 0);
		assert.equal(time.live(), 0);
	});
}
