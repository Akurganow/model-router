import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildPrompt, DEFAULT_ROLE, ROLE_CAP } from "../../core/brief.ts";
import { ROUTING_LIMIT_MS } from "../../core/compose.ts";
import { createFakeClock } from "../../utils/fake-clock.ts";
import { createScriptedJev, type Step } from "./fakes.ts";
import { readRequest, slotModels } from "./request.ts";
import { routeRequest } from "./route.ts";

const FIXTURES = join(
	import.meta.dirname,
	"..",
	"..",
	"..",
	"plugins",
	"model-router-hermes",
	"tests",
	"fixtures",
);
type Fixture = {
	description: string;
	request: unknown;
	jev: Step[];
	response: unknown;
};
const fixtures = readdirSync(FIXTURES)
	.filter((name) => name.endsWith(".json"))
	.sort()
	.map((name) => ({
		name,
		fixture: JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Fixture,
	}));

function run(request: unknown, steps: readonly Step[]) {
	const time = createFakeClock();
	const jev = createScriptedJev(steps, time.fire);
	const response = routeRequest(request, {
		fetchFn: jev.fetch,
		clock: time.clock,
	});
	return { response, jev, time };
}

describe("protocol fixtures", () => {
	it("holds the cases the protocol names", () => {
		const names = fixtures.map(({ name }) => name.replace(/\.json$/, ""));
		for (const wanted of [
			"l0-routed",
			"l1-routed",
			"l2-routed",
			"config-effort-l0",
			"small-model-unset",
			"large-model-unset",
			"key-unset",
			"bad-reply",
			"timeout",
			"fallback-auto",
			"caller-effort-l2",
			"caller-effort-over-config",
			"description-sent",
		])
			assert.ok(names.includes(wanted), wanted);
	});

	for (const { name, fixture } of fixtures)
		it(`${name}: ${fixture.description}`, async () => {
			const { response, jev, time } = run(fixture.request, fixture.jev);
			assert.deepEqual(await response, fixture.response);
			assert.deepEqual(
				jev.hosts,
				fixture.jev.map((step) => step.host),
			);
			const { budgetMs } = fixture.request as { budgetMs?: number };
			const timed = typeof budgetMs === "number" && budgetMs > 0;
			assert.deepEqual(time.delays(), timed ? [budgetMs] : []);
			assert.equal(time.live(), 0);
		});
});

const REQUEST = {
	task: "Rename the helper.",
	context: "The helper lives in util.ts.",
	provider: "typesafe",
	keys: { typesafe: "typesafe-key" },
	budgetMs: ROUTING_LIMIT_MS,
	models: { small: "openai/small", large: "openai/large" },
	unresolved: [],
	keptEffort: null,
	description: "Rename one helper",
};
const FAILED_SKIP = { outcome: "skip", line: "model-router skipped, failed" };
const ONE = [
	{ host: "api.typesafe.ai", reply: { levels: { tier: 1, work: 1 } } },
] satisfies Step[];

describe("the request to Jev", () => {
	it("asks once for both parts, with the default role and the task and context", async () => {
		const { response, jev } = run(REQUEST, ONE);
		await response;
		assert.equal(jev.bodies.length, 1);
		const [body] = jev.bodies as {
			state: unknown;
			questions: Record<string, unknown>;
		}[];
		assert.deepEqual(Object.keys(body?.questions ?? {}), ["tier", "work"]);
		assert.deepEqual(body?.state, {
			role: DEFAULT_ROLE,
			description: REQUEST.description,
			task: buildPrompt(REQUEST.task, REQUEST.context),
		});
	});

	it("masks a key and cuts an over-long text in the description", async () => {
		for (const [description, sent] of [
			[
				"Fix the deploy, TOKEN=abc123def456 in .env",
				"Fix the deploy, TOKEN=*** in .env",
			],
			["x".repeat(100_000), "x".repeat(ROLE_CAP)],
			["  two\n\n  lines  ", "two lines"],
		]) {
			const { response, jev } = run({ ...REQUEST, description }, ONE);
			await response;
			const [body] = jev.bodies as { state: { description: unknown } }[];
			assert.equal(body?.state.description, sent);
		}
	});

	for (const description of [undefined, null, 7, ["a"], { a: 1 }, "  "])
		it(`sends an empty description for a description of ${JSON.stringify(description)}`, async () => {
			const { response, jev } = run({ ...REQUEST, description }, ONE);
			await response;
			const [body] = jev.bodies as { state: { description: unknown } }[];
			assert.equal(body?.state.description, "");
		});

	it("masks a key shaped string in the task", async () => {
		const { response, jev } = run(
			{ ...REQUEST, task: "use API_KEY=Zq9fK2mTvvQ8 here", context: "" },
			ONE,
		);
		await response;
		assert.doesNotMatch(JSON.stringify(jev.bodies), /Zq9fK2mTvvQ8/);
	});

	it("does not send a key for a provider the value forbids", async () => {
		const { response, jev } = run(
			{ ...REQUEST, keys: { typesafe: "typesafe-key", openrouter: "o-key" } },
			ONE,
		);
		await response;
		assert.deepEqual(jev.hosts, ["api.typesafe.ai"]);
	});
});

describe("the kept effort", () => {
	const L2 = [
		{ host: "api.typesafe.ai", reply: { levels: { tier: 2, work: 2 } } },
	] satisfies Step[];

	for (const keptEffort of [undefined, "Config", true, 1, null])
		it(`reads ${JSON.stringify(keptEffort)} as no kept effort`, async () => {
			const { response } = run({ ...REQUEST, keptEffort }, L2);
			assert.deepEqual(await response, {
				outcome: "route",
				slot: "large",
				effort: "high",
				line: "model-router L2 openai/large · high · p=0.90/0.90 · jev jev-1.14.0 · 812/9 tok",
			});
		});
});

describe("the slot and model each level takes", () => {
	const SUFFIX = " · jev jev-1.14.0 · 812/9 tok";
	const MODELS = {
		small: "openai/small",
		middle: "openai/middle",
		large: "openai/large",
	};

	const route = (
		tier: number,
		slot: string,
		target: string,
		effort: string,
	) => ({
		outcome: "route",
		slot,
		effort,
		line: `model-router L${tier} ${target} · ${effort} · p=0.90/0.90${SUFFIX}`,
	});

	// Each level reads its own slot only, and a slot with no model still gets the ladder's effort.
	// The ladder's effort at work level 1 is high at level 0 and medium at the other levels.
	const ROWS: readonly [0 | 1 | 2, string, object, object][] = [
		[
			0,
			"the small model",
			{ small: MODELS.small },
			route(0, "small", "openai/small", "high"),
		],
		[0, "no model", {}, route(0, "small", "small model unset", "high")],
		[
			0,
			"the small model unresolved",
			{ models: MODELS, unresolved: ["small"] },
			route(0, "small", "small model unresolved", "high"),
		],
		[
			1,
			"the middle model",
			{ middle: MODELS.middle },
			route(1, "middle", "openai/middle", "medium"),
		],
		[
			1,
			"the small and large models",
			{ small: MODELS.small, large: MODELS.large },
			route(1, "middle", "middle model unset", "medium"),
		],
		[
			1,
			"the middle model unresolved",
			{ models: MODELS, unresolved: ["middle"] },
			route(1, "middle", "middle model unresolved", "medium"),
		],
		[
			2,
			"the large model",
			{ large: MODELS.large },
			route(2, "large", "openai/large", "medium"),
		],
		[2, "no model", {}, route(2, "large", "large model unset", "medium")],
		[
			2,
			"the large model unresolved",
			{ models: MODELS, unresolved: ["large"] },
			route(2, "large", "large model unresolved", "medium"),
		],
	];

	for (const [tier, name, given, expected] of ROWS)
		it(`level ${tier} with ${name} gives ${JSON.stringify(expected)}`, async () => {
			const steps = [
				{ host: "api.typesafe.ai", reply: { levels: { tier, work: 1 } } },
			] satisfies Step[];
			const fields = "models" in given ? given : { models: given };
			const { response, jev } = run({ ...REQUEST, ...fields }, steps);
			assert.deepEqual(await response, expected);
			assert.deepEqual(jev.hosts, ["api.typesafe.ai"]);
		});
});

describe("the slots of a request", () => {
	const UNSET = { state: "unset" };
	const models = (raw: unknown) =>
		slotModels(readRequest(raw) ?? assert.fail());

	for (const [name, value] of [
		["blank", ""],
		["spaces", "   "],
		["null", null],
	] as const)
		it(`a middle model that is ${name} is unset`, () => {
			assert.deepEqual(models({ models: { middle: value } }).middle, UNSET);
			assert.deepEqual(models({ models: { small: value } }).small, UNSET);
			assert.deepEqual(models({ models: { large: value } }).large, UNSET);
		});

	it("a missing middle model is unset, and the others keep theirs", () => {
		assert.deepEqual(models({ models: { small: " a/s ", large: "a/l" } }), {
			small: { state: "set", model: "a/s" },
			middle: UNSET,
			large: { state: "set", model: "a/l" },
		});
	});

	for (const [name, unresolved] of [
		["missing", undefined],
		["null", null],
		["a string", "middle"],
		["an object", { middle: true }],
	] as const)
		it(`an unresolved list that is ${name} names no slot`, () => {
			assert.deepEqual(
				models({ models: { middle: "a/m" }, unresolved }).middle,
				{ state: "set", model: "a/m" },
			);
		});

	it("an unresolved list keeps the slot names it knows, once each", () => {
		const read = readRequest({
			models: {},
			unresolved: ["large", "medium", "", "   ", null, 2, "large", "small"],
		});
		assert.deepEqual(read?.unresolved, ["small", "large"]);
		assert.deepEqual(slotModels(read ?? assert.fail()), {
			small: { state: "unresolved" },
			middle: UNSET,
			large: { state: "unresolved" },
		});
	});

	it("an unresolved slot stays unresolved when a model comes with it", () => {
		assert.deepEqual(
			models({ models: { large: "a/l" }, unresolved: ["large"] }).large,
			{ state: "unresolved" },
		);
	});
});

describe("failures", () => {
	for (const raw of [undefined, null, 7, "text", []])
		it(`a request of ${JSON.stringify(raw)} gives the failed skip`, async () => {
			const { response, jev } = run(raw, []);
			assert.deepEqual(await response, {
				outcome: "skip",
				line: "model-router skipped, failed",
			});
			assert.deepEqual(jev.hosts, []);
		});

	it("gives the failed skip when reading the request throws", async () => {
		const hostile = {
			...REQUEST,
			get task(): string {
				throw new Error("hostile getter");
			},
		};
		const { response, jev } = run(hostile, ONE);
		assert.deepEqual(await response, {
			outcome: "skip",
			line: "model-router skipped, failed",
		});
		assert.deepEqual(jev.hosts, []);
	});

	for (const budgetMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "8000"])
		it(`a budget of ${String(budgetMs)} is a protocol fault with no request`, async () => {
			const { response, jev } = run({ ...REQUEST, budgetMs }, ONE);
			assert.deepEqual(await response, FAILED_SKIP);
			assert.deepEqual(jev.hosts, []);
		});

	it("a missing budget is a protocol fault with no request", async () => {
		const { budgetMs: _omitted, ...withoutBudget } = REQUEST;
		const { response, jev } = run(withoutBudget, ONE);
		assert.deepEqual(await response, FAILED_SKIP);
		assert.deepEqual(jev.hosts, []);
	});

	it("gives the failed skip, not a timeout, when scoring rejects", async () => {
		const deps = {
			clock: createFakeClock().clock,
			get fetchFn(): never {
				throw new Error("fetch unavailable");
			},
		};
		assert.deepEqual(await routeRequest(REQUEST, deps), FAILED_SKIP);
	});

	it("aborts the request in flight when the budget runs out", async () => {
		const time = createFakeClock();
		let sent: AbortSignal | null | undefined;
		const response = routeRequest(REQUEST, {
			fetchFn: (_url, init) => {
				sent = init?.signal;
				return new Promise<never>(() => {});
			},
			clock: time.clock,
		});
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(sent?.aborted, false);
		time.fire();
		assert.equal(sent?.aborted, true);
		assert.deepEqual(await response, {
			outcome: "skip",
			line: "model-router skipped, timeout",
		});
	});

	it("never lets a key reach the response", async () => {
		const { response } = run({ ...REQUEST, keys: { typesafe: "k-9f3" } }, [
			{ host: "api.typesafe.ai", reply: { status: 401 } },
		]);
		assert.doesNotMatch(JSON.stringify(await response), /k-9f3/);
	});
});

describe("the entry", () => {
	const entry = join(import.meta.dirname, "index.ts");
	const call = (input: string) =>
		spawnSync(process.execPath, [entry], { input, encoding: "utf8" });

	it("answers one JSON line and exits 0 for a request", () => {
		const result = call(JSON.stringify({ ...REQUEST, keys: {} }));
		assert.equal(result.status, 0);
		assert.equal(
			result.stdout,
			`${JSON.stringify({ outcome: "skip", line: "model-router skipped, key unset" })}\n`,
		);
	});

	for (const input of ["", "not json", "[1"])
		it(`answers the failed skip and exits 0 for ${JSON.stringify(input)}`, () => {
			const result = call(input);
			assert.equal(result.status, 0);
			assert.equal(
				result.stdout,
				`${JSON.stringify({ outcome: "skip", line: "model-router skipped, failed" })}\n`,
			);
		});
});
