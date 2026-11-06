import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPlugin } from "./openclaw.ts";
import { createFakeApi, createJevFetch } from "./openclaw-fakes.ts";
import { PLUGIN_ID } from "./openclaw-settings.ts";
import type { OpenClawConfig, RegistrationMode } from "./openclaw-types.ts";

const TOOL = ["model_router_config"];
const COMMANDS = ["model-router-provider", "model-router-scope"];
const NOTHING: string[] = [];

// What register adds in each mode, and why. OpenClaw drops a tool, a command or a hook
// in the three setup and CLI modes, so the plugin registers nothing there. The tool is
// read by agent runs in all three live modes. The commands are read by chat dispatch from
// the full and discovery registries only. A chat turn scoped to a discovery registry runs
// its hooks from that registry alone, so the hook goes into full and discovery.
const EXPECTED: [RegistrationMode, string[], string[], boolean][] = [
	["full", TOOL, COMMANDS, true],
	["discovery", TOOL, COMMANDS, true],
	["tool-discovery", TOOL, NOTHING, false],
	["setup-only", NOTHING, NOTHING, false],
	["setup-runtime", NOTHING, NOTHING, false],
	["cli-metadata", NOTHING, NOTHING, false],
];

function registerIn(mode: RegistrationMode, config: OpenClawConfig = {}) {
	const fake = createFakeApi({ registrationMode: mode, config });
	createPlugin({
		fetchFn: createJevFetch().fetch,
		clock: { after: () => ({ cancel: () => {} }) },
		env: {},
	}).register(fake.api);
	return fake;
}

const unique = (names: string[]) => new Set(names).size === names.length;

describe("what register adds in each registration mode", () => {
	for (const [mode, tools, commands, hook] of EXPECTED)
		it(`${mode}: ${tools.length} tool, ${commands.length} commands, ${hook ? "the" : "no"} hook`, () => {
			const fake = registerIn(mode);
			assert.deepEqual(
				fake.tools.map((t) => t.name),
				tools,
			);
			assert.deepEqual(
				fake.commands.map((c) => c.name),
				commands,
			);
			assert.deepEqual(
				fake.hooks.map((h) => h.event),
				hook ? ["before_tool_call"] : [],
			);
			assert.deepEqual(fake.ignored, []);
			assert.deepEqual(fake.logs, []);
		});

	it("adds no name twice to one registry in any mode", () => {
		for (const [mode] of EXPECTED) {
			const fake = registerIn(mode);
			assert.ok(unique(fake.tools.map((t) => t.name)), `${mode} tools`);
			assert.ok(unique(fake.commands.map((c) => c.name)), `${mode} commands`);
			assert.ok(fake.hooks.length <= 1, `${mode} hooks`);
		}
	});

	it("gives the discovery pass exactly one spawn hook, with the options of the full pass", () => {
		const [full, discovery] = [registerIn("full"), registerIn("discovery")];
		assert.equal(discovery.hooks.length, 1);
		assert.equal(discovery.hooks[0]?.event, "before_tool_call");
		assert.deepEqual(discovery.hooks[0]?.options, full.hooks[0]?.options);
		assert.deepEqual(discovery.hooks[0]?.options?.matcher, ["sessions_spawn"]);
	});

	it("keeps the registry of the full pass and the registry of the discovery pass apart", () => {
		const pass = [registerIn("full"), registerIn("discovery")];
		for (const fake of pass) {
			assert.deepEqual(
				fake.tools.map((t) => t.name),
				TOOL,
			);
			assert.deepEqual(
				fake.commands.map((c) => c.name),
				COMMANDS,
			);
		}
	});

	it("answers from the live config in the discovery pass", async () => {
		const fake = registerIn("discovery", {
			plugins: { entries: { [PLUGIN_ID]: { config: { provider: "auto" } } } },
		});
		const text = await fake.tools[0]?.execute("call-1", {});
		assert.match(text?.content[0]?.text ?? "", /provider: auto/);
		const reply = await fake.commands[0]?.handler({
			channel: "webchat",
			isAuthorizedSender: true,
			senderIsOwner: true,
			commandBody: "",
			config: {},
		});
		assert.match(reply?.text ?? "", /auto/);
	});
});

describe("the hook timeout warning", () => {
	const SHORT: OpenClawConfig = {
		plugins: {
			entries: { [PLUGIN_ID]: { hooks: { timeoutMs: 2000 } as never } },
		},
	};

	it("comes once in full mode", () => {
		assert.deepEqual(
			registerIn("full", SHORT).logs.map((l) => l.level),
			["warn"],
		);
	});

	for (const [mode] of EXPECTED.filter(([m]) => m !== "full"))
		it(`does not come in ${mode} mode`, () => {
			assert.deepEqual(registerIn(mode, SHORT).logs, []);
		});
});

describe("a refused registration in discovery mode", () => {
	for (const member of ["registerTool", "registerCommand"] as const)
		it(`logs one warning and throws nothing when ${member} refuses`, () => {
			const fake = createFakeApi({ registrationMode: "discovery" });
			fake.api[member] = () => {
				throw new Error("refused");
			};
			assert.doesNotThrow(() => createPlugin().register(fake.api));
			assert.deepEqual(
				fake.logs.map((l) => l.level),
				["warn"],
			);
			assert.deepEqual(fake.hooks, []);
		});
});
