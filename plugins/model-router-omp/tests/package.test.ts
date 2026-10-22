import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const PLUGIN = join(import.meta.dirname, "..");
const ENTRY = "./extension/index.js";
const REGISTRY = "@oh-my-pi/pi-coding-agent/config/registry";

const manifest = JSON.parse(readFileSync(join(PLUGIN, "package.json"), "utf8"));
const bundle = () => readFileSync(join(PLUGIN, ENTRY), "utf8");

test("omp loads the built bundle and nothing else", () => {
	assert.deepEqual(manifest.omp.extensions, [ENTRY]);
	assert.deepEqual(readdirSync(join(PLUGIN, "extension")), ["index.js"]);
});

test("the plugin ships no agent files", () => {
	assert.equal(existsSync(join(PLUGIN, "agents")), false);
});

test("the bundle leaves only omp's registry import external", () => {
	const imports = [...bundle().matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
	assert.deepEqual(imports, [REGISTRY]);
});

test("the bundle exports the extension factory as its default", () => {
	assert.match(bundle(), /export\s*\{[^}]*\bas default\b[^}]*\}/);
});
