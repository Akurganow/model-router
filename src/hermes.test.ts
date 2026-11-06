import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildPrompt, DEFAULT_ROLE } from "./brief.ts";
import { ROUTING_LIMIT_MS } from "./compose.ts";
import { createFakeClock } from "./fake-clock.ts";
import { createScriptedJev, type Step } from "./hermes-fakes.ts";
import { routeRequest } from "./hermes-route.ts";

const FIXTURES = join(
	import.meta.dirname,
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
	smallModel: "openai/small",
	largeModel: "openai/large",
	configEffort: false,
};
const FAILED_SKIP = { outcome: "skip", line: "skipped, failed" };
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
			description: "",
			task: buildPrompt(REQUEST.task, REQUEST.context),
		});
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

describe("failures", () => {
	for (const raw of [undefined, null, 7, "text", []])
		it(`a request of ${JSON.stringify(raw)} gives the failed skip`, async () => {
			const { response, jev } = run(raw, []);
			assert.deepEqual(await response, {
				outcome: "skip",
				line: "skipped, failed",
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
			line: "skipped, failed",
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

	it("gives the timeout skip when the run outlasts the budget", async () => {
		const { response } = run(REQUEST, [
			{ host: "api.typesafe.ai", reply: "hang" },
		]);
		assert.deepEqual(await response, {
			outcome: "skip",
			line: "skipped, timeout",
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
	const entry = join(import.meta.dirname, "hermes.ts");
	const call = (input: string) =>
		spawnSync(process.execPath, [entry], { input, encoding: "utf8" });

	it("answers one JSON line and exits 0 for a request", () => {
		const result = call(JSON.stringify({ ...REQUEST, keys: {} }));
		assert.equal(result.status, 0);
		assert.equal(
			result.stdout,
			`${JSON.stringify({ outcome: "skip", line: "skipped, key unset" })}\n`,
		);
	});

	for (const input of ["", "not json", "[1"])
		it(`answers the failed skip and exits 0 for ${JSON.stringify(input)}`, () => {
			const result = call(input);
			assert.equal(result.status, 0);
			assert.equal(
				result.stdout,
				`${JSON.stringify({ outcome: "skip", line: "skipped, failed" })}\n`,
			);
		});
});
