import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PROVIDER_VALUES } from "../../../src/provider.ts";

const PLUGIN = join(import.meta.dirname, "..");
const ENTRY = "./extension/index.js";
const EXTERNALS = [
	"@oh-my-pi/pi-coding-agent/config/registry",
	"@oh-my-pi/pi-coding-agent/extensibility/plugins/loader",
	"@oh-my-pi/pi-utils",
	"node:fs/promises",
];

const manifest = JSON.parse(readFileSync(join(PLUGIN, "package.json"), "utf8"));
const bundle = () => readFileSync(join(PLUGIN, ENTRY), "utf8");

test("omp loads the built bundle and nothing else", () => {
	assert.deepEqual(manifest.omp.extensions, [ENTRY]);
	assert.deepEqual(readdirSync(join(PLUGIN, "extension")), ["index.js"]);
});

test("the provider setting is an enum of the four values, typesafe by default", () => {
	const { type, values, default: initial } = manifest.omp.settings.provider;
	assert.equal(type, "enum");
	assert.deepEqual(values, PROVIDER_VALUES);
	assert.equal(initial, "typesafe");
});

test("the plugin ships no agent files", () => {
	assert.equal(existsSync(join(PLUGIN, "agents")), false);
});

test("the bundle leaves only omp's own modules and one Node module external", () => {
	const imports = [...bundle().matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
	assert.deepEqual(imports.sort(), EXTERNALS);
});

test("the bundle exports the extension factory as its default", () => {
	assert.match(bundle(), /export\s*\{[^}]*\bas default\b[^}]*\}/);
});
