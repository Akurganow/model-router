import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeApi } from "#adapters/openclaw/__tests__/support/fakes.ts";
import {
	CONTEXT,
	DEADLINE_MS,
	TASK,
} from "#adapters/openclaw/__tests__/support/handler-fakes.ts";
import { createBeforeToolCall, SPAWN_TOOL } from "#adapters/openclaw/router.ts";
import { PLUGIN_ID } from "#adapters/openclaw/settings.ts";
import {
	OPENAI_REPLY,
	scoringReply,
	systemOneAnswer,
} from "#core/__tests__/support/replies.ts";
import { LINE_PREFIX } from "#core/output/line.ts";
import type { Fetch } from "#core/scoring/transport/send.ts";
import { createFakeClock } from "#utils/__tests__/support/fake-clock.ts";

const MODELS = "{typesafe:jev-preview, openai:gpt-7-sol}";
const KEYS = { api_key: "typesafe-key", openai_api_key: "openai-key" };

// One handler over a plugin config the test edits between calls. The fake serves the OpenAI
// reply on OpenAI's address and the System One reply elsewhere, and records each sent model.
function routing(settings: Record<string, unknown>) {
	const config: Record<string, unknown> = { ...KEYS, ...settings };
	const fake = createFakeApi({ pluginConfig: config });
	const sent: string[] = [];
	const fetchFn: Fetch = async (url, init) => {
		sent.push(JSON.parse(String(init.body)).model);
		return new URL(url).hostname === "api.openai.com"
			? scoringReply(200, JSON.parse(OPENAI_REPLY))
			: scoringReply(200, systemOneAnswer(1, 1));
	};
	const handler = createBeforeToolCall(fake.api, DEADLINE_MS, {
		fetchFn,
		clock: createFakeClock().clock,
		env: {},
	});
	const call = async () => {
		sent.length = 0;
		await handler({ toolName: SPAWN_TOOL, params: { task: TASK } }, CONTEXT);
		return [...sent];
	};
	return {
		config,
		call,
		logs: () => fake.logs.map(({ message }) => message),
	};
}

describe("the models setting", () => {
	it("switching the provider switches the model that scores the call", async () => {
		const s = routing({ provider: "typesafe", models: MODELS });
		assert.deepEqual(await s.call(), ["jev-preview"]);
		Object.assign(s.config, { provider: "openai" });
		assert.deepEqual(await s.call(), ["gpt-7-sol"]);
		Object.assign(s.config, { provider: "typesafe" });
		assert.deepEqual(await s.call(), ["jev-preview"]);
	});

	it("routes with the defaults for a text of nothing", async () => {
		for (const models of ["", "   ", null])
			assert.deepEqual(await routing({ models }).call(), ["jev-latest"]);
	});

	it("takes a native object as a value", async () => {
		assert.deepEqual(
			await routing({ models: { typesafe: "jev-preview" } }).call(),
			["jev-preview"],
		);
	});

	const NOT_VALID: readonly [name: string, stored: unknown][] = [
		["an unknown provider", "{acme:x}"],
		["an empty model", "typesafe:"],
		["an entry without a colon", "typesafe"],
		["a provider named twice", "typesafe:a, typesafe:b"],
		["a model with a slash", "openai:vendor/gpt"],
		["a JSON value that is not a string", '{"typesafe": 5}'],
		["a native value that is not a string", { typesafe: 5 }],
		["a text of neither form", "{typesafe:a"],
		["a stored number", 5],
		["a stored array", ["typesafe:jev-preview"]],
	];

	for (const [name, stored] of NOT_VALID)
		it(`${name} skips the call with the setup line`, async () => {
			const s = routing({ models: stored });
			assert.deepEqual(await s.call(), []);
			assert.deepEqual(s.logs(), [
				`${LINE_PREFIX}skipped, models not valid: run setup`,
			]);
		});
});

describe("the live config", () => {
	it("holds the models a command wrote and wins over the plugin config", async () => {
		const fake = createFakeApi({
			config: {
				plugins: {
					entries: {
						[PLUGIN_ID]: { config: { models: "{typesafe:jev-preview}" } },
					},
				},
			},
			pluginConfig: { ...KEYS, models: "{typesafe:jev-1.14.0}" },
		});
		const sent: string[] = [];
		const handler = createBeforeToolCall(fake.api, DEADLINE_MS, {
			fetchFn: async (_url, init) => {
				sent.push(JSON.parse(String(init.body)).model);
				return scoringReply(200, systemOneAnswer(1, 1));
			},
			clock: createFakeClock().clock,
			env: {},
		});
		await handler({ toolName: SPAWN_TOOL, params: { task: TASK } }, CONTEXT);
		assert.deepEqual(sent, ["jev-preview"]);
	});
});
