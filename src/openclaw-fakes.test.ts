import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createFakeApi,
	createFakeClock,
	createFakeRuntime,
	createJevFetch,
} from "./openclaw-fakes.ts";
import type {
	BeforeToolCallEvent,
	BeforeToolCallHandler,
	ToolContext,
} from "./openclaw-types.ts";

const EVENT: BeforeToolCallEvent = {
	toolName: "sessions_spawn",
	params: { task: "t" },
};
const CONTEXT: ToolContext = { toolName: "sessions_spawn", agentId: "main" };
const handler: BeforeToolCallHandler = async () => undefined;

describe("createFakeApi", () => {
	it("has the identity and defaults of a full registration", () => {
		const { api } = createFakeApi();
		assert.equal(api.id, "model-router-openclaw");
		assert.equal(api.registrationMode, "full");
		assert.deepEqual(api.pluginConfig, {});
	});

	it("takes overrides for the fields the plugin reads", () => {
		const { api } = createFakeApi({
			id: "other",
			registrationMode: "discovery",
			pluginConfig: { scope: "extended" },
			config: { agents: { defaults: { subagents: { thinking: "low" } } } },
		});
		assert.equal(api.id, "other");
		assert.equal(api.registrationMode, "discovery");
		assert.deepEqual(api.pluginConfig, { scope: "extended" });
		assert.equal(api.config.agents?.defaults?.subagents?.thinking, "low");
	});

	it("records each on call with its event, handler and options", () => {
		const fake = createFakeApi();
		const options = { matcher: ["sessions_spawn"], priority: 100 } as const;
		fake.api.on("before_tool_call", handler, options);
		assert.deepEqual(fake.hooks, [
			{ event: "before_tool_call", handler, options },
		]);
	});

	it("records tool and command registrations", () => {
		const fake = createFakeApi();
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
			requiredScopes: ["operator.admin"],
			handler: async () => ({ text: "" }),
		};
		fake.api.registerTool(tool);
		fake.api.registerCommand(command);
		assert.deepEqual(fake.tools, [tool]);
		assert.deepEqual(fake.commands, [command]);
	});

	it("records logger lines with their level", () => {
		const fake = createFakeApi();
		fake.api.logger.info("a");
		fake.api.logger.warn("b");
		fake.api.logger.error("c");
		assert.deepEqual(fake.logs, [
			{ level: "info", message: "a" },
			{ level: "warn", message: "b" },
			{ level: "error", message: "c" },
		]);
	});

	it("returns the registered before_tool_call handler", async () => {
		const fake = createFakeApi();
		const other: BeforeToolCallHandler = async () => ({ params: {} });
		fake.api.on("before_tool_call", handler);
		assert.equal(fake.beforeToolCall(), handler);
		fake.api.on("before_tool_call", other);
		assert.equal(fake.beforeToolCall(), other);
		assert.deepEqual(await fake.beforeToolCall()(EVENT, CONTEXT), {
			params: {},
		});
	});

	it("fails the helper when no handler was registered", () => {
		assert.throws(
			() => createFakeApi().beforeToolCall(),
			/no before_tool_call/,
		);
	});

	it("exposes the fake runtime it was built with", () => {
		const runtime = createFakeRuntime({ agentDir: "/agents/main" });
		const fake = createFakeApi({ runtime });
		assert.equal(fake.api.runtime, runtime.runtime);
		assert.equal(fake.runtime, runtime);
	});
});

describe("createFakeRuntime", () => {
	const cfg = {};

	it("reads the current config", () => {
		const { runtime } = createFakeRuntime({ config: { agents: {} } });
		assert.deepEqual(runtime.config.current(), { agents: {} });
	});

	it("returns the set default model", () => {
		const fake = createFakeRuntime({
			defaultModel: { provider: "openrouter", model: "openai/gpt-4.1-mini" },
		});
		assert.deepEqual(
			fake.runtime.modelConfig.resolveDefaultModelForAgent({
				cfg,
				agentId: "main",
			}),
			{ provider: "openrouter", model: "openai/gpt-4.1-mini" },
		);
		assert.deepEqual(fake.calls.defaultModel, [{ cfg, agentId: "main" }]);
	});

	it("echoes the raw string as a provider and model when no answer is set", () => {
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

	it("returns the set resolved ref or error", () => {
		const fake = createFakeRuntime();
		const params = { cfg, catalog: [], raw: "x", defaultProvider: "p" };
		fake.answers.resolved = { error: "model not allowed" };
		assert.deepEqual(fake.runtime.modelConfig.resolveAllowedModelRef(params), {
			error: "model not allowed",
		});
		const ref = { provider: "a", model: "b" };
		fake.answers.resolved = { ref, key: "a/b" };
		assert.deepEqual(fake.runtime.modelConfig.resolveAllowedModelRef(params), {
			ref,
			key: "a/b",
		});
	});

	it("answers the credential check true or false and records the call", async () => {
		const fake = createFakeRuntime();
		const check = fake.runtime.modelAuth.isProviderApiKeyConfiguredAsync;
		assert.equal(await check({ provider: "p", cfg, agentDir: "/a" }), true);
		fake.answers.credential = false;
		assert.equal(await check({ provider: "p", cfg }), false);
		assert.deepEqual(fake.calls.credential, [
			{ provider: "p", cfg, agentDir: "/a" },
			{ provider: "p", cfg },
		]);
	});

	it("returns the set agent directory", () => {
		const fake = createFakeRuntime({ agentDir: "/agents/x" });
		assert.equal(fake.runtime.agent.resolveAgentDir(cfg, "x"), "/agents/x");
		assert.deepEqual(fake.calls.agentDir, [{ cfg, agentId: "x" }]);
	});

	it("throws on demand, each member on its own", async () => {
		const fake = createFakeRuntime();
		const { runtime } = fake;
		const params = { cfg, catalog: [], raw: "x", defaultProvider: "p" };
		fake.throwOn.add("config");
		assert.throws(() => runtime.config.current(), /fake config failure/);
		fake.throwOn.add("defaultModel");
		assert.throws(
			() => runtime.modelConfig.resolveDefaultModelForAgent({ cfg }),
			/fake defaultModel failure/,
		);
		fake.throwOn.add("allowedRef");
		assert.throws(
			() => runtime.modelConfig.resolveAllowedModelRef(params),
			/fake allowedRef failure/,
		);
		fake.throwOn.add("agentDir");
		assert.throws(
			() => runtime.agent.resolveAgentDir(cfg, "x"),
			/fake agentDir failure/,
		);
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
	const send = (fetch: ReturnType<typeof createJevFetch>["fetch"]) =>
		fetch("https://api.typesafe.ai/v1/systemone", {
			method: "POST",
			body: JSON.stringify({ state: { task: "t" } }),
		});
	const probabilities = async (reply: Response, question: string) => {
		const body = (await reply.json()) as {
			answers: Record<string, { probabilities: Record<string, number> }>;
		};
		return body.answers[question]?.probabilities;
	};

	it("answers tier and work with the chosen levels", async () => {
		const jev = createJevFetch({ tier: 0, work: 2 });
		const reply = await send(jev.fetch);
		assert.equal(reply.status, 200);
		assert.deepEqual(await probabilities(reply.clone(), "tier"), {
			0: 0.9,
			1: 0.05,
			2: 0.05,
		});
		assert.deepEqual(await probabilities(reply, "work"), {
			0: 0.05,
			1: 0.05,
			2: 0.9,
		});
	});

	it("follows a level change between requests", async () => {
		const jev = createJevFetch({ tier: 1, work: 1 });
		jev.levels.tier = 2;
		jev.levels.work = 0;
		const reply = await send(jev.fetch);
		assert.equal((await probabilities(reply.clone(), "tier"))?.[2], 0.9);
		assert.equal((await probabilities(reply, "work"))?.[0], 0.9);
	});

	it("records each request with its url, body and signal", async () => {
		const jev = createJevFetch();
		const { signal } = new AbortController();
		await jev.fetch("https://example.test/", {
			method: "POST",
			body: JSON.stringify({ state: { task: "hello" } }),
			signal,
		});
		assert.equal(jev.requests.length, 1);
		assert.equal(jev.requests[0]?.url, "https://example.test/");
		assert.deepEqual(jev.requests[0]?.body, { state: { task: "hello" } });
		assert.equal(jev.requests[0]?.signal, signal);
	});

	it("fails like the real fetch when the signal is already aborted", async () => {
		const jev = createJevFetch();
		await assert.rejects(
			jev.fetch("https://example.test/", {
				body: "{}",
				signal: AbortSignal.abort(),
			}),
		);
		assert.equal(jev.requests.length, 0);
	});
});

describe("createJevFetch modes", () => {
	const send = (
		fetch: ReturnType<typeof createJevFetch>["fetch"],
		signal?: AbortSignal,
	) =>
		fetch("https://example.test/", {
			body: JSON.stringify({ state: {} }),
			...(signal ? { signal } : {}),
		});

	it("answers a status when the mode is a status", async () => {
		const jev = createJevFetch();
		jev.mode.current = { status: 401 };
		assert.equal((await send(jev.fetch)).status, 401);
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

	it("starts in the answer mode", async () => {
		assert.equal((await send(createJevFetch().fetch)).status, 200);
	});
});

describe("createFakeClock", () => {
	it("fires pending timers on demand and skips cancelled ones", () => {
		const fake = createFakeClock();
		const fired: string[] = [];
		fake.clock.after(8000, () => fired.push("a"));
		fake.clock.after(5, () => fired.push("b")).cancel();
		assert.deepEqual(fake.delays(), [8000, 5]);
		fake.fire();
		assert.deepEqual(fired, ["a"]);
		fake.fire();
		assert.deepEqual(fired, ["a"]);
	});
});
