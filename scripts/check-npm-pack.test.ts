import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	comparePackedFiles,
	expectedPackedFiles,
	main,
	packTree,
	verifyPack,
} from "./check-npm-pack.ts";
import { EXIT_USAGE } from "./exit-codes.ts";
import { useTempRoot } from "./temp-root.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const manifest = (extra: object) =>
	JSON.stringify({ name: "x", version: "1.0.0", ...extra });

const out = useTempRoot("pack-out-");
const tree = useTempRoot("pack-tree-", (put) => {
	put("package.json", manifest({ files: ["lib", "entry.js"] }));
	put("lib/a.js", "a");
	put("lib/deep/b.js", "b");
	put("lib/.DS_Store", "junk");
	put("entry.js", "e");
	put("notes.txt", "not listed");
	put("README.md", "readme");
	put("LICENCE", "licence");
	put("licenses-extra.txt", "not a licence file");
});

test("a folder in files lists its files, a file lists itself", () => {
	assert.deepEqual(expectedPackedFiles(tree.root), [
		"LICENCE",
		"README.md",
		"entry.js",
		"lib/a.js",
		"lib/deep/b.js",
		"package.json",
	]);
});

test("the main file is always packed", () => {
	tree.put("package.json", manifest({ files: ["lib"], main: "entry.js" }));
	assert.ok(expectedPackedFiles(tree.root).includes("entry.js"));
});

test("a files entry that is missing from the tree fails", () => {
	tree.put("package.json", manifest({ files: ["lib", "gone"] }));
	assert.throws(() => expectedPackedFiles(tree.root), /gone/);
});

test("a package.json without a files list fails", () => {
	tree.put("package.json", manifest({}));
	assert.throws(() => expectedPackedFiles(tree.root), /files/);
});

test("equal lists compare clean, in any order", () => {
	assert.equal(comparePackedFiles(["a", "b"], ["b", "a"]), undefined);
});

test("a difference names the files on each side", () => {
	const message = comparePackedFiles(["a", "b"], ["b", "c"]);
	assert.match(message ?? "", /missing from the tarball: a/);
	assert.match(message ?? "", /not expected in the tarball: c/);
});

test("packing a tree gives its tarball and the file list npm packed", () => {
	tree.put("package.json", manifest({ files: ["lib"] }));
	const packed = packTree(tree.root, out.root);
	assert.ok(existsSync(packed.tarball));
	assert.deepEqual(packed.files, [
		"LICENCE",
		"README.md",
		"lib/a.js",
		"lib/deep/b.js",
		"package.json",
	]);
});

test("the folder for the tarball is created when it is missing", () => {
	tree.put("package.json", manifest({ files: ["lib"] }));
	const packed = packTree(tree.root, join(out.root, "not", "yet"));
	assert.ok(existsSync(packed.tarball));
});

test("the committed npm tree packs what its files list says", () => {
	const result = spawnSync(
		process.execPath,
		["scripts/check-npm-pack.ts", out.root],
		{ cwd: ROOT, encoding: "utf8" },
	);
	assert.equal(result.status, 0, result.stderr);
	assert.ok(existsSync(result.stdout.trim()), result.stdout);
});

test("main fails with the usage code when no folder is given", () => {
	assert.equal(main([], ROOT), EXIT_USAGE);
});

test("a packed list that differs from the files list fails", () => {
	tree.put("package.json", manifest({ files: ["lib"] }));
	tree.put("lib/.npmignore", "a.js");
	assert.throws(
		() => verifyPack(tree.root, out.root),
		/missing from the tarball: .*lib\/a\.js/,
	);
});
