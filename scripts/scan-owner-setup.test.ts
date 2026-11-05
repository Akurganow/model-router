import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generatedPaths } from "./build.ts";
import { EXIT_USAGE } from "./exit-codes.ts";
import {
	addedLines,
	findMarkers,
	formatHit,
	scanDiff,
	scanFiles,
} from "./scan-owner-setup.ts";
import { useTempRoot } from "./temp-root.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// The samples are assembled at run time, so this file holds no marker for the scan to flag.
const MAC_HOME = ["", "Users", "alice"].join("/");
const LINUX_HOME = ["", "home", "bob"].join("/");
const SK_KEY = ["sk", "a1B2c3D4e5F6"].join("-");
const BEARER_TOKEN = `${["Bearer", "abcd1234efgh5678ijkl"].join(" ")}`;

test("each marker kind hits", () => {
	assert.deepEqual(findMarkers(`cd ${MAC_HOME}/code`), ["absolute home path"]);
	assert.deepEqual(findMarkers(`path=${LINUX_HOME}`), ["absolute home path"]);
	assert.deepEqual(findMarkers(`key ${SK_KEY}`), ["sk- key"]);
	assert.deepEqual(findMarkers(`Authorization: ${BEARER_TOKEN}`), [
		"Bearer token",
	]);
});

test("a home path passes when a letter, digit, dot, slash or tilde precedes the slash", () => {
	assert.deepEqual(findMarkers("~/.openclaw"), []);
	assert.deepEqual(findMarkers("$HOME/x"), []);
	assert.deepEqual(findMarkers("https://example.com/home/x"), []);
	assert.deepEqual(findMarkers("../home/x and ./Users/x"), []);
});

test("text that only names a bearer token or masks one passes", () => {
	assert.deepEqual(findMarkers("Bearer ***"), []);
	assert.deepEqual(findMarkers("the bearer token of the request"), []);
	assert.deepEqual(findMarkers("the Bearer token of the scoring request"), []);
	assert.deepEqual(findMarkers(`Bearer \${key}`), []);
	assert.deepEqual(findMarkers("Bearer abcdefghijklmnopqrstuvwxyz"), []);
	assert.deepEqual(findMarkers("Bearer a1"), []);
});

test("a short sk- word passes", () => {
	assert.deepEqual(findMarkers("task-sk-a1"), []);
	assert.deepEqual(findMarkers("sk-short"), []);
});

test("a hit names the file and the line, and never the value", () => {
	const hit = { path: "docs/a.md", line: 7, kind: "sk- key" } as const;
	assert.equal(formatHit(hit), "docs/a.md:7: sk- key");
	const box = useTempRoot("scan-file-");
	box.put("docs/a.md", `fine\n${SK_KEY}\n`);
	const [found] = scanFiles(box.root, ["docs/a.md"]);
	assert.deepEqual(found, { path: "docs/a.md", line: 2, kind: "sk- key" });
	assert.doesNotMatch(formatHit(found as NonNullable<typeof found>), /a1B2c3/);
});

test("one line with two kinds reports both", () => {
	assert.deepEqual(findMarkers(`${MAC_HOME} ${SK_KEY}`), [
		"absolute home path",
		"sk- key",
	]);
});

test("the two key prefixes are the ones src/brief.ts redacts", () => {
	const brief = readFileSync(join(ROOT, "src/brief.ts"), "utf8");
	assert.ok(brief.includes("\\bsk-[A-Za-z0-9_-]{8,}"));
	assert.ok(brief.includes("Bearer\\s+[A-Za-z0-9._~+/=-]+"));
});

const repo = useTempRoot("scan-repo-");
const git = (...args: string[]) =>
	execFileSync(
		"git",
		[
			"-c",
			"user.name=scan",
			"-c",
			"user.email=scan@example.com",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		{ cwd: repo.root, encoding: "utf8" },
	).trim();

test("the diff scan reads only the lines a change adds", () => {
	git("init", "-q");
	repo.put("old.md", `${MAC_HOME}\nkept\n`);
	git("add", ".");
	git("commit", "-q", "-m", "base");
	const base = git("rev-parse", "HEAD");
	repo.put("old.md", `${MAC_HOME}\nkept\nadded\n${SK_KEY}\n`);
	repo.put("new.md", `one\ntwo\n${LINUX_HOME}\n`);
	git("add", ".");
	git("commit", "-q", "-m", "change");
	assert.deepEqual(scanDiff(repo.root, base), [
		{ path: "new.md", line: 3, kind: "absolute home path" },
		{ path: "old.md", line: 4, kind: "sk- key" },
	]);
});

test("the diff scan ignores deleted lines and deleted files", () => {
	git("init", "-q");
	repo.put("gone.md", `${MAC_HOME}\n`);
	repo.put("edit.md", `${SK_KEY}\nkeep\n`);
	git("add", ".");
	git("commit", "-q", "-m", "base");
	const base = git("rev-parse", "HEAD");
	repo.put("edit.md", "keep\n");
	git("rm", "-q", "gone.md");
	git("commit", "-q", "-a", "-m", "change");
	assert.deepEqual(scanDiff(repo.root, base), []);
});

test("an added line that starts with plus signs is content, not a file header", () => {
	const diff = [
		"diff --git a/a.md b/a.md",
		"--- a/a.md",
		"+++ b/a.md",
		"@@ -1,0 +5,2 @@",
		"++ b/other.md",
		"+tail",
	].join("\n");
	assert.deepEqual(addedLines(diff), [
		{ path: "a.md", line: 5, text: "+ b/other.md" },
		{ path: "a.md", line: 6, text: "tail" },
	]);
});

test("--base without a commit is a usage error", () => {
	const run = spawnSync(
		process.execPath,
		[join(ROOT, "scripts/scan-owner-setup.ts"), "--base"],
		{ encoding: "utf8" },
	);
	assert.equal(run.status, EXIT_USAGE);
});

test("the generated files carry no marker", () => {
	assert.deepEqual(scanFiles(ROOT, generatedPaths()), []);
});
