import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import plugin, { createPlugin } from "./openclaw.ts";
import {
	createFakeApi,
	createFakeClock,
	createJevFetch,
} from "./openclaw-fakes.ts";
import { PLUGIN_ID } from "./openclaw-settings.ts";
import type {
	OpenClawApi,
	OpenClawConfig,
	RegistrationMode,
} from "./openclaw-types.ts";

const SETTINGS = {
	provider: "typesafe",
	small_model: "openai/small",
	api_key: "typesafe-key",
};
const hooksOf = (hooks: unknown): OpenClawConfig => ({
	plugins: { entries: { [PLUGIN_ID]: { hooks: hooks as never } } },
});

function install(config: OpenClawConfig = {}) {
	const fake = createFakeApi({ config, pluginConfig: SETTINGS });
	const jev = createJevFetch({ tier: 0, work: 1 });
	const time = createFakeClock();
	createPlugin({ fetchFn: jev.fetch, clock: time.clock, env: {} }).register(
		fake.api,
	);
	return { ...fake, jev, time };
}

// The deadline a registered handler arms, read from the delay of its timer.
async function deadlineOf(config: OpenClawConfig) {
	const s = install(config);
	await s.beforeToolCall()(
		{ toolName: "sessions_spawn", params: { task: "work" } },
		{ toolName: "sessions_spawn", agentId: "main" },
	);
	return s.time.delays()[0];
}

describe("the bundle entry", () => {
	it("is a plain object with the plugin id and a register function", () => {
		assert.equal(plugin.id, "model-router-openclaw");
		assert.equal(typeof plugin.register, "function");
	});

	it("imports nothing from OpenClaw", () => {
		const source = readFileSync(
			new URL("./openclaw.ts", import.meta.url),
			"utf8",
		);
		assert.doesNotMatch(source, /from ["']openclaw/);
	});
});

describe("registration", () => {
	it("registers one handler on sessions_spawn with priority 100 and a timeout of the limit plus 2000 ms", () => {
		const s = install();
		assert.equal(s.hooks.length, 1);
		assert.equal(s.hooks[0]?.event, "before_tool_call");
		assert.deepEqual(s.hooks[0]?.options, {
			matcher: ["sessions_spawn"],
			priority: 100,
			timeoutMs: 10000,
		});
		assert.deepEqual(s.logs, []);
	});

	for (const mode of [
		"discovery",
		"tool-discovery",
		"setup-only",
		"setup-runtime",
		"cli-metadata",
	] as RegistrationMode[])
		it(`does nothing in ${mode} mode`, () => {
			const fake = createFakeApi({ registrationMode: mode });
			createPlugin().register(fake.api);
			assert.deepEqual(
				[fake.hooks, fake.tools, fake.commands, fake.logs],
				[[], [], [], []],
			);
		});

	it("registers the read-only tool and both owner-only commands", () => {
		const s = install();
		assert.deepEqual(
			s.tools.map((tool) => tool.name),
			["model_router_config"],
		);
		assert.deepEqual(
			s.commands.map((command) => [command.name, command.requiredScopes]),
			[
				["model-router-provider", ["operator.admin"]],
				["model-router-scope", ["operator.admin"]],
			],
		);
	});

	it("leaves routing off with one warning when the tool cannot be registered", () => {
		const fake = createFakeApi();
		fake.api.registerTool = () => {
			throw new Error("refused");
		};
		assert.doesNotThrow(() => createPlugin().register(fake.api));
		assert.equal(fake.hooks.length, 0);
		assert.deepEqual(
			fake.logs.map((l) => l.level),
			["warn"],
		);
	});

	it("routes a spawn through the registered handler", async () => {
		const s = install();
		const result = await s.beforeToolCall()(
			{ toolName: "sessions_spawn", params: { task: "work" } },
			{ toolName: "sessions_spawn", agentId: "main" },
		);
		assert.deepEqual(result, {
			params: { model: "openai/small", thinking: "high" },
		});
	});

	it("leaves the plugin inert with one warning when registration throws", () => {
		const fake = createFakeApi();
		fake.api.on = () => {
			throw new Error("refused");
		};
		assert.doesNotThrow(() => createPlugin().register(fake.api));
		assert.equal(fake.logs.length, 1);
		assert.equal(fake.logs[0]?.level, "warn");
		assert.match(fake.logs[0]?.message ?? "", /^model-router .*inert/);
	});

	it("leaves the plugin inert with one warning when the config cannot be read", () => {
		const fake = createFakeApi();
		Object.defineProperty(fake.api, "config", {
			get() {
				throw new Error("config");
			},
		});
		assert.doesNotThrow(() => createPlugin().register(fake.api as OpenClawApi));
		assert.equal(fake.hooks.length, 0);
		assert.deepEqual(
			fake.logs.map((l) => l.level),
			["warn"],
		);
	});

	it("survives a logger that throws while it warns", () => {
		const fake = createFakeApi();
		fake.api.on = () => {
			throw new Error("refused");
		};
		fake.api.logger.warn = () => {
			throw new Error("logger");
		};
		assert.doesNotThrow(() => createPlugin().register(fake.api));
	});
});

describe("the deadline from the operator's hook timeouts", () => {
	const cases: [string, unknown, number][] = [
		["the plugin's own value without settings", undefined, 8000],
		["the plugin's own value for empty settings", {}, 8000],
		[
			"the per-hook timeout first",
			{ timeouts: { before_tool_call: 6000 }, timeoutMs: 20000 },
			4000,
		],
		[
			"a per-hook timeout of 12000 against all hooks at 3000",
			{ timeouts: { before_tool_call: 12000 }, timeoutMs: 3000 },
			8000,
		],
		["all hooks without a per-hook value", { timeoutMs: 5000 }, 3000],
		["all hooks above the limit", { timeoutMs: 20000 }, 8000],
		["the smallest routing timeout", { timeoutMs: 3000 }, 1000],
		[
			"all hooks when the per-hook value is not usable",
			{ timeouts: { before_tool_call: 0 }, timeoutMs: 5000 },
			3000,
		],
		[
			"the plugin's value when nothing is usable",
			{ timeouts: { before_tool_call: -1 }, timeoutMs: 1.5 },
			8000,
		],
		["a value over 600000 not usable", { timeoutMs: 600001 }, 8000],
		["a string not usable", { timeouts: { before_tool_call: "5000" } }, 8000],
		["600000 usable", { timeoutMs: 600000 }, 8000],
	];
	for (const [name, hooks, expected] of cases)
		it(`uses ${name}: ${expected} ms`, async () => {
			assert.equal(await deadlineOf(hooksOf(hooks)), expected);
		});

	for (const timeoutMs of [2999, 2000, 1])
		it(`leaves the plugin inert with one warning at ${timeoutMs} ms`, async () => {
			const s = install(hooksOf({ timeoutMs }));
			const result = await s.beforeToolCall()(
				{ toolName: "sessions_spawn", params: { task: "work" } },
				{ toolName: "sessions_spawn", agentId: "main" },
			);
			assert.equal(result, undefined);
			assert.equal(s.jev.requests.length, 0);
			assert.deepEqual(
				s.logs.map((l) => l.level),
				["warn"],
			);
			assert.match(s.logs[0]?.message ?? "", new RegExp(`${timeoutMs} ms`));
			assert.match(s.logs[0]?.message ?? "", /3000 ms or more/);
		});

	it("does not warn at 3000 ms", () => {
		assert.deepEqual(install(hooksOf({ timeoutMs: 3000 })).logs, []);
	});
});
