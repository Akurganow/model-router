import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PROVIDER_VALUES } from "../../../src/provider.ts";
import { SCOPE_VALUES } from "../../../src/scope.ts";

const PLUGIN = join(import.meta.dirname, "..");
const ENTRY = "./extension/index.js";
const EXTERNALS = [
	"@oh-my-pi/pi-coding-agent/config/registry",
	"@oh-my-pi/pi-coding-agent/extensibility/plugins/loader",
	"@oh-my-pi/pi-utils",
	"node:fs/promises",
];
// The write path loads this module on demand, so a break in it stops writes only.
const LAZY = ["@oh-my-pi/pi-coding-agent/extensibility/plugins/manager"];

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

test("the scope setting is an enum of the two values, core by default", () => {
	const { type, values, default: initial } = manifest.omp.settings.scope;
	assert.equal(type, "enum");
	assert.deepEqual(values, SCOPE_VALUES);
	assert.equal(initial, "core");
	assert.equal(typeof manifest.omp.settings.scope.description, "string");
});

test("the plugin ships no agent files", () => {
	assert.equal(existsSync(join(PLUGIN, "agents")), false);
});

test("the bundle leaves only omp's own modules and one Node module external", () => {
	const imports = [...bundle().matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
	assert.deepEqual(imports.sort(), EXTERNALS);
});

test("the plugin manager is imported on demand, never at load", () => {
	const lazy = [...bundle().matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)].map(
		(m) => m[1],
	);
	assert.deepEqual(lazy, LAZY);
});

test("the bundle exports the extension factory as its default", () => {
	assert.match(bundle(), /export\s*\{[^}]*\bas default\b[^}]*\}/);
});
