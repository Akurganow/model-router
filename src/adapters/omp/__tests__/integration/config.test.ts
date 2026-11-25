import assert from "node:assert/strict";
import { test } from "node:test";
import {
	KEY,
	KEY_VARIABLE,
	lockfileScoped,
	lockfileWith,
	logged,
	OR_VARIABLE,
	setEnv,
	useWorld,
} from "#adapters/omp/__tests__/support/fakes.ts";
import { projectOverrides } from "#adapters/omp/config.ts";
import { createExtension } from "#adapters/omp/router.ts";
import type { OmpImports, ToolSpec } from "#adapters/omp/types.ts";
import {
	alreadyValue,
	ask,
	COMMAND_DESCRIPTIONS,
	NO_ANSWER,
	NOT_OFFERED,
	TOOL_NAME,
	unchanged,
	useOneOf,
	type ValueSetting,
} from "#core/options/settings.ts";
import { UNREADABLE } from "#core/output/reasons.ts";

test("the project-override note names the setting", () => {
	assert.equal(
		projectOverrides("scope"),
		"A project value for scope overrides it.",
	);
});

const world = useWorld();
const PROVIDER_COMMAND = "model-router:provider";
const GATEWAY_COMMAND = "model-router:gateway";
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
const DIALOG_WAIT_MS = 5000;
/**
 * Waits until the given number of dialogs has opened. A call opens its dialog
 * after it reads the settings, and a busy machine can delay that past any fixed
 * number of event-loop turns, so the wait is by condition and fails the test
 * when the time runs out.
 */
const settle = async (dialogs: number) => {
	const deadline = Date.now() + DIALOG_WAIT_MS;
	while (world.dialogs.length < dialogs) {
		if (Date.now() > deadline)
			assert.fail(`dialog ${dialogs} did not open in ${DIALOG_WAIT_MS} ms`);
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
};

test("the commands and the tool register under their names", () => {
	install();
	assert.deepEqual(Object.keys(world.commands).sort(), [
		GATEWAY_COMMAND,
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
	assert.equal(
		tool?.description,
		"Reads the router's settings. With no input it returns the provider, gateway, scope and models, and whether each key the settings allow is set. With a setting name (provider, gateway, scope) the plugin asks the person in its own dialog and writes their choice; never pass a value for these. With models and a string, the tool writes that string as the models setting at the person's request, for example {typesafe:jev-latest, openai:gpt-6-luna}. Never pass a key.",
	);
	assert.equal(tool?.loadMode, "essential");
	assert.equal(tool?.approval, "write");
	assert.equal(typeof tool?.label, "string");
	assert.deepEqual(tool?.parameters, {
		shape: {
			setting: { values: ["provider", "gateway", "scope"], optional: true },
		},
	});
});

test("with no setting the tool reads both values and the key state of each allowed provider", async () => {
	install();
	world.lockfile = lockfileWith({ gateway: "auto" });
	assert.equal(
		await world.callTool({}),
		lines(
			"provider: typesafe",
			"gateway: auto (typesafe, then openrouter)",
			"scope: core",
			"models: unset",
			"typesafe model: jev-latest (OpenRouter: jev-latest)",
			"openai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)",
			"google model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)",
			"typesafe key: set",
			"openrouter key: set",
		),
	);
});

test("a key counts as set from omp's credential or from its variable, and unset otherwise", async () => {
	install();
	world.lockfile = lockfileWith({ gateway: "auto" });
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
	world.lockfile = lockfileWith({ gateway: "auto" });
	setEnv(KEY_VARIABLE, "variable-secret");
	const text = await world.callTool({});
	for (const secret of [KEY, "variable-secret", "omp-or-key"])
		assert.equal(text.includes(secret), false, secret);
});

test("only the providers the value allows are listed", async () => {
	install();
	world.lockfile = lockfileWith({ gateway: "openrouter" });
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

test("the gateway dialog opens with the current value first and writes the pick", async () => {
	install();
	world.lockfile = lockfileWith({ gateway: "direct" });
	choose("gateway", "openrouter-first");
	const text = await world.callTool({ setting: "gateway" });
	const { question, options } = ask("gateway", "direct");
	assert.deepEqual(world.dialogs, [{ title: question, options }]);
	assert.deepEqual(world.writes, [
		{ plugin: "model-router-omp", key: "gateway", value: "openrouter-first" },
	]);
	assert.equal(text, "gateway: openrouter-first (openrouter, then typesafe)");
});

test("the gateway dialog lists a stored openrouter-first first, then the rest", async () => {
	install();
	world.lockfile = lockfileWith({ gateway: "openrouter-first" });
	await world.callTool({ setting: "gateway" });
	assert.deepEqual(world.dialogs, [
		{
			title: "How should OpenRouter be used for the provider?",
			options: [
				"openrouter-first - OpenRouter, then the provider's own API if it fails",
				"direct - the provider's own API only",
				"auto - the provider's own API, then OpenRouter if it fails",
				"openrouter - OpenRouter only",
			],
		},
	]);
});

test("the scope dialog lists a stored extended first, then core", async () => {
	install();
	world.lockfile = lockfileScoped("extended");
	await world.callTool({ setting: "scope" });
	assert.deepEqual(world.dialogs, [
		{
			title: "Which agent calls should the router route?",
			options: [
				"extended - also routes other agents that pass no model",
				"core - built-in general agents only",
			],
		},
	]);
});

test("the scope dialog writes the pick, and the next read shows it", async () => {
	install();
	choose("scope", "extended");
	const text = await world.callTool({ setting: "scope" });
	assert.deepEqual(world.writes, [
		{ plugin: "model-router-omp", key: "scope", value: "extended" },
	]);
	assert.equal(text, "scope: extended");
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

test("without a UI nothing is read", async () => {
	world.hasUI = false;
	const log = logged(world, install, labelOf("scope", "extended"));
	assert.equal(
		await world.callTool({ setting: "scope" }),
		unchanged("scope", NO_ANSWER),
	);
	assert.deepEqual(log, []);
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
		"Unknown setting. Pass no setting, or one of: provider, gateway, scope",
	);
	assert.equal(world.writes.length, 0);
});

test("a project value that wins is named after the write", async () => {
	install();
	world.project = { scope: "core" };
	choose("scope", "extended");
	assert.equal(
		await world.callTool({ setting: "scope" }),
		lines("scope: core", projectOverrides("scope")),
	);
	assert.equal(world.writes.length, 1);
});

test("a project narrowing is named after a gateway write", async () => {
	install();
	world.lockfile = lockfileWith({ gateway: "direct" });
	world.project = { gateway: "openrouter" };
	choose("gateway", "auto");
	assert.equal(
		await world.callTool({ setting: "gateway" }),
		lines("gateway: openrouter (openrouter)", projectOverrides("gateway")),
	);
});

test("a command writes a value that only the project's value already holds", async () => {
	install();
	world.lockfile = lockfileWith({ gateway: "auto" });
	world.project = { gateway: "direct" };
	await world.runCommand(GATEWAY_COMMAND, "direct");
	assert.deepEqual(world.writes, [
		{ plugin: "model-router-omp", key: "gateway", value: "direct" },
	]);
	assert.deepEqual(world.notes, ["gateway: direct (typesafe)"]);
});

test("a command that meets a project value over an equal global text writes nothing and names the override", async () => {
	install();
	world.lockfile = lockfileWith({ gateway: "auto" });
	world.project = { gateway: "direct" };
	await world.runCommand(GATEWAY_COMMAND, "auto");
	assert.equal(world.writes.length, 0);
	assert.deepEqual(world.notes, [
		lines(
			"gateway: direct (typesafe)",
			"A project value for gateway overrides it.",
		),
	]);
});

test("a command answers unreadable and writes nothing when only the applied settings cannot be read", async () => {
	install({
		...world.imports,
		getPluginSettings: async () => {
			throw new Error("no settings");
		},
	});
	world.lockfile = lockfileWith({ gateway: "auto" });
	await world.runCommand(GATEWAY_COMMAND, "direct");
	assert.equal(world.writes.length, 0);
	assert.deepEqual(world.notes, ["gateway unchanged: settings unreadable"]);
});

test("the pick stands in when the settings cannot be read after the write", async () => {
	install({
		...world.imports,
		writeSetting: async () => {
			world.lockfile = "not json";
		},
	});
	choose("scope", "extended");
	assert.equal(await world.callTool({ setting: "scope" }), "scope: extended");
});

test("a bare command prints the value on the screen", async () => {
	install();
	world.lockfile = lockfileWith({ gateway: "auto" });
	await world.runCommand(GATEWAY_COMMAND, "");
	await world.runCommand(SCOPE_COMMAND, "  ");
	assert.deepEqual(world.notes, [
		"gateway: auto (typesafe, then openrouter)",
		"scope: core",
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
	assert.deepEqual(world.notes, ["scope: extended"]);
	assert.equal(world.dialogs.length, 0);
});

test("a command with an invalid value lists the valid ones and writes nothing", async () => {
	install();
	await world.runCommand(PROVIDER_COMMAND, "fastest");
	await world.runCommand(SCOPE_COMMAND, "core extended");
	assert.deepEqual(world.notes, [useOneOf("provider"), useOneOf("scope")]);
	assert.equal(world.writes.length, 0);
});

test("a valid value over a stored text that is not valid is written", async () => {
	install();
	world.lockfile = lockfileWith({ provider: "auto" });
	await world.runCommand(PROVIDER_COMMAND, "typesafe");
	assert.deepEqual(world.writes, [
		{ plugin: "model-router-omp", key: "provider", value: "typesafe" },
	]);
	assert.deepEqual(world.notes, ["provider: typesafe"]);
});

test("a command that writes the default or meets a project value says so", async () => {
	install();
	await world.runCommand(SCOPE_COMMAND, "core");
	world.project = { scope: "core" };
	await world.runCommand(SCOPE_COMMAND, "extended");
	assert.deepEqual(world.notes, [
		"scope: core",
		lines("scope: core", projectOverrides("scope")),
	]);
});

test("without a UI a command answers on standard error", async () => {
	install();
	world.hasUI = false;
	await world.runCommand(SCOPE_COMMAND, "extended");
	await world.runCommand(PROVIDER_COMMAND, "");
	assert.equal(world.notes.length, 0);
	assert.deepEqual(world.stderr, ["scope: extended\n", "provider: typesafe\n"]);
});

test("the tool says what the command says for the same outcome", async () => {
	install();
	const outcomes: [ValueSetting, string, Record<string, unknown>][] = [
		["scope", "extended", {}],
		["scope", "core", {}],
		["scope", "extended", { scope: "core" }],
		["gateway", "auto", {}],
	];
	for (const [setting, value, project] of outcomes) {
		const start = () => {
			world.lockfile = lockfileWith({ gateway: "direct" });
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
	assert.equal(await first, "scope: extended");
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

test("a dialog that fails gives its call the no-answer line, and the call behind it opens its dialog only after", async () => {
	install();
	const open: {
		resolve: (answer: string) => void;
		reject: (reason: Error) => void;
	}[] = [];
	world.select = () =>
		new Promise((resolve, reject) => {
			open.push({ resolve, reject });
		});
	const first = world.callTool({ setting: "scope" });
	const second = world.callTool({ setting: "scope" });
	await settle(1);
	await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
	assert.equal(world.dialogs.length, 1);
	open[0]?.reject(new Error("dialog gone"));
	assert.equal(await first, unchanged("scope", NO_ANSWER));
	await settle(2);
	assert.equal(world.writes.length, 0);
	open[1]?.resolve(labelOf("scope", "extended"));
	assert.equal(await second, "scope: extended");
	assert.equal(world.writes.length, 1);
});

test("a command and the tool share one queue, and a failed write does not stop the tool behind it", async () => {
	let release: () => void = () => undefined;
	let attempts = 0;
	install({
		...world.imports,
		writeSetting: async (...args) => {
			attempts += 1;
			if (attempts === 1) {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				throw new Error("disk full");
			}
			return world.imports.writeSetting(...args);
		},
	});
	choose("scope", "extended");
	const first = world.runCommand(SCOPE_COMMAND, "extended");
	const second = world.callTool({ setting: "scope" });
	const deadline = Date.now() + DIALOG_WAIT_MS;
	while (attempts < 1) {
		if (Date.now() > deadline) assert.fail("the first write did not start");
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
	assert.equal(world.dialogs.length, 0);
	assert.equal(attempts, 1);
	release();
	await first;
	assert.deepEqual(world.notes, [unchanged("scope", "disk full")]);
	assert.equal(await second, "scope: extended");
	assert.equal(world.dialogs.length, 1);
	assert.equal(attempts, 2);
});

test("a scope pick is read, asked, read again, written and read back, in that order", async () => {
	world.lockfile = lockfileScoped("core");
	const log = logged(world, install, labelOf("scope", "extended"));
	assert.equal(await world.callTool({ setting: "scope" }), "scope: extended");
	const { question, options } = ask("scope", "core");
	assert.deepEqual(world.dialogs, [{ title: question, options }]);
	assert.deepEqual(log, [
		"read",
		"select",
		"read",
		"write scope=extended",
		"read",
	]);
});

// The report lists the provider, the gateway, the scope and one line for each key the gateway allows.
test("the settings report lists the values and the key state of each allowed provider", async () => {
	install();
	const cases: {
		gateway: string;
		scope: string;
		typesafe: boolean;
		openrouter: boolean;
		text: string;
	}[] = [
		{
			gateway: "auto",
			scope: "core",
			typesafe: true,
			openrouter: true,
			text: "provider: typesafe\ngateway: auto (typesafe, then openrouter)\nscope: core\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\ntypesafe key: set\nopenrouter key: set",
		},
		{
			gateway: "auto",
			scope: "extended",
			typesafe: false,
			openrouter: true,
			text: "provider: typesafe\ngateway: auto (typesafe, then openrouter)\nscope: extended\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\ntypesafe key: unset\nopenrouter key: set",
		},
		{
			gateway: "openrouter-first",
			scope: "core",
			typesafe: true,
			openrouter: false,
			text: "provider: typesafe\ngateway: openrouter-first (openrouter, then typesafe)\nscope: core\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\nopenrouter key: unset\ntypesafe key: set",
		},
		{
			gateway: "direct",
			scope: "extended",
			typesafe: false,
			openrouter: true,
			text: "provider: typesafe\ngateway: direct (typesafe)\nscope: extended\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\ntypesafe key: unset",
		},
		{
			gateway: "openrouter",
			scope: "core",
			typesafe: true,
			openrouter: false,
			text: "provider: typesafe\ngateway: openrouter (openrouter)\nscope: core\nmodels: unset\ntypesafe model: jev-latest (OpenRouter: jev-latest)\nopenai model: gpt-6-luna (OpenRouter: openai/gpt-6-luna-decisions)\ngoogle model: gemini-decision-1 (OpenRouter: google/gemini-decision-1)\nopenrouter key: unset",
		},
	];
	for (const { gateway, scope, typesafe, openrouter, text } of cases) {
		world.lockfile = lockfileWith({ gateway, scope });
		world.credential = async (name) =>
			(name === "typesafe" ? typesafe : openrouter) ? "a-key" : undefined;
		setEnv(OR_VARIABLE, undefined);
		assert.equal(await world.callTool({}), text, `${gateway} ${scope}`);
	}
});
