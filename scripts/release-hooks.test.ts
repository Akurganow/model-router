import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { MANIFESTS, SOURCE } from "./manifests.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const NEW_VERSION = "9.9.9";
// A spawnSync blocks the test runner's own timer, so this bound must stay
// below the runner's 60-second test timeout to fail the test by name.
const HOOK_TIMEOUT_MS = 30_000;
const identity = ["-c", "user.name=release-test", "-c", "user.email=a@b.test"];

function run(cwd: string, command: string, args: string[]) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		timeout: HOOK_TIMEOUT_MS,
	});
	assert.equal(
		result.status,
		0,
		`${command} ${args.join(" ")}\n${result.stderr}`,
	);
	return result.stdout;
}

const git = (cwd: string, ...args: string[]) => run(cwd, "git", args);

// Needs the list as `pre_bump_hooks = [ "hook", ... ]` with plain double-quoted strings, no escaped quote.
// A `]` inside a hook string is fine; a comment line in the list must not hold a quote or a `]`.
function hooksIn(toml: string): string[] {
	const list = /^pre_bump_hooks = \[((?:"[^"]*"|[^\]"])*)\]/m.exec(toml)?.[1];
	if (list === undefined)
		throw new Error("pre_bump_hooks not found in cog.toml");
	return [...list.matchAll(/"([^"]+)"/g)].map(([, hook]) =>
		(hook ?? "").replaceAll("{{version}}", NEW_VERSION),
	);
}

const preBumpHooks = () =>
	hooksIn(readFileSync(join(REPO, "cog.toml"), "utf8"));

function runHook(cwd: string, hook: string) {
	const [program, ...args] = hook.split(" ");
	assert.equal(program, "node", `pre-bump hook ${hook} does not run node`);
	return run(cwd, process.execPath, args);
}

/**
 * Copies the files git lists, untracked ones included, so a new file a release
 * needs is copied before its first commit. Links and node_modules are left out;
 * the copy gets its own link to node_modules.
 */
function copyTree(from: string, to: string) {
	const listed = git(
		from,
		"ls-files",
		"-z",
		"--cached",
		"--others",
		"--exclude-standard",
		"--exclude=node_modules",
	);
	// A deleted file or a link is not copied; the copy gets its own node_modules link.
	for (const file of listed.split("\0").filter(Boolean)) {
		if (!lstatSync(join(from, file), { throwIfNoEntry: false })?.isFile())
			continue;
		mkdirSync(dirname(join(to, file)), { recursive: true });
		copyFileSync(join(from, file), join(to, file));
	}
}

function commitAll(cwd: string, message: string) {
	git(cwd, "add", "-A");
	git(cwd, ...identity, "commit", "-q", "-m", message);
}

const changedLines = (before: string, after: string) =>
	after.split("\n").filter((line, index) => line !== before.split("\n")[index]);

let copy = "";

before(() => {
	copy = mkdtempSync(join(tmpdir(), "release-hooks-"));
	copyTree(REPO, copy);
	symlinkSync(join(REPO, "node_modules"), join(copy, "node_modules"));
	git(copy, "init", "-q");
	// The ignore pattern node_modules/ skips folders only, and the copy holds a symlink.
	writeFileSync(join(copy, ".git", "info", "exclude"), "node_modules\n");
	commitAll(copy, "copy");
	for (const hook of preBumpHooks()) runHook(copy, hook);
});

after(() => rmSync(copy, { recursive: true, force: true }));

test("the hook parse keeps a closing bracket inside a hook string", () => {
	const toml =
		'pre_bump_hooks = [\n\t"echo [a] {{version}}",\n\t"echo b",\n]\n';
	assert.deepEqual(hooksIn(toml), [`echo [a] ${NEW_VERSION}`, "echo b"]);
});

test("the tree copy takes tracked and untracked files and skips ignored ones", () => {
	const from = mkdtempSync(join(tmpdir(), "release-from-"));
	const to = mkdtempSync(join(tmpdir(), "release-to-"));
	try {
		writeFileSync(join(from, ".gitignore"), "*.log\n");
		writeFileSync(join(from, "tracked.txt"), "t");
		writeFileSync(join(from, "removed.txt"), "r");
		git(from, "init", "-q");
		commitAll(from, "seed");
		rmSync(join(from, "removed.txt"));
		writeFileSync(join(from, "fresh.txt"), "f");
		writeFileSync(join(from, "noise.log"), "n");
		// A worktree often links node_modules; the pattern node_modules/ skips folders only.
		mkdirSync(join(from, "elsewhere"));
		symlinkSync(join(from, "elsewhere"), join(from, "node_modules"));
		symlinkSync(join(from, "tracked.txt"), join(from, "link.txt"));
		copyTree(from, to);
		const copied = [
			"tracked.txt",
			"fresh.txt",
			"removed.txt",
			"noise.log",
			"node_modules",
			"link.txt",
		];
		assert.deepEqual(
			copied.filter((file) => existsSync(join(to, file))).sort(),
			["fresh.txt", "tracked.txt"],
		);
	} finally {
		rmSync(from, { recursive: true, force: true });
		rmSync(to, { recursive: true, force: true });
	}
});

test("a cog.toml without pre_bump_hooks fails the parse", () => {
	assert.throws(() => hooksIn('tag_prefix = "v"\n'), {
		message: "pre_bump_hooks not found in cog.toml",
	});
});

test("cog.toml runs the version writer, then the builder", () => {
	assert.deepEqual(preBumpHooks(), [
		`node scripts/set-version.ts ${NEW_VERSION}`,
		"node scripts/build.ts",
	]);
});

test("the source and every manifest carry the new version", () => {
	for (const { path, versionPath } of [SOURCE, ...MANIFESTS]) {
		const json = JSON.parse(readFileSync(join(copy, path), "utf8"));
		const version = versionPath.reduce((node, key) => node[key], json);
		assert.equal(version, NEW_VERSION, path);
	}
});

test("the version check passes after the hooks", () => {
	run(copy, process.execPath, ["scripts/set-version.ts", "--check"]);
});

test("the hooks change the source and the three manifests, each only on its version line", () => {
	const changed = git(copy, "diff", "--name-only").split("\n").filter(Boolean);
	assert.deepEqual(
		changed.sort(),
		[SOURCE.path, ...MANIFESTS.map(({ path }) => path)].sort(),
	);
	for (const path of changed) {
		const lines = changedLines(
			git(copy, "show", `HEAD:${path}`),
			readFileSync(join(copy, path), "utf8"),
		);
		assert.equal(lines.length, 1, path);
		assert.match(lines[0] ?? "", /"version"/, path);
	}
});

test("a second build after the commit leaves a clean tree", () => {
	commitAll(copy, "release");
	runHook(copy, "node scripts/build.ts");
	assert.equal(git(copy, "status", "--porcelain"), "");
});
