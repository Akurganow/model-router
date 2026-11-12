// Pins what each adapter sends Jev and prints for one task, so the merge of the shared call changes neither.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_ROLE } from "../core/brief.ts";
import { jevAnswer, streamed } from "../core/jev-fakes.ts";
import { tier } from "../core/tier.ts";
import { work } from "../core/work.ts";
import { createFakeClock } from "../utils/fake-clock.ts";
import {
	AGENT_CALL,
	BUILT_IN_DEFAULT,
	CLOCK,
	nextHook,
	registered,
} from "./claude/fakes.ts";
import { createScriptedJev, type Step } from "./hermes/fakes.ts";
import { routeRequest } from "./hermes/route.ts";
import { useWorld } from "./omp/fakes.ts";
import { createExtension } from "./omp/router.ts";
import { DEADLINE_MS, REQUESTER, setup } from "./openclaw/handler-fakes.ts";
import { createBeforeToolCall, SPAWN_TOOL } from "./openclaw/router.ts";

const TASK = "Rename the helper in util.ts and run the tests.";
const DESCRIPTION = "Rename one helper";
const SUFFIX = " · jev jev-1.14.0 · 812/9 tok";
const BODY = {
	model: "jev-latest",
	state: { role: DEFAULT_ROLE, description: DESCRIPTION, task: TASK },
	questions: { tier: tier.question, work: work.question },
};
// A reply that answers the tier question and leaves the work question out.
const NO_WORK = jevAnswer(2);

/**
 * Asserts the body Jev received holds the state, the model and the two
 * questions in that order, with the tier question before the work question.
 */
function assertRequest(body: unknown): void {
	assert.deepEqual(body, BODY);
	assert.deepEqual(Object.keys(body as object), [
		"state",
		"model",
		"questions",
	]);
	const { state, questions } = body as {
		state: object;
		questions: object;
	};
	assert.deepEqual(Object.keys(state), ["role", "description", "task"]);
	assert.deepEqual(Object.keys(questions), ["tier", "work"]);
}

describe("Claude Code asks Jev for one task", () => {
	/** Spawns the task once against a Jev that gives the reply, then returns the bodies Jev received and the lines logged. */
	async function run(reply: unknown) {
		const bodies: unknown[] = [];
		const lines: string[] = [];
		const $ = {
			clock: CLOCK,
			env: { get: async () => undefined },
			http: {
				fetch: async (_url: string, init: { body: string }) => {
					bodies.push(JSON.parse(init.body));
					return {
						status: 200,
						ok: true,
						headers: {},
						text: JSON.stringify(reply),
					};
				},
			},
			ui: {
				log: async (text: string, to?: { to: string }) => {
					if (to === undefined) lines.push(text);
				},
			},
		};
		const hooks = registered({ api_key: "ts-key" });
		await hooks["agent.offer"]?.($, BUILT_IN_DEFAULT, nextHook());
		await hooks[AGENT_CALL]?.(
			$,
			{
				tool_use_id: "toolu_1",
				prompt: TASK,
				description: DESCRIPTION,
				subagentType: "general-purpose",
				fork: false,
			},
			nextHook(),
		);
		return { bodies, lines };
	}

	test("one request holds the role, the description, the task and the two questions", async () => {
		const { bodies } = await run(jevAnswer(2, 1));
		assert.equal(bodies.length, 1);
		assertRequest(bodies[0]);
	});

	test("the routed line names the large model, the ladder effort and the probabilities", async () => {
		const { lines } = await run(jevAnswer(2, 1));
		assert.deepEqual(lines, [`L2 opus · medium · p=0.90/0.90${SUFFIX}`]);
	});

	test("a reply without the work part skips with a bad reply", async () => {
		const { lines } = await run(NO_WORK);
		assert.deepEqual(lines, ["skipped, bad reply"]);
	});
});

describe("OpenClaw asks Jev for one task", () => {
	const call = (levels = { tier: 1, work: 1 }) => {
		const s = setup({ levels });
		return { s, done: s.call({ task: TASK, label: DESCRIPTION }) };
	};

	test("one request holds the role, the description, the task and the two questions", async () => {
		const { s, done } = call();
		await done;
		assert.equal(s.jev.requests.length, 1);
		assertRequest(s.jev.requests[0]?.body);
	});

	test("the routed line names the large model, the ladder effort and the probabilities", async () => {
		const { s, done } = call({ tier: 2, work: 1 });
		assert.deepEqual(await done, {
			params: { model: "openai/large", thinking: "medium" },
		});
		assert.deepEqual(
			s.logs.map((l) => l.message),
			[`model-router L2 openai/large · medium · p=0.90/0.90${SUFFIX}`],
		);
	});

	test("a reply without the work part skips with a bad reply and changes nothing", async () => {
		const s = setup({ settings: {} });
		const handler = createBeforeToolCall(s.api, DEADLINE_MS, {
			fetchFn: async () => streamed(200, NO_WORK),
			clock: s.time.clock,
			env: {},
		});
		assert.equal(
			await handler(
				{ toolName: SPAWN_TOOL, params: { task: TASK } },
				{ toolName: SPAWN_TOOL, agentId: REQUESTER },
			),
			undefined,
		);
		assert.deepEqual(
			s.logs.map((l) => l.message),
			["model-router skipped, bad reply"],
		);
	});
});

describe("Hermes asks Jev for one task", () => {
	const REQUEST = {
		task: TASK,
		context: "",
		provider: "typesafe",
		keys: { typesafe: "typesafe-key" },
		budgetMs: 8000,
		models: { small: "openai/small", large: "openai/large" },
		keptEffort: null,
		description: DESCRIPTION,
	};
	/** Runs the request against a scripted Jev and returns the response and the bodies Jev received. */
	async function run(reply: Step["reply"]) {
		const time = createFakeClock();
		const jev = createScriptedJev(
			[{ host: "api.typesafe.ai", reply }],
			time.fire,
		);
		const response = await routeRequest(REQUEST, {
			fetchFn: jev.fetch,
			clock: time.clock,
		});
		return { response, bodies: jev.bodies };
	}

	test("one request holds the role, the description, the task and the two questions", async () => {
		const { bodies } = await run({ levels: { tier: 2, work: 1 } });
		assert.equal(bodies.length, 1);
		assertRequest(bodies[0]);
	});

	test("the routed line names the large model, the ladder effort and the probabilities", async () => {
		const { response } = await run({ levels: { tier: 2, work: 1 } });
		assert.deepEqual(response, {
			outcome: "route",
			slot: "large",
			effort: "medium",
			line: `model-router L2 openai/large · medium · p=0.90/0.90${SUFFIX}`,
		});
	});

	test("a reply without the work part skips with a bad reply", async () => {
		const { response } = await run({ body: NO_WORK });
		assert.deepEqual(response, {
			outcome: "skip",
			line: "model-router skipped, bad reply",
		});
	});
});

describe("omp asks Jev for one task", () => {
	const world = useWorld();
	const run = async (reply: unknown) => {
		createExtension(world.imports)(world.pi);
		world.answer = async () => streamed(200, reply);
		await world.toolCall("c", { tasks: [{ task: TASK, name: DESCRIPTION }] });
	};

	test("one request holds the role, the description, the task and the two questions", async () => {
		await run(jevAnswer(2, 1));
		assert.equal(world.sent.length, 1);
		assertRequest(world.sent[0]?.body);
	});

	test("the routed line names the slow role, the ladder effort and the probabilities", async () => {
		await run(jevAnswer(2, 1));
		assert.deepEqual(world.notes, [
			`model-router task 1: L2 @slow · medium · p=0.90/0.90${SUFFIX}`,
		]);
	});

	test("a reply without the work part skips with a bad reply", async () => {
		await run(NO_WORK);
		assert.deepEqual(world.notes, ["model-router task 1: skipped, bad reply"]);
	});
});
