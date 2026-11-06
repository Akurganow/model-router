import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PLUGIN_ID, readKeys, readSettings } from "../src/openclaw-settings.ts";
import { KEY_FIELDS } from "../src/provider.ts";
import { SCOPE_VALUES } from "../src/scope.ts";
import { TOOL_NAME } from "../src/settings.ts";
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

test("the config schema holds the six settings and refuses any other key", () => {
	assert.equal(schema.additionalProperties, false);
	assert.deepEqual(Object.keys(schema.properties ?? {}), [
		"provider",
		"scope",
		"small_model",
		"large_model",
		"api_key",
		"openrouter_api_key",
	]);
});

test("each default in the manifest is the value the code applies to an empty config", () => {
	const settings = readSettings(undefined, {});
	assert.equal(property("provider")?.default, settings.provider);
	assert.equal(property("scope")?.default, settings.scope);
	assert.equal(property("small_model")?.default, undefined);
	assert.equal(property("large_model")?.default, undefined);
	assert.equal(settings.smallModel, undefined);
	assert.equal(settings.largeModel, undefined);
	assert.deepEqual(readKeys(undefined, {}, settings.provider, {}), {});
});

test("the settings carry no enumeration, so any string is accepted and counts as the default", () => {
	for (const name of ["provider", "scope"]) {
		assert.equal(property(name)?.enum, undefined, name);
		assert.equal(property(name)?.type, "string", name);
	}
	assert.deepEqual(validate(schema, { provider: "nope", scope: "nope" }), []);
});

test("the options text names each value", () => {
	assert.equal(
		manifest.uiHints.scope.help,
		source.options.scope.descriptions.openclaw,
	);
	for (const value of SCOPE_VALUES)
		assert.ok(manifest.uiHints.scope.help.includes(`${value}: `), value);
});

test("a value outside the lists reads as the default", () => {
	const settings = readSettings(undefined, {});
	const bad = readSettings(undefined, { provider: "nope", scope: "nope" });
	assert.equal(bad.provider, settings.provider);
	assert.equal(bad.scope, settings.scope);
});

test("the key names in the source are the setting names the code reads", () => {
	const names = Object.values(KEY_FIELDS).sort();
	assert.deepEqual(Object.keys(source.claude.userConfig.keys).sort(), names);
	const hinted = Object.entries(source.openclaw.uiHints)
		.filter(([, hint]) => "sensitive" in hint)
		.map(([name]) => name);
	assert.deepEqual(hinted.sort(), names);
});

test("both keys are sensitive secret inputs, and the slots are not", () => {
	const keys = Object.values(KEY_FIELDS);
	for (const key of keys) assert.equal(manifest.uiHints[key].sensitive, true);
	for (const slot of ["small_model", "large_model"])
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
	assert.deepEqual(await buildBundle("openclaw", "src/openclaw.ts", out), []);
	const code = readFileSync(out, "utf8");
	assert.ok(Buffer.byteLength(code) < MAX_BUNDLE_BYTES);
	assert.equal(code, read(OPENCLAW_OUTPUTS.bundle));
});

test("two builds of the bundle give identical bytes", async () => {
	const first = join(box.root, "first.js");
	const second = join(box.root, "second.js");
	await buildBundle("openclaw", "src/openclaw.ts", first);
	await buildBundle("openclaw", "src/openclaw.ts", second);
	assert.equal(readFileSync(first, "utf8"), readFileSync(second, "utf8"));
});

test("the bundle holds no absolute path", () => {
	assert.doesNotMatch(
		read(OPENCLAW_OUTPUTS.bundle),
		/(^|[\s"'`(])\/(Users|home|private|tmp)\//,
	);
});
