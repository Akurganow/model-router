import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolve as resolveProvider } from "../src/provider.ts";
import { resolveScope } from "../src/scope.ts";
import { VALUE_SETTINGS } from "../src/settings.ts";
import { formatJson } from "./build/json.ts";
import { renderReadme } from "./build/readme.ts";
import { loadSource } from "./build/source.ts";
import { buildBundle, renderMetadata } from "./build.ts";
import { useTempRoot } from "./temp-root.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const source = loadSource(ROOT);

const GENERATED = [
	"plugins/model-router/.claude-plugin/plugin.json",
	".claude-plugin/marketplace.json",
	"plugins/model-router-omp/package.json",
	".omp-plugin/marketplace.json",
];

test("the source renders the four manifests and catalogues", () => {
	const files = renderMetadata(source);
	assert.deepEqual(files.map(({ path }) => path).sort(), [...GENERATED].sort());
});

test("each rendered file equals the committed file byte for byte", () => {
	for (const { path, text } of renderMetadata(source))
		assert.equal(formatJson(path, text, ROOT), read(path), path);
});

test("a rendered file holds no absolute path", () => {
	for (const { text } of renderMetadata(source))
		assert.doesNotMatch(text, /(^|[\s"])\/(Users|home|private|tmp)\//);
});

const box = useTempRoot("build-metadata-");

test("both bundles equal the committed bundles byte for byte", async () => {
	const claude = join(box.root, "claude.js");
	const omp = join(box.root, "omp.js");
	assert.deepEqual(await buildBundle("claude", "src/claude.ts", claude), []);
	assert.deepEqual(await buildBundle("omp", "src/omp.ts", omp), []);
	assert.equal(
		readFileSync(claude, "utf8"),
		read("plugins/model-router/hooks/register.js"),
	);
	assert.equal(
		readFileSync(omp, "utf8"),
		read("plugins/model-router-omp/extension/index.js"),
	);
});

test("the source defaults are the defaults the code applies", () => {
	assert.equal(source.options.scope.default, resolveScope(undefined));
	assert.equal(source.options.provider.default, resolveProvider(undefined));
});

test("the source holds one entry for each value setting", () => {
	const names = [...VALUE_SETTINGS].sort();
	assert.deepEqual(Object.keys(source.options).sort(), names);
	assert.deepEqual(Object.keys(source.claude.commandContents).sort(), names);
});

test("the committed README equals the rendered README", () => {
	assert.equal(renderReadme(read("README.md"), source), read("README.md"));
});
