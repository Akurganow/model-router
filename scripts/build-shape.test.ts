import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SLOT_SETTINGS } from "#core/decision/slots.ts";
import { VALUE_SETTINGS } from "#core/options/settings.ts";
import type { Schema } from "./build/schema.ts";
import {
	type Install,
	keyHolderProblems,
	loadSchema,
	loadSource,
	type Source,
} from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const schema = loadSchema(ROOT);

const OPTION: Source["options"]["scope"] = { title: "t", description: "d" };
const KEY: Source["keys"]["typesafe"] = { title: "t", description: "d" };
const HINT: Source["openclaw"]["uiHints"]["small_model"] = {
	label: "l",
	help: "h",
};
const INSTALL: Install = {
	heading: "h",
	commands: ["c"],
	source: { publisher: "p", title: "t", url: "u" },
	ciSystems: ["s"],
};
const MODELS: Source["models"] = { title: "t", description: "d" };
const TEXTS = { manifest: "m", catalogue: "c" };

// tsc rejects a key this literal lacks or adds, so the type, the schema and the source change together.
const FIXTURE: Source = {
	name: "n",
	version: "1.0.0",
	license: "l",
	homepage: "h",
	repository: "r",
	author: { name: "a", url: "u" },
	keywords: ["k"],
	privacyPolicyUrls: { claude: "c", omp: "o", openclaw: "w", hermes: "h" },
	descriptions: {
		claude: TEXTS,
		omp: TEXTS,
		openclaw: { manifest: "m" },
		hermes: { manifest: "m" },
	},
	options: { provider: OPTION, gateway: OPTION, scope: OPTION },
	models: MODELS,
	keys: {
		typesafe: KEY,
		openai: KEY,
		google: KEY,
		perplexity: KEY,
		openrouter: KEY,
	},
	claude: {
		skills: ["s"],
		commandContents: { provider: "p", gateway: "g", scope: "s" },
		userConfig: { optionType: "t" },
		catalogueSource: "c",
		install: INSTALL,
	},
	omp: {
		package: { name: "n", private: true, type: "t", extensions: ["e"] },
		npmCommands: ["c"],
		settingType: "t",
		catalogueSource: "c",
		install: INSTALL,
	},
	openclaw: {
		pluginId: "p",
		name: "n",
		settingType: "t",
		extensions: ["e"],
		skills: ["s"],
		hostFloor: "1.0.0",
		uiHints: {
			small_model: HINT,
			middle_model: HINT,
			large_model: HINT,
		},
		install: INSTALL,
	},
	hermes: {
		pluginName: "n",
		backendName: "b",
		requiresHermes: ">=1.0.0",
		settings: {
			small_model: HINT,
			middle_model: HINT,
			large_model: HINT,
		},
		install: INSTALL,
	},
	npm: {
		name: "n",
		private: false,
		type: "t",
		description: "d",
		keywords: ["k"],
		publishConfig: { access: "a" },
	},
};

const ARRAY_ITEM = "[]";

/**
 * Lists the dotted path of every required key in a schema node, following $ref
 * and array items.
 */
function requiredPaths(node: Schema, prefix = ""): string[] {
	const target = node.$ref
		? schema.$defs?.[node.$ref.replace("#/$defs/", "")]
		: node;
	if (!target) throw new Error(`${prefix}: unresolved ${node.$ref}`);
	const items = target.items
		? requiredPaths(target.items, `${prefix}${ARRAY_ITEM}`)
		: [];
	return [
		...items,
		...(target.required ?? []).flatMap((name) => [
			`${prefix}.${name}`,
			...requiredPaths(target.properties?.[name] ?? {}, `${prefix}.${name}`),
		]),
	];
}

/**
 * Lists the dotted path of every key in a value, with [] for an array item, to
 * compare with requiredPaths.
 */
function keyPaths(value: unknown, prefix = ""): string[] {
	if (Array.isArray(value))
		return value.flatMap((item) => keyPaths(item, `${prefix}${ARRAY_ITEM}`));
	if (typeof value !== "object" || value === null) return [];
	return Object.entries(value).flatMap(([key, member]) => [
		`${prefix}.${key}`,
		...keyPaths(member, `${prefix}.${key}`),
	]);
}

const unique = (paths: string[]) => [...new Set(paths)].sort();

// The key record is keyed by key holder, and the schema names no holder. loadSource checks the members against KEY_HOLDERS.
const HOLDER_TEXT = /^\.keys\./;

test("the schema requires exactly the keys of the Source type", () => {
	assert.deepEqual(
		unique(requiredPaths(schema)),
		unique(keyPaths(FIXTURE).filter((path) => !HOLDER_TEXT.test(path))),
	);
});

/**
 * Returns the required names of the schema node at the given property path.
 */
const requiredAt = (...names: string[]): string[] => [
	...(names.reduce<Schema | undefined>(
		(node, name) => node?.properties?.[name],
		schema,
	)?.required ?? []),
];

test("the option and command maps hold one key per value setting", () => {
	const settings = [...VALUE_SETTINGS].sort();
	assert.deepEqual(Object.keys(FIXTURE.options).sort(), settings);
	assert.deepEqual(
		Object.keys(FIXTURE.claude.commandContents).sort(),
		settings,
	);
	assert.deepEqual(requiredAt("options").sort(), settings);
	assert.deepEqual(requiredAt("claude", "commandContents").sort(), settings);
});

// The builders read a hint for each slot setting, so the source must name one for each, in the slot order.
test("the source names a hint for each slot setting of OpenClaw and Hermes", () => {
	const source = loadSource(ROOT);
	const EXPECTED = ["small_model", "middle_model", "large_model"];
	assert.deepEqual(Object.keys(source.openclaw.uiHints), EXPECTED);
	assert.deepEqual(Object.keys(source.hermes.settings), EXPECTED);
	assert.deepEqual(SLOT_SETTINGS, EXPECTED);
});

test("keyHolderProblems names a missing key holder and a member that names none", () => {
	const source = loadSource(ROOT);
	const { openrouter: _dropped, ...keys } = source.keys;
	const broken = {
		...source,
		keys: { ...keys, nobody: KEY },
	} as unknown as Source;
	assert.deepEqual(keyHolderProblems(broken), [
		"$.keys.openrouter: openrouter is a key holder, so the text is required",
		"$.keys.nobody: nobody is not a key holder, so the text is not allowed",
	]);
});
