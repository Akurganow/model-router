import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeApi, createJevFetch } from "./openclaw-fakes.ts";
import { SPAWN_TOOL } from "./openclaw-router.ts";
import type { BeforeToolCallHandler } from "./openclaw-types.ts";

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
});

describe("createFakeApi registration modes", () => {
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

	for (const mode of ["full", "discovery", "tool-discovery"] as const)
		it(`records tools, commands and hooks in ${mode} mode`, () => {
			const fake = createFakeApi({ registrationMode: mode });
			fake.api.registerTool(tool);
			fake.api.registerCommand(command);
			fake.api.on("before_tool_call", async () => undefined);
			assert.deepEqual(
				[fake.tools.length, fake.commands.length, fake.hooks.length],
				[1, 1, 1],
			);
			assert.deepEqual(fake.ignored, []);
		});

	for (const mode of ["setup-only", "setup-runtime", "cli-metadata"] as const)
		it(`drops tools, commands and hooks in ${mode} mode and lists the calls`, () => {
			const fake = createFakeApi({ registrationMode: mode });
			fake.api.registerTool(tool);
			fake.api.registerCommand(command);
			fake.api.on("before_tool_call", async () => undefined);
			assert.deepEqual([fake.tools, fake.commands, fake.hooks], [[], [], []]);
			assert.deepEqual(fake.ignored, ["registerTool", "registerCommand", "on"]);
		});
});

describe("createJevFetch", () => {
	/** Sends one request with a JSON body to the fake fetch, with the signal only when given. */
	const send = (
		fetch: ReturnType<typeof createJevFetch>["fetch"],
		signal?: AbortSignal,
	) =>
		fetch("https://example.test/", {
			body: JSON.stringify({ state: { task: "t" } }),
			...(signal ? { signal } : {}),
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
