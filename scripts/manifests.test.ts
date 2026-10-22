import assert from "node:assert/strict";
import { test } from "node:test";
import { checkVersions, MANIFESTS } from "./manifests.ts";
import { useTempRoot } from "./temp-root.ts";

const claude = "plugins/model-router/.claude-plugin/plugin.json";
const omp = "plugins/model-router-omp/package.json";
const catalog = ".omp-plugin/marketplace.json";

const catalogWith = (version?: string) =>
	JSON.stringify({ plugins: [{ name: "a", version }] });

const box = useTempRoot("manifests-", (put) => {
	put(claude, '{"version": "0.11.0"}');
	put(omp, '{"name": "b", "version": "0.11.0"}');
	put(catalog, catalogWith("0.11.0"));
});
const { put } = box;

test("the list names the Claude Code and omp manifests and the omp catalog", () => {
	const paths = MANIFESTS.map((manifest) => manifest.path);
	assert.deepEqual(paths, [claude, omp, catalog]);
});

test("the catalog version sits in its first plugin entry", () => {
	const entry = MANIFESTS.find((manifest) => manifest.path === catalog);
	assert.deepEqual(entry?.versionPath, ["plugins", 0, "version"]);
});

test("check passes when the manifests and the catalog carry one version", () => {
	assert.deepEqual(checkVersions(box.root), []);
});

test("check fails when a manifest version differs, naming both versions", () => {
	put(omp, '{"version": "0.12.0"}');
	const problems = checkVersions(box.root);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /0\.11\.0/);
	assert.match(problems[0] ?? "", /0\.12\.0/);
});

test("check fails when the catalog version differs, naming the catalog", () => {
	put(catalog, catalogWith("0.10.0"));
	const problems = checkVersions(box.root);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /\.omp-plugin\/marketplace\.json/);
	assert.match(problems[0] ?? "", /0\.10\.0/);
});

test("check fails when the catalog entry has no version", () => {
	put(catalog, catalogWith());
	const problems = checkVersions(box.root);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /\.omp-plugin\/marketplace\.json/);
});

test("check fails on a manifest with no version, naming it", () => {
	put(claude, '{"name": "a"}');
	const problems = checkVersions(box.root);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /plugin\.json/);
});

test("check fails on a missing manifest, naming it", () => {
	const problems = checkVersions(box.root, [
		...MANIFESTS,
		{ path: "plugins/none/plugin.json", versionPath: ["version"] },
	]);
	assert.deepEqual(problems, ["plugins/none/plugin.json is missing"]);
});
