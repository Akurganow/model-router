// Checks the request body Claude Code sends Jev for one task, and the line OpenClaw and Hermes print for a reply without the work part.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_ROLE } from "../core/brief.ts";
import { jevAnswer, streamed } from "../core/jev-fakes.ts";
import { tier } from "../core/tier.ts";
import { work } from "../core/work.ts";
import { createFakeClock } from "../utils/fake-clock.ts";
import { routedCall } from "./claude/fakes.ts";
import { createScriptedJev } from "./hermes/fakes.ts";
import { routeRequest } from "./hermes/route.ts";
import { DEADLINE_MS, REQUESTER, setup } from "./openclaw/handler-fakes.ts";
import { createBeforeToolCall, SPAWN_TOOL } from "./openclaw/router.ts";

const TASK = "Rename the helper in util.ts and run the tests.";
const DESCRIPTION = "Rename one helper";
// A reply that answers the tier question and leaves the work question out.
const NO_WORK = jevAnswer(2);

test("Claude Code sends one request with the role, the description, the task and the two questions", async () => {
	const { bodies } = await routedCall(
		{ api_key: "ts-key" },
		{},
		undefined,
		undefined,
		DESCRIPTION,
		{
			prompt: TASK,
			reply: () => ({
				status: 200,
				ok: true,
				headers: {},
				text: JSON.stringify(jevAnswer(2, 1)),
			}),
		},
	);
	assert.deepEqual(bodies, [
		{
			model: "jev-latest",
			state: { role: DEFAULT_ROLE, description: DESCRIPTION, task: TASK },
			questions: { tier: tier.question, work: work.question },
		},
	]);
});

describe("a reply without the work part skips with a bad reply", () => {
	test("in OpenClaw, and changes nothing", async () => {
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

	test("in Hermes", async () => {
		const time = createFakeClock();
		const jev = createScriptedJev(
			[{ host: "api.typesafe.ai", reply: { body: NO_WORK } }],
			time.fire,
		);
		const response = await routeRequest(
			{
				task: TASK,
				context: "",
				provider: "typesafe",
				keys: { typesafe: "typesafe-key" },
				budgetMs: 8000,
				models: { small: "openai/small", large: "openai/large" },
				keptEffort: null,
				description: DESCRIPTION,
			},
			{ fetchFn: jev.fetch, clock: time.clock },
		);
		assert.deepEqual(response, {
			outcome: "skip",
			line: "model-router skipped, bad reply",
		});
	});
});
