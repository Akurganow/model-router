import assert from "node:assert/strict";
import { test } from "node:test";
import {
	lockfileScoped,
	lockfileWith,
	OR_VARIABLE,
	setEnv,
	useWorld,
} from "./fakes.ts";
import { createExtension } from "./router.ts";
import type { OmpImports } from "./types.ts";

const world = useWorld();
const SCOPE_QUESTION = "Which agent calls should the router route?";
const CORE = "core - today's routing: built-in general agents only";
const EXTENDED = "extended - also routes other agents that pass no model";
const PROVIDER_QUESTION = "Which providers should score subagent calls?";
const AUTO = "auto - TypeSafe, then OpenRouter if TypeSafe fails";
const OPENROUTER_FIRST =
	"openrouter-first - OpenRouter, then TypeSafe if OpenRouter fails";
const TYPESAFE = "typesafe - TypeSafe only";
const OPENROUTER = "openrouter - OpenRouter only";

// Installs the extension with each host call logged, and the dialog answering with `answer`.
function logged(
	answer: () => Promise<string | undefined>,
	write?: () => Promise<void>,
) {
	const log: string[] = [];
	const imports: OmpImports = {
		...world.imports,
		getPluginSettings: async (name, cwd) => {
			log.push("read");
			return world.imports.getPluginSettings(name, cwd);
		},
		writeSetting: async (cwd, plugin, key, value) => {
			log.push(`write ${key}=${value}`);
			return (
				write ?? (() => world.imports.writeSetting(cwd, plugin, key, value))
			)();
		},
	};
	world.select = async () => {
		log.push("select");
		return answer();
	};
	createExtension(imports)(world.pi);
	return log;
}

test("a scope pick is read, asked, read again, written and read back, in that order", async () => {
	world.lockfile = lockfileScoped("core");
	const log = logged(async () => EXTENDED);
	assert.equal(await world.callTool({ setting: "scope" }), "scope: extended");
	assert.deepEqual(world.dialogs, [
		{ title: SCOPE_QUESTION, options: [CORE, EXTENDED] },
	]);
	assert.deepEqual(log, [
		"read",
		"select",
		"read",
		"write scope=extended",
		"read",
	]);
});

test("a provider dialog opens with the stored value first", async () => {
	world.lockfile = lockfileWith("openrouter-first");
	const log = logged(async () => AUTO);
	assert.equal(
		await world.callTool({ setting: "provider" }),
		"provider: auto (typesafe, then openrouter)",
	);
	assert.deepEqual(world.dialogs, [
		{
			title: PROVIDER_QUESTION,
			options: [OPENROUTER_FIRST, AUTO, TYPESAFE, OPENROUTER],
		},
	]);
	assert.deepEqual(log, [
		"read",
		"select",
		"read",
		"write provider=auto",
		"read",
	]);
});

test("without a UI nothing is read, asked or written", async () => {
	world.hasUI = false;
	const log = logged(async () => EXTENDED);
	assert.equal(
		await world.callTool({ setting: "scope" }),
		"scope unchanged: no answer from the dialog",
	);
	assert.deepEqual(log, []);
	assert.deepEqual(world.dialogs, []);
});

test("a dialog that returns nothing or rejects answers no answer after one read", async () => {
	const log = logged(async () => undefined);
	assert.equal(
		await world.callTool({ setting: "scope" }),
		"scope unchanged: no answer from the dialog",
	);
	assert.deepEqual(log, ["read", "select"]);
	const rejected = logged(async () => {
		throw new Error("dialog gone");
	});
	assert.equal(
		await world.callTool({ setting: "scope" }),
		"scope unchanged: no answer from the dialog",
	);
	assert.deepEqual(rejected, ["read", "select"]);
	assert.deepEqual(world.writes, []);
});

test("an answer that is not a label is not offered, is never echoed and writes nothing", async () => {
	const log = logged(async () => "extended");
	const text = await world.callTool({ setting: "scope" });
	assert.equal(
		text,
		"scope unchanged: the answer was not one of the offered values",
	);
	assert.deepEqual(log, ["read", "select"]);
	assert.deepEqual(world.writes, []);
});

test("the stored value picked again says it is already set after the second read", async () => {
	world.lockfile = lockfileScoped("extended");
	const log = logged(async () => EXTENDED);
	assert.equal(
		await world.callTool({ setting: "scope" }),
		"scope unchanged: already extended",
	);
	assert.deepEqual(log, ["read", "select", "read"]);
	assert.deepEqual(world.writes, []);
});

test("a write that throws leaves the setting unchanged after the second read", async () => {
	const log = logged(
		async () => EXTENDED,
		async () => {
			throw new Error("disk full");
		},
	);
	assert.equal(
		await world.callTool({ setting: "scope" }),
		"scope unchanged: disk full",
	);
	assert.deepEqual(log, ["read", "select", "read", "write scope=extended"]);
});

test("unreadable settings leave the setting unchanged and write nothing", async () => {
	world.lockfile = "not json";
	const log = logged(async () => EXTENDED);
	assert.equal(
		await world.callTool({ setting: "scope" }),
		"scope unchanged: settings unreadable",
	);
	assert.deepEqual(world.writes, []);
	assert.equal(log[0], "read");
});

test("a project value that wins is named after the write", async () => {
	world.lockfile = lockfileScoped("core");
	world.project = { scope: "core" };
	logged(async () => EXTENDED);
	assert.equal(
		await world.callTool({ setting: "scope" }),
		"scope: core\nA project value for scope overrides it.",
	);
});

// The report lists the stored provider, the scope and one line for each key the provider allows.
test("the settings report lists the values and the key state of each allowed provider", async () => {
	createExtension(world.imports)(world.pi);
	const cases: {
		provider: string;
		scope: string;
		typesafe: boolean;
		openrouter: boolean;
		text: string;
	}[] = [
		{
			provider: "auto",
			scope: "core",
			typesafe: true,
			openrouter: true,
			text: "provider: auto (typesafe, then openrouter)\nscope: core\ntypesafe key: set\nopenrouter key: set",
		},
		{
			provider: "auto",
			scope: "extended",
			typesafe: false,
			openrouter: true,
			text: "provider: auto (typesafe, then openrouter)\nscope: extended\ntypesafe key: unset\nopenrouter key: set",
		},
		{
			provider: "openrouter-first",
			scope: "core",
			typesafe: true,
			openrouter: false,
			text: "provider: openrouter-first (openrouter, then typesafe)\nscope: core\nopenrouter key: unset\ntypesafe key: set",
		},
		{
			provider: "typesafe",
			scope: "extended",
			typesafe: false,
			openrouter: true,
			text: "provider: typesafe (typesafe)\nscope: extended\ntypesafe key: unset",
		},
		{
			provider: "openrouter",
			scope: "core",
			typesafe: true,
			openrouter: false,
			text: "provider: openrouter (openrouter)\nscope: core\nopenrouter key: unset",
		},
	];
	for (const { provider, scope, typesafe, openrouter, text } of cases) {
		world.lockfile = {
			plugins: {},
			settings: { "model-router-omp": { provider, scope } },
		};
		world.credential = async (name) =>
			(name === "typesafe" ? typesafe : openrouter) ? "a-key" : undefined;
		setEnv(OR_VARIABLE, undefined);
		assert.equal(await world.callTool({}), text, `${provider} ${scope}`);
	}
});
