import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { VALUE_SETTINGS } from "../src/settings.ts";
import type { Schema } from "./build/schema.ts";
import { type Install, loadSchema, type Source } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const schema = loadSchema(ROOT);

const OPTION: Source["options"]["provider"] = {
	default: "d",
	title: "t",
	descriptions: { claude: "c", omp: "o" },
};
const SECRET: Source["claude"]["userConfig"]["keys"]["api_key"] = {
	type: "t",
	title: "t",
	description: "d",
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
	privacyPolicyUrls: { claude: "c", omp: "o" },
	descriptions: { claude: TEXTS, omp: TEXTS },
	options: { provider: OPTION, scope: OPTION },
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
};

const ARRAY_ITEM = "[]";

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
