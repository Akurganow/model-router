import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildPrompt, DEFAULT_ROLE, ROLE_CAP } from "../../core/brief.ts";
import { ROUTING_LIMIT_MS } from "../../core/compose.ts";
import { createFakeClock } from "../../utils/fake-clock.ts";
import { createScriptedJev, type Step } from "./fakes.ts";
import { answerModels } from "./models.ts";
import { readRequest } from "./request.ts";
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
				unresolvedLine:
					"model-router L2 large model unresolved · high · p=0.90/0.90 · jev jev-1.14.0 · 812/9 tok",
			});
		});
});

describe("the slot and model each level takes", () => {
	const SUFFIX = " · jev jev-1.14.0 · 812/9 tok";
	const line = (tier: number, target: string, effort: string) =>
		`model-router L${tier} ${target} · ${effort} · p=0.90/0.90${SUFFIX}`;

	// Each level reads its own slot only, and a slot with no model still gets the ladder's effort.
	// A slot with a model also gets the line Python prints when its check fails.
	// The ladder's effort at work level 1 is high at level 0 and medium at the other levels.
	const ROWS: readonly [0 | 1 | 2, string, object, object][] = [
		[
			0,
			"the small model",
			{ small: "openai/small" },
			{
				outcome: "route",
				slot: "small",
				effort: "high",
				line: line(0, "openai/small", "high"),
				unresolvedLine: line(0, "small model unresolved", "high"),
			},
		],
		[
			0,
			"no model",
			{},
			{
				outcome: "route",
				slot: "small",
				effort: "high",
				line: line(0, "small model unset", "high"),
				unresolvedLine: null,
			},
		],
		[
			1,
			"the middle model",
			{ middle: "openai/middle" },
			{
				outcome: "route",
				slot: "middle",
				effort: "medium",
				line: line(1, "openai/middle", "medium"),
				unresolvedLine: line(1, "middle model unresolved", "medium"),
			},
		],
		[
			1,
			"the small and large models",
			{ small: "openai/small", large: "openai/large" },
			{
				outcome: "route",
				slot: "middle",
				effort: "medium",
				line: line(1, "middle model unset", "medium"),
				unresolvedLine: null,
			},
		],
		[
			2,
			"the large model",
			{ large: "openai/large" },
			{
				outcome: "route",
				slot: "large",
				effort: "medium",
				line: line(2, "openai/large", "medium"),
				unresolvedLine: line(2, "large model unresolved", "medium"),
			},
		],
		[
			2,
			"no model",
			{},
			{
				outcome: "route",
				slot: "large",
				effort: "medium",
				line: line(2, "large model unset", "medium"),
				unresolvedLine: null,
			},
		],
	];

	for (const [tier, name, models, expected] of ROWS)
		it(`level ${tier} with ${name} gives ${JSON.stringify(expected)}`, async () => {
			const steps = [
				{ host: "api.typesafe.ai", reply: { levels: { tier, work: 1 } } },
			] satisfies Step[];
			const { response, jev } = run({ ...REQUEST, models }, steps);
			assert.deepEqual(await response, expected);
			assert.deepEqual(jev.hosts, ["api.typesafe.ai"]);
		});
});

describe("the models of a request", () => {
	const models = (raw: unknown) => (readRequest(raw) ?? assert.fail()).models;

	for (const [name, value] of [
		["blank", ""],
		["spaces", "   "],
		["null", null],
	] as const)
		it(`a model that is ${name} is undefined, in every slot`, () => {
			assert.deepEqual(models({ models: { middle: value } }).middle, undefined);
			assert.deepEqual(models({ models: { small: value } }).small, undefined);
			assert.deepEqual(models({ models: { large: value } }).large, undefined);
		});

	it("a missing middle model is undefined, and the others keep theirs, trimmed", () => {
		assert.deepEqual(models({ models: { small: " a/s ", large: "a/l" } }), {
			small: "a/s",
			middle: undefined,
			large: "a/l",
		});
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

const MODELS_FIXTURE = JSON.parse(
	readFileSync(join(FIXTURES, "models", "listing.json"), "utf8"),
) as { request: unknown; response: unknown };

describe("the models operation", () => {
	const words = (listed: unknown) => answerModels({ op: "models", listed });

	it("joins provider and model and words prices and context where the entry has them", () => {
		assert.deepEqual(
			words([
				{
					provider: "openrouter",
					model: "a/b",
					input: 1,
					output: 5,
					context: 200000,
				},
				{ provider: "anthropic", model: "claude-x", context: 1000000 },
				{ provider: "xai", model: "grok", input: 0.5 },
				{ provider: "deepseek", model: "deepseek-flash" },
			]),
			{
				text: "models the person can run: 4\n- openrouter/a/b ($1 in, $5 out per 1M tokens, 200K context)\n- anthropic/claude-x (1M context)\n- xai/grok ($0.5 in per 1M tokens)\n- deepseek/deepseek-flash",
			},
		);
	});

	it("drops an entry with a bad id or no provider or model, and keeps an id with a tilde", () => {
		assert.deepEqual(
			words([
				{ provider: "openrouter", model: "a b" },
				{ provider: "openrouter", model: "a\nb" },
				{ provider: "", model: "m" },
				{ provider: "p" },
				{ model: "m" },
				{ provider: 1, model: "m" },
				null,
				"p/m",
				["p", "m"],
				{ provider: "p", model: "kept" },
				{ provider: "openrouter", model: "~vendor/latest" },
			]),
			{
				text: "models the person can run: 2\n- p/kept\n- openrouter/~vendor/latest",
			},
		);
	});

	it("drops a number that is not a known price or context and keeps the model", () => {
		assert.deepEqual(
			words([
				{ provider: "p", model: "m", input: "1", output: -1, context: null },
			]),
			{ text: "models the person can run: 1\n- p/m" },
		);
	});

	it("answers an empty list, and a list that is not an array, with no model", () => {
		for (const listed of [[], undefined, null, "p/m", { provider: "p" }])
			assert.deepEqual(words(listed), {
				text: "models the person can run: 0",
			});
	});

	it("leaves a request with no models op to routing", () => {
		for (const raw of [
			REQUEST,
			{ ...REQUEST, op: "route" },
			{ ...REQUEST, op: "Models" },
			{ listed: [] },
			null,
			[],
			"models",
		])
			assert.equal(answerModels(raw), undefined);
	});

	it("answers the fixture both sides replay", () => {
		assert.deepEqual(
			answerModels(MODELS_FIXTURE.request),
			MODELS_FIXTURE.response,
		);
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

	it("answers the models op with its text and exits 0", () => {
		const result = call(JSON.stringify(MODELS_FIXTURE.request));
		assert.equal(result.status, 0);
		assert.equal(result.stdout, `${JSON.stringify(MODELS_FIXTURE.response)}\n`);
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
