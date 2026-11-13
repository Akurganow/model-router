import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { VALUE_SETTINGS } from "../src/core/settings.ts";
import { SLOTS, slotSetting } from "../src/core/slots.ts";
import type { Schema } from "./build/schema.ts";
import {
	type Install,
	loadSchema,
	loadSource,
	type Source,
} from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const schema = loadSchema(ROOT);

const OPTION: Source["options"]["scope"] = {
	default: "d",
	title: "t",
	descriptions: { claude: "c", omp: "o", openclaw: "w" },
};
const HERMES_OPTION: Source["options"]["provider"] = {
	...OPTION,
	descriptions: { claude: "c", omp: "o", openclaw: "w", hermes: "h" },
};
const SECRET: Source["claude"]["userConfig"]["keys"]["api_key"] = {
	type: "t",
	title: "t",
	description: "d",
	sensitive: true,
};
const HINT: Source["openclaw"]["uiHints"]["small_model"] = {
	label: "l",
	help: "h",
};
const SECRET_HINT: Source["openclaw"]["uiHints"]["api_key"] = {
	label: "l",
	help: "h",
	sensitive: true,
};
const INSTALL: Install = {
	heading: "h",
	commands: ["c"],
	source: { publisher: "p", title: "t", url: "u" },
	ciSystems: ["s"],
};
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
	options: { provider: HERMES_OPTION, scope: OPTION },
	claude: {
		skills: ["s"],
		commandContents: { provider: "p", scope: "s" },
		userConfig: {
			optionType: "t",
			keys: { api_key: SECRET, openrouter_api_key: SECRET },
		},
		catalogueSource: "c",
		install: INSTALL,
	},
	omp: {
		package: { name: "n", private: true, type: "t", extensions: ["e"] },
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
			api_key: SECRET_HINT,
			openrouter_api_key: SECRET_HINT,
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
			typesafe_api_key: HINT,
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

test("the schema requires exactly the keys of the Source type", () => {
	assert.deepEqual(unique(requiredPaths(schema)), unique(keyPaths(FIXTURE)));
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
	const slotKeys = (hints: object, others: readonly string[]) =>
		Object.keys(hints).filter((key) => !others.includes(key));
	const SLOT_SETTINGS = ["small_model", "middle_model", "large_model"];
	assert.deepEqual(
		slotKeys(source.openclaw.uiHints, ["api_key", "openrouter_api_key"]),
		SLOT_SETTINGS,
	);
	assert.deepEqual(
		slotKeys(source.hermes.settings, ["typesafe_api_key"]),
		SLOT_SETTINGS,
	);
	assert.deepEqual(SLOTS.map(slotSetting), SLOT_SETTINGS);
});
