import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { type Schema, validate } from "../../../scripts/build/schema.ts";
import { createFakeApi } from "../../../src/adapters/openclaw/__tests__/support/fakes.ts";
import { SPAWN_TOOL } from "../../../src/adapters/openclaw/router.ts";
import {
	PLUGIN_ID,
	readKeys,
	readSettings,
} from "../../../src/adapters/openclaw/settings.ts";
import { systemOneAnswer } from "../../../src/core/__tests__/support/replies.ts";
import { settingsOf } from "../../../src/core/options/settings.ts";

const PLUGIN = join(import.meta.dirname, "..");
const TREE = join(PLUGIN, "..", "..", "packages", "model-router");
const FLOOR = "2026.10.10";

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const manifest = json(join(PLUGIN, "openclaw.plugin.json"));
const schema: Schema = manifest.configSchema;
const property = (name: string) => schema.properties?.[name];
const bundlePath = join(PLUGIN, "index.js");
const bundle = readFileSync(bundlePath, "utf8");

test("the bundle imports nothing outside the node: built-ins", () => {
	const staticImports = [...bundle.matchAll(/\bfrom\s+"([^"]+)"/g)];
	const bareImports = [...bundle.matchAll(/^import\s+"([^"]+)"/gm)];
	const dynamicImports = [...bundle.matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)];
	for (const [, specifier = ""] of [
		...staticImports,
		...bareImports,
		...dynamicImports,
	])
		assert.match(specifier, /^node:/, specifier);
	assert.doesNotMatch(bundle, /\brequire\(\s*"(?!node:)/);
});

test("the default export carries the plugin id and a register function", async () => {
	const { default: plugin } = await import(pathToFileURL(bundlePath).href);
	assert.equal(plugin.id, PLUGIN_ID);
	assert.equal(manifest.id, PLUGIN_ID);
	assert.equal(typeof plugin.register, "function");
});

test("a routed spawn sends the version of metadata/source.json in its User-Agent", async (t) => {
	const { version } = json(join(PLUGIN, "..", "..", "metadata", "source.json"));
	const headers: unknown[] = [];
	const realFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = realFetch;
	});
	globalThis.fetch = async (_url, init) => {
		headers.push(init?.headers);
		return Response.json(systemOneAnswer(1, 1));
	};
	const { default: plugin } = await import(pathToFileURL(bundlePath).href);
	const fake = createFakeApi({
		pluginConfig: { provider: "typesafe", api_key: "test-key" },
	});
	plugin.register(fake.api);
	await fake.beforeToolCall()(
		{ toolName: SPAWN_TOOL, params: { task: "do the work" } },
		{ toolName: SPAWN_TOOL, agentId: "main" },
	);
	assert.equal(headers.length, 1);
	assert.equal(
		(headers[0] as Record<string, string>)["User-Agent"],
		`model-router/${version} (+https://github.com/Akurganow/model-router)`,
	);
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
	assert.deepEqual(Object.keys(defaults).sort(), [
		"gateway",
		"provider",
		"scope",
	]);
	assert.deepEqual(validate(schema, defaults), []);
});

test("the config schema accepts any string, and the code skips routing for an invalid value", () => {
	for (const name of ["provider", "gateway", "scope"])
		assert.equal(property(name)?.enum, undefined, name);
	const invalid = { provider: "nope", gateway: "nope", scope: "nope" };
	assert.deepEqual(validate(schema, invalid), []);
	assert.deepEqual(settingsOf(readSettings(undefined, invalid).stored), {
		skipped: "provider not valid: run setup",
	});
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
	readKeys(
		undefined,
		keys.record,
		{ provider: "typesafe", gateway: "auto" },
		{},
	);
	const fields = [...settings.read, ...keys.read].sort();
	assert.deepEqual(fields, [
		"api_key",
		"gateway",
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
			provider: "typesafe",
			gateway: "auto",
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
