import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	PLUGIN_ID,
	readKeys,
	readSettings,
} from "#adapters/openclaw/settings.ts";
import { settingsOf, TOOL_NAME } from "#core/options/settings.ts";
import { KEY_FIELDS, KEY_HOLDERS } from "#core/providers/provider.ts";
import { formatJson } from "./build/json.ts";
import { renderOpenclaw } from "./build/openclaw.ts";
import { OPENCLAW_OUTPUTS } from "./build/outputs.ts";
import { type Schema, validate } from "./build/schema.ts";
import { loadSource } from "./build/source.ts";
import { buildBundle, MAX_BUNDLE_BYTES } from "./build.ts";
import { useTempRoot } from "./temp-root.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const source = loadSource(ROOT);
const [rendered] = renderOpenclaw(source);
const manifest = JSON.parse(rendered?.text ?? "{}");
const schema: Schema = manifest.configSchema;
const property = (name: string) => schema.properties?.[name];

test("the OpenClaw renderer writes the manifest and nothing else", () => {
	assert.deepEqual(
		renderOpenclaw(source).map(({ path }) => path),
		[OPENCLAW_OUTPUTS.manifest],
	);
});

test("the manifest names the plugin, its version, its tool and its skills", () => {
	assert.equal(manifest.id, PLUGIN_ID);
	assert.equal(manifest.id, source.openclaw.pluginId);
	assert.equal(manifest.version, source.version);
	assert.equal(manifest.description, source.descriptions.openclaw.manifest);
	assert.deepEqual(manifest.contracts, { tools: [TOOL_NAME] });
	assert.deepEqual(manifest.activation, { onStartup: true });
	assert.deepEqual(manifest.skills, source.openclaw.skills);
});

test("the manifest names the setup entry's migration and leaves requiresRuntime out", () => {
	assert.deepEqual(manifest.setup, { configMigrations: ["settings-v1"] });
});

test("the config schema holds the eleven settings and refuses any other key", () => {
	assert.equal(schema.additionalProperties, false);
	assert.deepEqual(Object.keys(schema.properties ?? {}), [
		"provider",
		"gateway",
		"scope",
		"models",
		"small_model",
		"middle_model",
		"large_model",
		"api_key",
		"openai_api_key",
		"google_api_key",
		"openrouter_api_key",
	]);
});

test("each default in the manifest is the value the code applies to an empty config", () => {
	const settings = readSettings(undefined, {});
	const chosen = settingsOf(settings.stored);
	assert.ok(!("skipped" in chosen));
	assert.equal(property("provider")?.default, chosen.provider);
	assert.equal(property("gateway")?.default, chosen.gateway);
	assert.equal(property("scope")?.default, chosen.scope);
	for (const slot of ["small_model", "middle_model", "large_model"])
		assert.equal(property(slot)?.default, undefined, slot);
	assert.deepEqual(settings.slots, {
		small: undefined,
		middle: undefined,
		large: undefined,
	});
	assert.deepEqual(readKeys(undefined, {}, chosen, {}), {});
});

test("the settings carry no enumeration, so any string is accepted and counts as the default", () => {
	for (const name of ["provider", "gateway", "scope"]) {
		assert.equal(property(name)?.enum, undefined, name);
		assert.equal(property(name)?.type, "string", name);
	}
	assert.deepEqual(
		validate(schema, { provider: "nope", gateway: "nope", scope: "nope" }),
		[],
	);
});

test("the models setting takes a string or an object of strings, with the shared label and text", () => {
	assert.deepEqual(property("models"), {
		type: ["string", "object"],
		additionalProperties: { type: "string" },
	});
	assert.deepEqual(manifest.uiHints.models, {
		label: "Scoring models",
		help: "The scoring model per provider as provider:model entries for typesafe, openai or google, such as {typesafe:jev-latest, openai:gpt-6-luna}; a provider with no entry uses its default.",
	});
	assert.deepEqual(validate(schema, { models: "{typesafe:jev-latest}" }), []);
	assert.deepEqual(
		validate(schema, { models: { typesafe: "jev-latest" } }),
		[],
	);
	assert.deepEqual(validate(schema, { models: { typesafe: 1 } }), [
		"$.models.typesafe: expected string, got number",
	]);
	assert.deepEqual(validate(schema, { models: 1 }), [
		"$.models: expected string or object, got number",
	]);
});

test("the scope help is the shared scope text", () => {
	assert.equal(
		manifest.uiHints.scope.help,
		"Which subagents are routed: core or extended, which also routes other agents that set no model.",
	);
});

test("a value outside the lists is kept as stored and skips the routing", () => {
	const bad = readSettings(undefined, { provider: "nope", scope: "nope" });
	assert.equal(bad.stored.provider, "nope");
	assert.equal(bad.stored.scope, "nope");
	assert.deepEqual(settingsOf(bad.stored), {
		skipped: "provider not valid: run setup",
	});
});

test("the key names in the source are the setting names the code reads", () => {
	const names = Object.values(KEY_FIELDS).sort();
	assert.deepEqual(Object.keys(source.keys).sort(), [...KEY_HOLDERS].sort());
	const hinted = Object.entries<object>(manifest.uiHints)
		.filter(([, hint]) => "sensitive" in hint)
		.map(([name]) => name);
	assert.deepEqual(hinted.sort(), names);
});

test("both keys are sensitive secret inputs, and the slots are not", () => {
	const keys = Object.values(KEY_FIELDS);
	for (const key of keys) assert.equal(manifest.uiHints[key].sensitive, true);
	for (const slot of ["small_model", "middle_model", "large_model"])
		assert.equal(manifest.uiHints[slot].sensitive, undefined);
	assert.deepEqual(
		manifest.configContracts.secretInputs.paths.map(
			(entry: { path: string }) => entry.path,
		),
		keys,
	);
	for (const entry of manifest.configContracts.secretInputs.paths)
		assert.equal(entry.expected, "string");
});

test("every UI hint names a property of the config schema", () => {
	for (const name of Object.keys(manifest.uiHints))
		assert.ok(schema.properties?.[name], name);
	assert.deepEqual(
		Object.keys(manifest.uiHints),
		Object.keys(schema.properties ?? {}),
	);
});

test("the rendered manifest equals the committed one byte for byte", () => {
	assert.equal(
		formatJson(OPENCLAW_OUTPUTS.manifest, rendered?.text ?? "", ROOT),
		read(OPENCLAW_OUTPUTS.manifest),
	);
});

test("the manifest holds no absolute path", () => {
	assert.doesNotMatch(
		rendered?.text ?? "",
		/(^|[\s"])\/(Users|home|private|tmp)\//,
	);
});

const box = useTempRoot("build-openclaw-");

test("the bundle builds under the cap and equals the committed bundle", async () => {
	const out = join(box.root, "index.js");
	assert.deepEqual(
		await buildBundle("openclaw", "src/adapters/openclaw/index.ts", out),
		[],
	);
	const code = readFileSync(out, "utf8");
	assert.ok(Buffer.byteLength(code) < MAX_BUNDLE_BYTES);
	assert.equal(code, read(OPENCLAW_OUTPUTS.bundle));
});

test("the setup bundle builds under the cap and equals the committed bundle", async () => {
	const out = join(box.root, "setup-api.js");
	assert.deepEqual(
		await buildBundle("openclaw", "src/adapters/openclaw/setup.ts", out),
		[],
	);
	const code = readFileSync(out, "utf8");
	assert.ok(Buffer.byteLength(code) < MAX_BUNDLE_BYTES);
	assert.equal(code, read(OPENCLAW_OUTPUTS.setup));
});

test("two builds of the bundle give identical bytes", async () => {
	const first = join(box.root, "first.js");
	const second = join(box.root, "second.js");
	await buildBundle("openclaw", "src/adapters/openclaw/index.ts", first);
	await buildBundle("openclaw", "src/adapters/openclaw/index.ts", second);
	assert.equal(readFileSync(first, "utf8"), readFileSync(second, "utf8"));
});

test("the bundles hold no absolute path", () => {
	for (const path of [OPENCLAW_OUTPUTS.bundle, OPENCLAW_OUTPUTS.setup])
		assert.doesNotMatch(
			read(path),
			/(^|[\s"'`(])\/(Users|home|private|tmp)\//,
			path,
		);
});

test("the manifest says the effort is set unless the user sets one, and the middle hint says what unset means", () => {
	assert.ok(
		manifest.description.includes(
			"It scores a task even when you set no model, and sets the effort unless you set one.",
		),
	);
	assert.equal(
		manifest.uiHints.middle_model.help,
		"The model a task rated middle gets, as provider/model; unset, the task keeps the model it would get without the plugin.",
	);
});
