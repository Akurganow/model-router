import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { checkTargets, syncTargets } from "./sync.ts";

const targets = [
	{ from: "shared/core.ts", to: "plugins/a/hooks/core.ts" },
	{ from: "shared/core.ts", to: "plugins/b/extension/core.ts" },
];
const manifests = ["plugins/a/plugin.json", "plugins/b/package.json"];
const catalog = ".omp-plugin/marketplace.json";
const catalogWith = (version: string) =>
	JSON.stringify({ plugins: [{ name: "a", version }] });

let root = "";
const put = (path: string, text: string) => {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
};
const read = (path: string) => readFileSync(join(root, path), "utf8");

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "sync-"));
	put("shared/core.ts", "export const a = 1;\n");
	put(catalog, catalogWith("0.11.0"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("sync copies the source into every target folder, creating it", () => {
	syncTargets(root, targets);
	for (const { to } of targets) assert.equal(read(to), "export const a = 1;\n");
});

test("sync replaces a stale copy", () => {
	put("plugins/a/hooks/core.ts", "old");
	syncTargets(root, targets);
	assert.equal(read("plugins/a/hooks/core.ts"), "export const a = 1;\n");
});

test("check passes when every target equals the source", () => {
	syncTargets(root, targets);
	assert.deepEqual(checkTargets(root, targets, []), []);
});

test("check fails on a missing target, naming it", () => {
	put("plugins/a/hooks/core.ts", "export const a = 1;\n");
	const problems = checkTargets(root, targets, []);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /plugins\/b\/extension\/core\.ts is missing/);
});

test("check fails on any byte difference, naming the target", () => {
	syncTargets(root, targets);
	put("plugins/b/extension/core.ts", "export const a = 1; \n");
	const problems = checkTargets(root, targets, []);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /plugins\/b\/extension\/core\.ts/);
});

test("check passes when the manifests carry one version", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put("plugins/b/package.json", '{"name": "b", "version": "0.11.0"}');
	assert.deepEqual(checkTargets(root, [], manifests), []);
});

test("check fails when manifest versions differ", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put("plugins/b/package.json", '{"version": "0.12.0"}');
	const problems = checkTargets(root, [], manifests);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /0\.11\.0/);
	assert.match(problems[0] ?? "", /0\.12\.0/);
});

test("check fails on a missing manifest, naming it", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	const problems = checkTargets(root, [], manifests);
	assert.ok(
		problems.some((p) => /plugins\/b\/package\.json is missing/.test(p)),
	);
});

test("check fails on a manifest with no version", () => {
	put("plugins/a/plugin.json", '{"name": "a"}');
	put("plugins/b/package.json", '{"version": "0.11.0"}');
	const problems = checkTargets(root, [], manifests);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /plugins\/a\/plugin\.json/);
});

test("check passes when the omp catalog matches the manifests", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put(catalog, catalogWith("0.11.0"));
	assert.deepEqual(checkTargets(root, [], ["plugins/a/plugin.json"]), []);
});

test("check fails when the omp catalog version differs, naming the catalog", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put(catalog, catalogWith("0.10.0"));
	const problems = checkTargets(root, [], ["plugins/a/plugin.json"]);
	assert.equal(problems.length, 1);
	assert.match(problems[0] ?? "", /\.omp-plugin\/marketplace\.json/);
	assert.match(problems[0] ?? "", /0\.10\.0/);
});

test("check fails when the omp catalog entry has no version", () => {
	put("plugins/a/plugin.json", '{"version": "0.11.0"}');
	put(catalog, '{"plugins": [{"name": "a"}]}');
	assert.equal(checkTargets(root, [], ["plugins/a/plugin.json"]).length, 1);
});
