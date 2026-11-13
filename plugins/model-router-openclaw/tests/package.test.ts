import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { type Schema, validate } from "../../../scripts/build/schema.ts";
import { createFakeApi } from "../../../src/adapters/openclaw/fakes.ts";
import {
	PLUGIN_ID,
	readKeys,
	readSettings,
} from "../../../src/adapters/openclaw/settings.ts";

const PLUGIN = join(import.meta.dirname, "..");
const TREE = join(PLUGIN, "..", "..", "packages", "model-router");
const FLOOR = "2026.10.10";

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const manifest = json(join(PLUGIN, "openclaw.plugin.json"));
const schema: Schema = manifest.configSchema;
const property = (name: string) => schema.properties?.[name];
const bundlePath = join(PLUGIN, "index.js");
const bundle = readFileSync(bundlePath, "utf8");

// The one import outside the node: built-ins is OpenClaw's model list. The
// bundle imports it only when the tool lists the models, so it loads without
// OpenClaw.
const MODEL_LIST = "openclaw/plugin-sdk/models-provider-runtime";

test("the bundle imports only node: built-ins, and OpenClaw's model list when the tool runs", () => {
	const staticImports = [...bundle.matchAll(/\bfrom\s+"([^"]+)"/g)];
	const bareImports = [...bundle.matchAll(/^import\s+"([^"]+)"/gm)];
	const dynamicImports = [...bundle.matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)];
	for (const [, specifier = ""] of [...staticImports, ...bareImports])
		assert.match(specifier, /^node:/, specifier);
	assert.deepEqual(
		dynamicImports
			.map(([, specifier = ""]) => specifier)
			.filter((specifier) => !specifier.startsWith("node:")),
		[MODEL_LIST],
	);
	assert.doesNotMatch(bundle, /\brequire\(\s*"(?!node:)/);
});

test("the bundle loads and registers where no openclaw package resolves, and its models call says why", async () => {
	assert.throws(() => createRequire(bundlePath).resolve("openclaw"), {
		code: "MODULE_NOT_FOUND",
	});
	const { default: plugin } = await import(pathToFileURL(bundlePath).href);
	const fake = createFakeApi();
	plugin.register(fake.api);
	const result = await fake.tools[0]?.execute("call-1", { setting: "models" });
	assert.match(
		result?.content[0]?.text ?? "",
		/^models unavailable: Cannot find package 'openclaw'/,
	);
});

test("the default export carries the plugin id and a register function", async () => {
	const { default: plugin } = await import(pathToFileURL(bundlePath).href);
	assert.equal(plugin.id, PLUGIN_ID);
	assert.equal(manifest.id, PLUGIN_ID);
	assert.equal(typeof plugin.register, "function");
});

test("the manifest lists every tool the plugin registers", async () => {
	const { default: plugin } = await import(pathToFileURL(bundlePath).href);
	const fake = createFakeApi();
	plugin.register(fake.api);
	const registered = fake.tools.map((tool) => tool.name).sort();
	assert.ok(registered.length > 0);
	assert.deepEqual([...manifest.contracts.tools].sort(), registered);
});

test("the manifest starts the plugin with the gateway and names its skills folder", () => {
	assert.equal(manifest.activation.onStartup, true);
	assert.deepEqual(manifest.skills, ["./openclaw-skills"]);
	assert.deepEqual(readdirSync(join(PLUGIN, "openclaw-skills")).sort(), [
		"model-router",
		"model-router-setup",
	]);
});

test("the config schema accepts each default", () => {
	const defaults = Object.fromEntries(
		Object.entries(schema.properties ?? {}).flatMap(([name, property]) =>
			"default" in property ? [[name, property.default]] : [],
		),
	);
	assert.deepEqual(Object.keys(defaults).sort(), ["provider", "scope"]);
	assert.deepEqual(validate(schema, defaults), []);
});

test("the config schema accepts any string, and the code reads an invalid value as the default", () => {
	for (const name of ["provider", "scope"])
		assert.equal(property(name)?.enum, undefined, name);
	const invalid = { provider: "nope", scope: "nope" };
	assert.deepEqual(validate(schema, invalid), []);
	const fallback = readSettings(undefined, {});
	assert.equal(readSettings(undefined, invalid).provider, fallback.provider);
	assert.equal(readSettings(undefined, invalid).scope, fallback.scope);
});

// A record that notes each field the settings code asks it for.
function watched(): { record: Record<string, unknown>; read: Set<string> } {
	const read = new Set<string>();
	const record = new Proxy<Record<string, unknown>>(
		{},
		{
			get: (_target, name) => {
				if (typeof name === "string") read.add(name);
				return undefined;
			},
		},
	);
	return { record, read };
}

test("the config schema rejects no field the code reads", () => {
	const settings = watched();
	readSettings(undefined, settings.record);
	const keys = watched();
	readKeys(undefined, keys.record, "auto", {});
	const fields = [...settings.read, ...keys.read].sort();
	assert.deepEqual(fields, [
		"api_key",
		"large_model",
		"middle_model",
		"openrouter_api_key",
		"provider",
		"scope",
		"small_model",
	]);
	for (const field of fields)
		assert.ok(schema.properties?.[field], `${field} is in the schema`);
	assert.deepEqual(
		validate(schema, {
			provider: "auto",
			scope: "extended",
			small_model: "a/b",
			middle_model: "e/f",
			large_model: "c/d",
			api_key: "k",
			openrouter_api_key: "o",
		}),
		[],
	);
});

test("the tree's package.json carries the OpenClaw blocks at the floor", () => {
	const { openclaw } = json(join(TREE, "package.json"));
	assert.deepEqual(openclaw.extensions, ["./index.js"]);
	assert.equal(openclaw.compat.pluginApi, `>=${FLOOR}`);
	assert.equal(openclaw.build.openclawVersion, FLOOR);
	assert.equal(openclaw.install.minHostVersion, `>=${FLOOR}`);
});
