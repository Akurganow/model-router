import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generatedFiles } from "./build/copies.ts";
import { EXIT_USAGE } from "./exit-codes.ts";
import {
	addedLines,
	diffRange,
	findMarkers,
	formatHit,
	MARKERS,
	scanDiff,
	scanFiles,
} from "./scan-owner-setup.ts";
import { useTempRoot } from "./temp-root.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PROCESS_TIMEOUT_MS = 60_000;

// The samples are assembled at run time, so this file holds no marker for the scan to flag.
const MAC_HOME = ["", "Users", "alice"].join("/");
const LINUX_HOME = ["", "home", "bob"].join("/");
const FILE_URL_HOME = `file://${MAC_HOME}`;
const WINDOWS_HOME = ["C:", "Users", "carol"].join("\\");
const WINDOWS_SLASH_HOME = ["D:", "Users", "dave"].join("/");
// JSON and TypeScript strings double each backslash of a Windows path.
const ESCAPED_WINDOWS_HOME = ["C:", "Users", "bob"].join("\\\\");
const SK_KEY = ["sk", "a1B2c3D4e5F6"].join("-");
const BEARER_TOKEN = `${["Bearer", "abcd1234efgh5678ijkl"].join(" ")}`;

test("each marker kind hits", () => {
	assert.deepEqual(findMarkers(`cd ${MAC_HOME}/code`), ["absolute home path"]);
	assert.deepEqual(findMarkers(`path=${LINUX_HOME}`), ["absolute home path"]);
	assert.deepEqual(findMarkers(`open ${FILE_URL_HOME}/x`), [
		"absolute home path",
	]);
	assert.deepEqual(findMarkers(`cd ${WINDOWS_HOME}\\code`), [
		"absolute home path",
	]);
	assert.deepEqual(findMarkers(`cd ${WINDOWS_SLASH_HOME}/code`), [
		"absolute home path",
	]);
	assert.deepEqual(findMarkers(`"cwd": "${ESCAPED_WINDOWS_HOME}"`), [
		"absolute home path",
	]);
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
	assert.deepEqual(findMarkers("https://x/home/page"), []);
});

test("a placeholder in angle brackets passes", () => {
	assert.deepEqual(findMarkers("/home/<name>"), []);
	assert.deepEqual(findMarkers(["C:", "Users", "<name>"].join("\\")), []);
});

test("text that only names a bearer token or masks one passes", () => {
	assert.deepEqual(findMarkers("Bearer ***"), []);
	assert.deepEqual(findMarkers("the bearer token of the request"), []);
	assert.deepEqual(findMarkers("the Bearer token of the scoring request"), []);
	assert.deepEqual(findMarkers(`Bearer \${key}`), []);
	assert.deepEqual(findMarkers("Bearer abcdefghijklmnopqrstuvwxyz"), []);
	assert.deepEqual(findMarkers("Bearer a1"), []);
});

test("the bearer rule ignores case, as the redaction in src/brief.ts does", () => {
	const lower = BEARER_TOKEN.replace("Bearer", "bearer");
	assert.deepEqual(findMarkers(`Authorization: ${lower}`), ["Bearer token"]);
	const bearer = MARKERS.find(({ kind }) => kind === "Bearer token");
	assert.ok(bearer?.pattern.flags.includes("i"));
});

test("a short sk- word passes", () => {
	assert.deepEqual(findMarkers("task-sk-a1"), []);
	assert.deepEqual(findMarkers("sk-short"), []);
});

// useTempRoot registers its hooks when called, so it must run at module level.
const box = useTempRoot("scan-file-");

test("a hit names the file and the line, and never the value", () => {
	const hit = { path: "docs/a.md", line: 7, kind: "sk- key" } as const;
	assert.equal(formatHit(hit), "docs/a.md:7: sk- key");
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
	assert.ok(brief.includes("Bearer\\s+[A-Za-z0-9._~+/=-]+/gi"));
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
		{ cwd: repo.root, encoding: "utf8", timeout: PROCESS_TIMEOUT_MS },
	).trim();
const scan = (base: string) =>
	scanDiff(repo.root, diffRange(repo.root, base).range);

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
	assert.deepEqual(scan(base), [
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
	assert.deepEqual(scan(base), []);
});

const ZERO_ID = "0".repeat(40);

test("a base the clone lacks scans the last commit against its first parent", () => {
	git("init", "-q");
	repo.put("a.md", `${MAC_HOME}\n`);
	git("add", ".");
	git("commit", "-q", "-m", "older");
	repo.put("a.md", `${MAC_HOME}\n${SK_KEY}\n`);
	git("commit", "-q", "-a", "-m", "head");
	assert.deepEqual(scan(ZERO_ID), [{ path: "a.md", line: 2, kind: "sk- key" }]);
	assert.match(diffRange(repo.root, ZERO_ID).note ?? "", /last commit/);
});

test("a base the clone lacks scans from the merge base with origin/main", () => {
	git("init", "-q");
	repo.put("a.md", "fine\n");
	git("add", ".");
	git("commit", "-q", "-m", "main");
	git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"));
	repo.put("b.md", `${LINUX_HOME}\n`);
	git("add", ".");
	git("commit", "-q", "-m", "first of branch");
	repo.put("c.md", `${SK_KEY}\n`);
	git("add", ".");
	git("commit", "-q", "-m", "second of branch");
	assert.deepEqual(scan(ZERO_ID), [
		{ path: "b.md", line: 1, kind: "absolute home path" },
		{ path: "c.md", line: 1, kind: "sk- key" },
	]);
	assert.match(diffRange(repo.root, ZERO_ID).note ?? "", /merge base/);
});

test("a tip that is origin/main itself falls back to the last commit", () => {
	git("init", "-q");
	repo.put("a.md", `${LINUX_HOME}\n`);
	git("add", ".");
	git("commit", "-q", "-m", "older");
	repo.put("b.md", `${SK_KEY}\n`);
	git("add", ".");
	git("commit", "-q", "-m", "tip");
	git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"));
	assert.deepEqual(scan(ZERO_ID), [{ path: "b.md", line: 1, kind: "sk- key" }]);
	assert.match(diffRange(repo.root, ZERO_ID).note ?? "", /last commit/);
});

test("a base the clone lacks on a first commit scans every line of it", () => {
	git("init", "-q");
	repo.put("a.md", `fine\n${LINUX_HOME}\n`);
	git("add", ".");
	git("commit", "-q", "-m", "first");
	assert.deepEqual(scan(""), [
		{ path: "a.md", line: 2, kind: "absolute home path" },
	]);
});

test("a base the clone has needs no note", () => {
	git("init", "-q");
	repo.put("a.md", "fine\n");
	git("add", ".");
	git("commit", "-q", "-m", "base");
	assert.equal(diffRange(repo.root, git("rev-parse", "HEAD")).note, undefined);
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

const QUOTED_NAME = 'say "hi"\\it.md';

test("a file whose name git quotes is read after a deleted file", () => {
	git("init", "-q");
	repo.put("gone.md", "bye\n");
	git("add", ".");
	git("commit", "-q", "-m", "base");
	const base = git("rev-parse", "HEAD");
	git("rm", "-q", "gone.md");
	repo.put(QUOTED_NAME, `fine\n${SK_KEY}\n`);
	git("add", ".");
	git("commit", "-q", "-m", "change");
	assert.deepEqual(scan(base), [
		{ path: QUOTED_NAME, line: 2, kind: "sk- key" },
	]);
});

test("a quoted header decodes quotes, backslashes, control characters and octal bytes", () => {
	const header = (quoted: string) =>
		[
			"diff --git a/x b/x",
			`+++ "b/${quoted}"\t`,
			"@@ -0,0 +1 @@",
			"+line",
		].join("\n");
	const pathOf = (quoted: string) => addedLines(header(quoted))[0]?.path;
	assert.equal(pathOf('a\\"b'), 'a"b');
	assert.equal(pathOf("a\\\\b"), "a\\b");
	assert.equal(pathOf("a\\tb\\nc"), "a\tb\nc");
	assert.equal(pathOf("caf\\303\\251.md"), "caf\u00e9.md");
});

test("an added line under a file header the parser cannot read fails the scan", () => {
	const diff = [
		"diff --git a/a.md b/a.md",
		"+++ b/a.md",
		"@@ -0,0 +1 @@",
		"+one",
		"diff --git i/b.md w/b.md",
		"+++ w/b.md",
		"@@ -0,0 +1 @@",
		"+two",
	].join("\n");
	assert.throws(() => addedLines(diff), {
		message: "unreadable file header before line 8",
	});
});

test("a diff prefix set in the git config does not hide added lines", () => {
	git("init", "-q");
	git("config", "diff.noprefix", "true");
	repo.put("a.md", "fine\n");
	git("add", ".");
	git("commit", "-q", "-m", "base");
	const base = git("rev-parse", "HEAD");
	repo.put("a.md", `fine\n${SK_KEY}\n`);
	git("commit", "-q", "-a", "-m", "change");
	assert.deepEqual(scanDiff(repo.root, diffRange(repo.root, base).range), [
		{ path: "a.md", line: 2, kind: "sk- key" },
	]);
});

test("a git run that cannot start fails the base check instead of narrowing it", () => {
	assert.throws(() => diffRange(join(repo.root, "missing-folder"), "HEAD"), {
		message: /git could not run/,
	});
});

test("--base without a commit is a usage error", () => {
	const run = spawnSync(
		process.execPath,
		[join(ROOT, "scripts/scan-owner-setup.ts"), "--base"],
		{ encoding: "utf8", timeout: PROCESS_TIMEOUT_MS },
	);
	assert.equal(run.status, EXIT_USAGE);
});

test("the generated files carry no marker", () => {
	assert.deepEqual(scanFiles(ROOT, generatedFiles(ROOT)), []);
});
