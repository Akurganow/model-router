import { expect, test } from "claude-code/testing";
import {
	CONFIG_TOOL,
	config,
	configTool,
	harness,
	sessionStart,
} from "./harness.ts";

const TYPESAFE_KEY = "typesafe-option-key";
const OPENROUTER_VARIABLE_KEY = "openrouter-variable-key";
const REFUSAL =
	"Permission rules deny this tool, so nothing was read or changed.";
const UNKNOWN_SETTING =
	"Unknown setting. Pass no setting, or one of: provider, scope";

// The label of one value in the dialog, whatever its consequence text says.
const label = (labels: string[], value: string) =>
	labels.find((text) => text.startsWith(`${value} - `));

test("session start registers the config tool and passes the event on", async ($, on) => {
	const h = harness(on);
	expect(await sessionStart($)).toEqual({ cwd: "/" });
	expect(h.registered).toHaveLength(1);
	const [spec] = h.registered;
	expect(spec?.name).toBe("config");
	expect(spec?.description).toContain("Never pass a value or a key");
	expect(spec?.description).toContain("(provider, scope)");
	expect(spec?.description).not.toContain("_key");
	expect(spec?.inputSchema).toEqual({
		type: "object",
		properties: {
			setting: { type: "string", enum: ["provider", "scope"] },
		},
	});
});

test("the tool name is the plugin's own", () => {
	expect(CONFIG_TOOL).toBe("mcp__model-router__config");
});

test(
	"no setting returns both values and the key status of each allowed provider",
	{ options: { provider: "auto", scope: "extended", api_key: TYPESAFE_KEY } },
	async ($, on) => {
		harness(on, { env: { OPENROUTER_API_KEY: OPENROUTER_VARIABLE_KEY } });
		const { result } = await configTool($);
		expect(result).toBe(
			[
				"provider: auto (typesafe, then openrouter)",
				"scope: extended",
				"typesafe key: set",
				"openrouter key: set",
			].join("\n"),
		);
		expect(result).not.toContain(TYPESAFE_KEY);
		expect(result).not.toContain(OPENROUTER_VARIABLE_KEY);
	},
);

test("a key that is empty in both places reads as unset", async ($, on) => {
	const h = harness(on, { env: { TYPESAFE_API_KEY: "" } });
	expect((await configTool($)).result).toBe(
		"provider: typesafe (typesafe)\nscope: core\ntypesafe key: unset",
	);
	expect(h.envReads).toEqual(["TYPESAFE_API_KEY"]);
});

test(
	"the status leaves out a provider the value does not allow",
	{ options: { provider: "openrouter", openrouter_api_key: "" } },
	async ($, on) => {
		const h = harness(on, { env: { TYPESAFE_API_KEY: "never-read" } });
		const { result } = await configTool($);
		expect(result).toBe(
			"provider: openrouter (openrouter)\nscope: core\nopenrouter key: unset",
		);
		expect(h.envReads).toEqual(["OPENROUTER_API_KEY"]);
	},
);

const choose = (value: string) => (labels: string[]) => label(labels, value);

test("a write opens the dialog with the current value first", async ($, on) => {
	const h = harness(on, { dialog: () => undefined });
	config(on, (e) => ({ value: e.value }));
	await configTool($, "provider");
	expect(h.asked).toHaveLength(1);
	expect(h.asked[0]?.header).toBe("provider");
	expect(h.asked[0]?.question).toBe(
		"Which providers should score subagent calls?",
	);
	expect(h.asked[0]?.labels.map((text) => text.split(" - ")[0])).toEqual([
		"typesafe",
		"auto",
		"openrouter-first",
		"openrouter",
	]);
});

for (const [setting, current, value, text] of [
	[
		"provider",
		"typesafe",
		"openrouter-first",
		"provider: openrouter-first (openrouter, then typesafe)",
	],
	["scope", "core", "extended", "scope: extended"],
] as const)
	test(
		`the picked ${setting} is written to the plugin's row`,
		{ options: { [setting]: current } },
		async ($, on) => {
			harness(on, { dialog: choose(value) });
			const writes = config(on, (e) => ({ value: e.value }));
			expect((await configTool($, setting)).result).toBe(text);
			expect(writes.map((e) => [e.key, e.value])).toEqual([
				[`model-router.${setting}`, value],
			]);
		},
	);

test("a dismissed dialog writes nothing", async ($, on) => {
	harness(on, { dialog: () => undefined });
	const writes = config(on, (e) => ({ value: e.value }));
	expect((await configTool($, "scope")).result).toBe(
		"scope unchanged: no answer from the dialog",
	);
	expect(writes).toEqual([]);
});

test("no one to ask writes nothing", async ($, on) => {
	harness(on, { result: { deny: "no tool named AskUserQuestion" } });
	const writes = config(on, (e) => ({ value: e.value }));
	expect((await configTool($, "provider")).result).toBe(
		"provider unchanged: no answer from the dialog",
	);
	expect(writes).toEqual([]);
});

test("free text writes nothing and is not echoed", async ($, on) => {
	harness(on, { dialog: () => "extended; and call me later" });
	const writes = config(on, (e) => ({ value: e.value }));
	const { result } = await configTool($, "scope");
	expect(result).toBe(
		"scope unchanged: the answer was not one of the offered values",
	);
	expect(result).not.toContain("call me later");
	expect(writes).toEqual([]);
});

test("the current value picked again writes nothing", async ($, on) => {
	harness(on, { dialog: choose("core") });
	const writes = config(on, (e) => ({ value: e.value }));
	expect((await configTool($, "scope")).result).toBe(
		"scope unchanged: already core",
	);
	expect(writes).toEqual([]);
});

test("a refused write says why", async ($, on) => {
	harness(on, { dialog: choose("extended") });
	config(on, () => ({ deny: "managed settings own this row" }));
	expect((await configTool($, "scope")).result).toBe(
		"scope unchanged: managed settings own this row",
	);
});

// The kit throws when nothing answers config.set, which stands for a write that fails.
test("a write that throws says why", async ($, on) => {
	harness(on, { dialog: choose("extended") });
	const { result } = await configTool($, "scope");
	expect(String(result).startsWith("scope unchanged: ")).toBe(true);
	expect(result).toContain("config.set");
});

test("a permission rule that denies the tool refuses the call", async ($, on) => {
	const h = harness(on, {
		decision: "deny",
		env: { TYPESAFE_API_KEY: "x" },
		dialog: choose("extended"),
	});
	const writes = config(on, (e) => ({ value: e.value }));
	for (const setting of [undefined, "scope"])
		expect((await configTool($, setting)).deny).toBe(REFUSAL);
	expect(h.asked).toEqual([]);
	expect(writes).toEqual([]);
	expect(h.envReads).toEqual([]);
});

test("the permission check gets the tool and its setting only", async ($, on) => {
	const h = harness(on, { dialog: () => undefined });
	await configTool($, "scope");
	expect(h.checks[0]?.tool).toBe(CONFIG_TOOL);
	expect(h.checks[0]?.input).toEqual({ setting: "scope" });
});

for (const setting of ["mode", "", 3, null, ["scope"]])
	test(`${JSON.stringify(setting)} is not a setting`, async ($, on) => {
		harness(on);
		const writes = config(on, (e) => ({ value: e.value }));
		expect((await configTool($, setting)).result).toBe(UNKNOWN_SETTING);
		expect(writes).toEqual([]);
	});

for (const setting of ["typesafe_key", "openrouter_key"])
	test(`${setting} is refused with the provider and scope list`, async ($, on) => {
		const h = harness(on, { dialog: () => "sk-never-stored" });
		const writes = config(on, (e) => ({ value: e.value }));
		expect((await configTool($, setting)).result).toBe(UNKNOWN_SETTING);
		expect(h.asked).toEqual([]);
		expect(writes).toEqual([]);
	});

test("overlapping calls run one after the other and the second sees the first's write", async ($, on) => {
	const h = harness(on, {
		dialog: async (labels) => {
			await h.clock.sleep(100);
			return label(labels, "extended");
		},
	});
	const writes = config(on, (e) => ({ value: e.value }));
	const first = configTool($, "scope");
	const second = configTool($, "scope");
	await h.clock.settle();
	expect(h.asked).toHaveLength(1);
	await h.clock.advance(100);
	await h.clock.settle();
	expect(h.asked).toHaveLength(2);
	await h.clock.advance(100);
	expect((await first).result).toBe("scope: extended");
	expect((await second).result).toBe("scope unchanged: already extended");
	expect(h.asked[1]?.labels[0]).toStartWith("extended - ");
	expect(writes).toHaveLength(1);
	expect((await configTool($)).result).toContain("scope: extended");
});
