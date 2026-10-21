import assert from "node:assert/strict";
import { describe, test } from "node:test";
import extension from "../extension/index.ts";
import {
	ENDPOINT,
	ENV_KEY,
	fixtureEvents,
	jevAnswer,
	REGISTRY_KEY,
	reply,
	setEnv,
	taskEvent,
	tasksOf,
	useWorld,
} from "./helpers.ts";

const world = useWorld();

const TIER_AGENTS = ["router_light", "router_mid", "router_heavy"];
const LIGHT_EFFORTS = ["med", "med", "hi"];
const HEAVIER_EFFORTS = ["lo", "med", "hi"];

describe("surface", () => {
	test("the factory registers one handler, for tool_call", () => {
		const registered: string[] = [];
		extension({ on: (event) => void registered.push(event) });
		assert.deepEqual(registered, ["tool_call"]);
	});
});

describe("routing", () => {
	for (const tier of [0, 1, 2]) {
		for (const work of [0, 1, 2]) {
			test(`tier ${tier}, work ${work} sets agent and effort`, async () => {
				world.fetchWith(() => reply(jevAnswer(tier, work)));
				const result = await world.run({ tasks: [{ task: "Do it" }] });
				const efforts = tier === 0 ? LIGHT_EFFORTS : HEAVIER_EFFORTS;
				assert.deepEqual(tasksOf(result), [
					{ task: "Do it", agent: TIER_AGENTS[tier], effort: efforts[work] },
				]);
			});
		}
	}

	test("a recorded event is rewritten and its other fields stay", async () => {
		for (const event of fixtureEvents()) {
			world.calls.length = 0;
			const before = structuredClone(event.input);
			const result = await world.run(event.input);
			const [item] = (before.tasks as Record<string, unknown>[]) ?? [];
			assert.deepEqual(result?.input, {
				context: "probe",
				tasks: [{ ...item, agent: "router_light", effort: "med" }],
			});
			assert.deepEqual(event.input, before);
		}
	});

	test("role is general-purpose and the item name is the description", async () => {
		const [plain, named] = fixtureEvents();
		await world.run(plain?.input ?? {});
		await world.run(named?.input ?? {});
		assert.deepEqual(
			world.calls.map((c) => [c.body.state.role, c.body.state.description]),
			[
				["general-purpose", ""],
				["general-purpose", "PingTask"],
			],
		);
	});

	test("a caller effort is kept and the line says so", async () => {
		world.fetchWith(() => reply(jevAnswer(2, 2)));
		const result = await world.run({
			tasks: [{ task: "Do it", agent: "task", effort: "lo" }],
		});
		assert.deepEqual(tasksOf(result), [
			{ task: "Do it", agent: "router_heavy", effort: "lo" },
		]);
		assert.match(
			world.notes[0] ?? "",
			/task 1: L2 router_heavy · caller effort · p=/,
		);
	});

	test("the batch makes one notification with one entry per item", async () => {
		world.fetchWith((_call, n) => reply(jevAnswer(n % 3, 1)));
		await world.run({
			tasks: [{ task: "a" }, { task: "b", agent: "task" }, { task: "c" }],
		});
		assert.equal(world.notes.length, 1);
		const [line = ""] = world.notes;
		assert.ok(line.startsWith("model-router "));
		assert.ok(!line.includes("\n"));
		const entries = line.slice("model-router ".length).split(" | ");
		assert.equal(entries.length, 3);
		for (const [i, tier] of [0, 1, 2].entries()) {
			assert.ok(
				entries[i]?.startsWith(
					`task ${i + 1}: L${tier} ${TIER_AGENTS[tier]} · `,
				),
			);
		}
	});

	test("an entry carries the probabilities and the Jev suffix", async () => {
		world.fetchWith(() => reply(jevAnswer(1, 2)));
		await world.run({ tasks: [{ task: "a" }] });
		assert.equal(
			world.notes[0],
			"model-router task 1: L1 router_mid · hi · p=0.90/0.80 · jev jev-1.14.0 · 812/9 tok",
		);
	});

	test("the key never appears in the line", async () => {
		await world.run({ tasks: [{ task: "a" }] });
		assert.ok(!(world.notes[0] ?? "").includes(REGISTRY_KEY));
	});
});

describe("request", () => {
	test("it goes to the fixed endpoint, whatever the environment says", async () => {
		setEnv("TYPESAFE_BASE_URL", "https://example.invalid/v1");
		await world.run({ tasks: [{ task: "a" }] });
		assert.deepEqual(
			world.calls.map((c) => c.url),
			[ENDPOINT],
		);
	});

	test("the alias is always jev-latest", async () => {
		await world.run({ tasks: [{ task: "a" }] });
		assert.equal(world.calls[0]?.body.model, "jev-latest");
	});

	test("the key comes from omp's credential first", async () => {
		setEnv("TYPESAFE_API_KEY", ENV_KEY);
		await world.run({ tasks: [{ task: "a" }] });
		assert.equal(
			world.calls[0]?.init.headers.Authorization,
			`Bearer ${REGISTRY_KEY}`,
		);
	});

	test("the key comes from the environment when omp has none", async () => {
		setEnv("TYPESAFE_API_KEY", ENV_KEY);
		await world.run({ tasks: [{ task: "a" }] }, { key: async () => undefined });
		assert.equal(
			world.calls[0]?.init.headers.Authorization,
			`Bearer ${ENV_KEY}`,
		);
	});

	test("the key comes from the environment when the credential lookup throws", async () => {
		setEnv("TYPESAFE_API_KEY", ENV_KEY);
		const key = async () => {
			throw new Error("store locked");
		};
		await world.run({ tasks: [{ task: "a" }] }, { key });
		assert.equal(
			world.calls[0]?.init.headers.Authorization,
			`Bearer ${ENV_KEY}`,
		);
	});

	test("only the task tool is handled", async () => {
		const handlers: ((e: unknown, c: unknown) => Promise<unknown>)[] = [];
		extension({
			on: (_event, handler) => void handlers.push(handler as never),
		});
		const event = {
			...taskEvent({ tasks: [{ task: "a" }] }),
			toolName: "bash",
		};
		assert.equal(await handlers[0]?.(event, world.makeCtx()), undefined);
		assert.equal(world.calls.length, 0);
		assert.equal(world.notes.length, 0);
	});
});
