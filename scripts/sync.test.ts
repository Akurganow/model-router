import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTargets, syncTargets } from "./sync.ts";
import { useTempRoot } from "./temp-root.ts";

const targets = [
	{ from: "shared/core.ts", to: "plugins/a/hooks/core.ts" },
	{ from: "shared/core.ts", to: "plugins/b/extension/core.ts" },
];
const manifests = ["plugins/a/plugin.json", "plugins/b/package.json"];
const catalog = ".omp-plugin/marketplace.json";
const catalogWith = (version: string) =>
	JSON.stringify({ plugins: [{ name: "a", version }] });

const box = useTempRoot("sync-", (put) => {
	put("shared/core.ts", "export const a = 1;\n");
	put(catalog, catalogWith("0.11.0"));
});
const { put, read } = box;

test("sync copies the source into every target folder, creating it", () => {
	syncTargets(box.root, targets);
	for (const { to } of targets) assert.equal(read(to), "export const a = 1;\n");
});

test("sync replaces a stale copy", () => {
	put("plugins/a/hooks/core.ts", "old");
	syncTargets(box.root, targets);
	assert.equal(read("plugins/a/hooks/core.ts"), "export const a = 1;\n");
});

test("check passes when every target equals the source", () => {
	syncTargets(box.root, targets);
	assert.deepEqual(checkTargets(box.root, targets, []), []);
});

test("check fails on a missing target, naming it", () => {
	put("plugins/a/hooks/core.ts", "export const a = 1;\n");
	const problems = checkTargets(box.root, targets, []);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /plugins\/b\/extension\/core\.ts is missing/);
});

test("check fails on any byte difference, naming the target", () => {
	syncTargets(box.root, targets);
	put("plugins/b/extension/core.ts", "export const a = 1; \n");
	const problems = checkTargets(box.root, targets, []);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /plugins\/b\/extension\/core\.ts/);
});

test("check passes when the manifests carry one version", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put("plugins/b/package.json", '{"name": "b", "version": "0.11.0"}');
	assert.deepEqual(checkTargets(box.root, [], manifests), []);
});

test("check fails when manifest versions differ", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put("plugins/b/package.json", '{"version": "0.12.0"}');
	const problems = checkTargets(box.root, [], manifests);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /0\.11\.0/);
	assert.match(problems[0] ?? "", /0\.12\.0/);
});

test("check fails on a missing manifest, naming it", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	const problems = checkTargets(box.root, [], manifests);
	assert.ok(
		problems.some((p) => /plugins\/b\/package\.json is missing/.test(p)),
	);
});

test("check fails on a manifest with no version", () => {
	put("plugins/a/plugin.json", '{"name": "a"}');
	put("plugins/b/package.json", '{"version": "0.11.0"}');
	const problems = checkTargets(box.root, [], manifests);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /plugins\/a\/plugin\.json/);
});

test("check passes when the omp catalog matches the manifests", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put(catalog, catalogWith("0.11.0"));
	assert.deepEqual(checkTargets(box.root, [], ["plugins/a/plugin.json"]), []);
});

test("check fails when the omp catalog version differs, naming the catalog", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put(catalog, catalogWith("0.10.0"));
	const problems = checkTargets(box.root, [], ["plugins/a/plugin.json"]);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /\.omp-plugin\/marketplace\.json/);
	assert.match(problems[0] ?? "", /0\.10\.0/);
});

test("check fails when the omp catalog entry has no version", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put(catalog, '{"plugins": [{"name": "a"}]}');
	assert.equal(checkTargets(box.root, [], ["plugins/a/plugin.json"]).length, 1);
});
