import assert from "node:assert/strict";
import { test } from "node:test";
import {
	KEY,
	KEY_VARIABLE,
	lockfileScoped,
	lockfileWith,
	OR_VARIABLE,
	setEnv,
	TOOL_NAME,
	useWorld,
} from "./omp-fakes.ts";
import { UNREADABLE } from "./omp-gates.ts";
import { createExtension } from "./omp-router.ts";
import type { OmpImports, ToolSpec } from "./omp-types.ts";
import {
	alreadyValue,
	ask,
	badCall,
	COMMAND_DESCRIPTIONS,
	NO_ANSWER,
	NOT_OFFERED,
	projectOverrides,
	SETTING_NAMES,
	toolDescription,
	unchanged,
	useOneOf,
	type ValueSetting,
	valueLine,
} from "./settings.ts";

const world = useWorld();
const PROVIDER_COMMAND = "model-router:provider";
const SCOPE_COMMAND = "model-router:scope";
const install = (imports: OmpImports = world.imports) =>
	createExtension(imports)(world.pi);
const labelOf = (setting: ValueSetting, value: string) =>
	ask(setting, value).options[0] ?? "";
const choose = (setting: ValueSetting, value: string) => {
	world.select = async () => labelOf(setting, value);
};
const lines = (...parts: string[]) => parts.join("\n");
const SETTLE_MS = 20;
const MAX_TICKS = 100;
const settle = async (dialogs: number) => {
	for (let tick = 0; tick < MAX_TICKS && world.dialogs.length < dialogs; tick++)
		await new Promise((resolve) => setImmediate(resolve));
};

test("the commands and the tool register under their names", () => {
	install();
	assert.deepEqual(Object.keys(world.commands).sort(), [
		PROVIDER_COMMAND,
		SCOPE_COMMAND,
	]);
	assert.equal(
		world.commands[PROVIDER_COMMAND]?.description,
		COMMAND_DESCRIPTIONS.provider,
	);
	assert.equal(
		world.commands[SCOPE_COMMAND]?.description,
		COMMAND_DESCRIPTIONS.scope,
	);
	assert.deepEqual(Object.keys(world.tools), [TOOL_NAME]);
});

test("the tool is essential, needs the write tier and takes an optional setting enum", () => {
	install();
	const tool = world.tools[TOOL_NAME];
	assert.equal(tool?.description, toolDescription(SETTING_NAMES));
	assert.equal(tool?.loadMode, "essential");
	assert.equal(tool?.approval, "write");
	assert.equal(typeof tool?.label, "string");
	assert.deepEqual(tool?.parameters, {
		shape: { setting: { values: SETTING_NAMES, optional: true } },
	});
});

test("with no setting the tool reads both values and the key state of each allowed provider", async () => {
	install();
	world.lockfile = lockfileWith("auto");
	assert.equal(
		await world.callTool({}),
		lines(
			valueLine("provider", "auto"),
			valueLine("scope", "core"),
			"typesafe key: set",
			"openrouter key: set",
		),
	);
});

test("a key counts as set from omp's credential or from its variable, and unset otherwise", async () => {
	install();
	world.lockfile = lockfileWith("auto");
	world.credential = async (provider) =>
		provider === "typesafe" ? KEY : undefined;
	const bare = await world.callTool(undefined);
	assert.match(bare, /typesafe key: set\nopenrouter key: unset$/);
	setEnv(OR_VARIABLE, "from-the-variable");
	assert.match(await world.callTool({}), /openrouter key: set$/);
	setEnv(OR_VARIABLE, "");
	assert.match(await world.callTool({}), /openrouter key: unset$/);
	world.credential = async () => undefined;
	setEnv(KEY_VARIABLE, "from-the-variable");
	assert.match(await world.callTool({}), /typesafe key: set\n/);
});

test("the read never returns any part of a key", async () => {
	install();
	world.lockfile = lockfileWith("auto");
	setEnv(KEY_VARIABLE, "variable-secret");
	const text = await world.callTool({});
	for (const secret of [KEY, "variable-secret", "omp-or-key"])
		assert.equal(text.includes(secret), false, secret);
});

test("only the providers the value allows are listed", async () => {
	install();
	world.lockfile = lockfileWith("openrouter");
	assert.doesNotMatch(await world.callTool({}), /typesafe key/);
});

test("unreadable settings are reported once and nothing is written", async () => {
	install();
	world.lockfile = "not json";
	assert.equal(await world.callTool({}), UNREADABLE);
	await world.runCommand(SCOPE_COMMAND, "");
	assert.deepEqual(world.notes, [UNREADABLE]);
	choose("scope", "extended");
	assert.equal(
		await world.callTool({ setting: "scope" }),
		unchanged("scope", UNREADABLE),
	);
	assert.equal(world.writes.length, 0);
});

test("the provider dialog opens with the current value first and writes the pick", async () => {
	install();
	world.lockfile = lockfileWith("typesafe");
	choose("provider", "openrouter-first");
	const text = await world.callTool({ setting: "provider" });
	const { question, options } = ask("provider", "typesafe");
	assert.deepEqual(world.dialogs, [{ title: question, options }]);
	assert.deepEqual(world.writes, [
		{ plugin: "model-router-omp", key: "provider", value: "openrouter-first" },
	]);
	assert.equal(text, valueLine("provider", "openrouter-first"));
});

test("the scope dialog writes the pick, and the next read shows it", async () => {
	install();
	choose("scope", "extended");
	const text = await world.callTool({ setting: "scope" });
	assert.deepEqual(world.writes, [
		{ plugin: "model-router-omp", key: "scope", value: "extended" },
	]);
	assert.equal(text, valueLine("scope", "extended"));
	assert.match(await world.callTool({}), /\nscope: extended\n/);
});

test("without a UI nothing is asked and nothing is written", async () => {
	install();
	world.hasUI = false;
	choose("scope", "extended");
	assert.equal(
		await world.callTool({ setting: "scope" }),
		unchanged("scope", NO_ANSWER),
	);
	assert.equal(world.dialogs.length, 0);
	assert.equal(world.writes.length, 0);
});

test("a dismissed or failing dialog writes nothing", async () => {
	install();
	const expected = unchanged("provider", NO_ANSWER);
	assert.equal(await world.callTool({ setting: "provider" }), expected);
	world.select = async () => {
		throw new Error("dialog gone");
	};
	assert.equal(await world.callTool({ setting: "provider" }), expected);
	assert.equal(world.writes.length, 0);
});

test("free text writes nothing and is never echoed", async () => {
	install();
	world.select = async () => "scope-secret-text";
	const text = await world.callTool({ setting: "scope" });
	assert.equal(text, unchanged("scope", NOT_OFFERED));
	assert.equal(text.includes("scope-secret-text"), false);
	assert.equal(world.writes.length, 0);
});

test("the current value picked again writes nothing", async () => {
	install();
	world.lockfile = lockfileScoped("extended");
	choose("scope", "extended");
	assert.equal(
		await world.callTool({ setting: "scope" }),
		unchanged("scope", alreadyValue("extended")),
	);
	assert.equal(world.writes.length, 0);
});

test("a failed write says why and changes nothing", async () => {
	install({
		...world.imports,
		writeSetting: async () => {
			throw new Error("disk full");
		},
	});
	choose("scope", "extended");
	assert.equal(
		await world.callTool({ setting: "scope" }),
		unchanged("scope", "disk full"),
	);
	install({
		...world.imports,
		writeSetting: async () => {
			throw "refused";
		},
	});
	assert.equal(
		await world.callTool({ setting: "scope" }),
		unchanged("scope", "refused"),
	);
});

test("an unknown setting is a bad call and writes nothing", async () => {
	install();
	assert.equal(
		await world.callTool({ setting: "tier" }),
		badCall(SETTING_NAMES),
	);
	assert.equal(world.writes.length, 0);
});

test("a project value that wins is named after the write", async () => {
	install();
	world.project = { scope: "core" };
	choose("scope", "extended");
	assert.equal(
		await world.callTool({ setting: "scope" }),
		lines(valueLine("scope", "core"), projectOverrides("scope")),
	);
	assert.equal(world.writes.length, 1);
});

test("a project narrowing is named after a provider write", async () => {
	install();
	world.lockfile = lockfileWith("typesafe");
	world.project = { provider: "openrouter" };
	choose("provider", "auto");
	assert.equal(
		await world.callTool({ setting: "provider" }),
		lines(valueLine("provider", "openrouter"), projectOverrides("provider")),
	);
});

test("the pick stands in when the settings cannot be read after the write", async () => {
	install({
		...world.imports,
		writeSetting: async () => {
			world.lockfile = "not json";
		},
	});
	choose("scope", "extended");
	assert.equal(
		await world.callTool({ setting: "scope" }),
		valueLine("scope", "extended"),
	);
});

test("a bare command prints the value on the screen", async () => {
	install();
	world.lockfile = lockfileWith("auto");
	await world.runCommand(PROVIDER_COMMAND, "");
	await world.runCommand(SCOPE_COMMAND, "  ");
	assert.deepEqual(world.notes, [
		valueLine("provider", "auto"),
		valueLine("scope", "core"),
	]);
	assert.equal(world.stderr.length, 0);
	assert.equal(world.writes.length, 0);
});

test("a command with a valid value writes it and prints the new value", async () => {
	install();
	await world.runCommand(SCOPE_COMMAND, " extended ");
	assert.deepEqual(world.writes, [
		{ plugin: "model-router-omp", key: "scope", value: "extended" },
	]);
	assert.deepEqual(world.notes, [valueLine("scope", "extended")]);
	assert.equal(world.dialogs.length, 0);
});

test("a command with an invalid value lists the valid ones and writes nothing", async () => {
	install();
	await world.runCommand(PROVIDER_COMMAND, "fastest");
	await world.runCommand(SCOPE_COMMAND, "core extended");
	assert.deepEqual(world.notes, [useOneOf("provider"), useOneOf("scope")]);
	assert.equal(world.writes.length, 0);
});

test("a command that repeats the value or meets a project value says so", async () => {
	install();
	await world.runCommand(SCOPE_COMMAND, "core");
	world.project = { scope: "core" };
	await world.runCommand(SCOPE_COMMAND, "extended");
	assert.deepEqual(world.notes, [
		unchanged("scope", alreadyValue("core")),
		lines(valueLine("scope", "core"), projectOverrides("scope")),
	]);
});

test("without a UI a command answers on standard error", async () => {
	install();
	world.hasUI = false;
	await world.runCommand(SCOPE_COMMAND, "extended");
	await world.runCommand(PROVIDER_COMMAND, "");
	assert.equal(world.notes.length, 0);
	assert.deepEqual(world.stderr, [
		`${valueLine("scope", "extended")}\n`,
		`${valueLine("provider", "typesafe")}\n`,
	]);
});

test("the tool says what the command says for the same outcome", async () => {
	install();
	const outcomes: [ValueSetting, string, Record<string, unknown>][] = [
		["scope", "extended", {}],
		["scope", "core", {}],
		["scope", "extended", { scope: "core" }],
		["provider", "auto", {}],
	];
	for (const [setting, value, project] of outcomes) {
		const start = () => {
			world.lockfile = lockfileWith("typesafe");
			world.project = project;
			world.notes.length = 0;
		};
		start();
		await world.runCommand(`model-router:${setting}`, value);
		const [fromCommand] = world.notes;
		start();
		choose(setting, value);
		assert.equal(await world.callTool({ setting }), fromCommand, value);
	}
});

test("calls run one at a time, and a failed call does not block the next", async () => {
	install();
	let release: (answer: string) => void = () => undefined;
	world.select = () =>
		new Promise((resolve) => {
			release = resolve;
		});
	const first = world.callTool({ setting: "scope" });
	const second = world.callTool({ setting: "scope" });
	await settle(1);
	await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
	assert.equal(world.dialogs.length, 1);
	release(labelOf("scope", "extended"));
	assert.equal(await first, valueLine("scope", "extended"));
	await settle(2);
	release(labelOf("scope", "extended"));
	assert.equal(await second, unchanged("scope", alreadyValue("extended")));
	const hostile = {
		get cwd(): never {
			throw new Error("no cwd");
		},
	};
	const tool = world.tools[TOOL_NAME] as ToolSpec;
	await assert.rejects(
		tool.execute("c", {}, undefined, undefined, hostile as never),
	);
	assert.match(await world.callTool({}), /^provider: /);
});
