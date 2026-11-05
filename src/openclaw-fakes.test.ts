import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createFakeApi,
	createFakeRuntime,
	createJevFetch,
} from "./openclaw-fakes.ts";
import { SPAWN_TOOL } from "./openclaw-router.ts";
import type {
	BeforeToolCallEvent,
	BeforeToolCallHandler,
	ToolContext,
} from "./openclaw-types.ts";

const EVENT: BeforeToolCallEvent = {
	toolName: SPAWN_TOOL,
	params: { task: "t" },
};
const CONTEXT: ToolContext = { toolName: SPAWN_TOOL, agentId: "main" };

describe("createFakeApi", () => {
	it("has the identity and defaults of a full registration", () => {
		const { api } = createFakeApi();
		assert.equal(api.id, "model-router-openclaw");
		assert.equal(api.registrationMode, "full");
		assert.deepEqual(api.pluginConfig, {});
	});

	it("records hooks, tools, commands and logger lines", () => {
		const fake = createFakeApi();
		const handler: BeforeToolCallHandler = async () => undefined;
		const options = { matcher: [SPAWN_TOOL], priority: 100 } as const;
		const tool = {
			name: "model_router_config",
			label: "Model Router",
			description: "d",
			parameters: {},
			execute: async () => ({ content: [] }),
		};
		const command = {
			name: "model-router-scope",
			description: "d",
			handler: async () => ({ text: "" }),
		};
		fake.api.on("before_tool_call", handler, options);
		fake.api.registerTool(tool);
		fake.api.registerCommand(command);
		fake.api.logger.info("a");
		fake.api.logger.warn("b");
		assert.deepEqual(fake.hooks, [
			{ event: "before_tool_call", handler, options },
		]);
		assert.deepEqual(fake.tools, [tool]);
		assert.deepEqual(fake.commands, [command]);
		assert.deepEqual(fake.logs, [
			{ level: "info", message: "a" },
			{ level: "warn", message: "b" },
		]);
	});

	it("returns the last registered before_tool_call handler, and fails without one", async () => {
		const fake = createFakeApi();
		assert.throws(() => fake.beforeToolCall(), /no before_tool_call/);
		fake.api.on("before_tool_call", async () => undefined);
		const last: BeforeToolCallHandler = async () => ({ params: {} });
		fake.api.on("before_tool_call", last);
		assert.equal(fake.beforeToolCall(), last);
		assert.deepEqual(await fake.beforeToolCall()(EVENT, CONTEXT), {
			params: {},
		});
	});
});

describe("createFakeRuntime", () => {
	const cfg = {};

	it("echoes the raw string as a provider and model and records the call", () => {
		const { runtime, calls } = createFakeRuntime();
		const params = {
			cfg,
			catalog: [],
			raw: "openrouter/google/gemini-2.5-flash",
			defaultProvider: "openrouter",
			agentId: "main",
		};
		assert.deepEqual(runtime.modelConfig.resolveAllowedModelRef(params), {
			ref: { provider: "openrouter", model: "google/gemini-2.5-flash" },
			key: "openrouter/google/gemini-2.5-flash",
		});
		assert.deepEqual(calls.allowedRef, [params]);
	});

	it("throws on demand, each member on its own", async () => {
		const fake = createFakeRuntime();
		const { runtime } = fake;
		fake.throwOn.add("config");
		assert.throws(() => runtime.config.current(), /fake config failure/);
		fake.throwOn.add("credential");
		await assert.rejects(
			runtime.modelAuth.isProviderApiKeyConfiguredAsync({ provider: "p" }),
			/fake credential failure/,
		);
		fake.throwOn.clear();
		assert.doesNotThrow(() => runtime.config.current());
	});
});

describe("createJevFetch", () => {
	const send = (
		fetch: ReturnType<typeof createJevFetch>["fetch"],
		signal?: AbortSignal,
	) =>
		fetch("https://example.test/", {
			body: JSON.stringify({ state: { task: "t" } }),
			...(signal ? { signal } : {}),
		});

	it("answers tier and work with the chosen levels", async () => {
		const jev = createJevFetch({ tier: 0, work: 2 });
		const reply = await send(jev.fetch);
		const body = (await reply.json()) as {
			answers: Record<string, { probabilities: Record<string, number> }>;
		};
		const answered = (question: string) =>
			body.answers[question]?.probabilities;
		assert.equal(reply.status, 200);
		assert.deepEqual(answered("tier"), {
			0: 0.9,
			1: 0.05,
			2: 0.05,
		});
		assert.deepEqual(answered("work"), {
			0: 0.05,
			1: 0.05,
			2: 0.9,
		});
	});

	it("records each request with its url, body and signal", async () => {
		const jev = createJevFetch();
		const { signal } = new AbortController();
		await send(jev.fetch, signal);
		assert.equal(jev.requests[0]?.url, "https://example.test/");
		assert.deepEqual(jev.requests[0]?.body, { state: { task: "t" } });
		assert.equal(jev.requests[0]?.signal, signal);
	});

	it("fails like the real fetch when the signal is already aborted", async () => {
		const jev = createJevFetch();
		await assert.rejects(send(jev.fetch, AbortSignal.abort()));
		assert.equal(jev.requests.length, 0);
	});

	it("holds a request until its signal aborts, then rejects with the reason", async () => {
		const jev = createJevFetch();
		jev.mode.current = "hang";
		const stop = new AbortController();
		const pending = send(jev.fetch, stop.signal);
		stop.abort("limit");
		await assert.rejects(pending, (reason) => reason === "limit");
		assert.equal(jev.requests.length, 1);
	});
});
