import { type Engine, expect, test } from "claude-code/testing";
import {
	config,
	configTool,
	fromOutside,
	harness,
	REFUSAL,
	refusedWrites,
	runCommand,
} from "./harness.ts";

const COMMAND = "model-router:scope";
const SETTING = "model-router.scope";
const scope = ($: Engine, args = "") => runCommand($, COMMAND, args);

test("the bare command prints the default", async ($, on) => {
	harness(on);
	expect(await scope($)).toBe("scope: core");
});

test(
	"the bare command prints the option and reads no key",
	{ options: { scope: "extended", api_key: "k" } },
	async ($, on) => {
		const h = harness(on, { env: { TYPESAFE_API_KEY: "v" } });
		const writes = config(on, (e) => ({ value: e.value }));
		expect(await scope($)).toBe("scope: extended");
		expect(h.envReads).toEqual([]);
		expect(writes).toEqual([]);
	},
);

test("a value changes the plugin's scope row", async ($, on) => {
	harness(on);
	const writes = config(on, (e) => ({ value: e.value }));
	expect(await scope($, "extended")).toBe("scope: extended");
	expect(writes.map((e) => [e.key, e.value])).toEqual([[SETTING, "extended"]]);
});

test("a refused change prints the reason", async ($, on) => {
	refusedWrites(on);
	expect(await scope($, "extended")).toBe(`scope unchanged: ${REFUSAL}`);
});

// The kit throws when nothing answers config.set, which stands for a write that fails.
test("a change that throws prints the error", async ($, on) => {
	harness(on);
	const text = await scope($, "extended");
	expect(text?.startsWith("scope unchanged: ")).toBe(true);
	expect(text).toContain("config.set");
});

test("any other argument lists the two values", async ($, on) => {
	harness(on);
	const writes = config(on, (e) => ({ value: e.value }));
	expect(await scope($, "all")).toBe("scope: use one of core, extended");
	expect(await scope($, "Extended")).toBe("scope: use one of core, extended");
	expect(writes).toEqual([]);
});

test("a command from a model or a plugin prints the value and writes nothing", async ($, on) => {
	harness(on);
	const writes = config(on, (e) => ({ value: e.value }));
	expect(await fromOutside($, COMMAND, "extended")).toEqual(
		Array(3).fill("scope: core"),
	);
	expect(writes).toEqual([]);
});

for (const [name, answer] of [
	["a write", () => ({ value: "extended" })],
	["a refused write", () => ({ deny: REFUSAL })],
] as const)
	test(`the tool and the command give one text for ${name}`, async ($, on) => {
		harness(on, {
			dialog: (labels) => labels.find((text) => text.startsWith("extended - ")),
		});
		const writes = config(on, answer);
		const fromTool = (await configTool($, "scope")).result;
		expect(await scope($, "extended")).toBe(fromTool);
		expect(writes).toHaveLength(2);
	});
