import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
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
import { SOURCE_PATH } from "./build/source.ts";
import { MANIFESTS } from "./manifests.ts";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const NEW_VERSION = "9.9.9";
const HOOK_TIMEOUT_MS = 120_000;
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

function preBumpHooks(): string[] {
	const toml = readFileSync(join(REPO, "cog.toml"), "utf8");
	const list = /^pre_bump_hooks = \[([^\]]*)\]/m.exec(toml)?.[1] ?? "";
	return [...list.matchAll(/"([^"]+)"/g)].map(([, hook]) =>
		(hook ?? "").replaceAll("{{version}}", NEW_VERSION),
	);
}

function runHook(cwd: string, hook: string) {
	const [program, ...args] = hook.split(" ");
	assert.equal(program, "node", `pre-bump hook ${hook} does not run node`);
	return run(cwd, process.execPath, args);
}

function copyTracked(to: string) {
	for (const file of git(REPO, "ls-files").split("\n").filter(Boolean)) {
		if (!existsSync(join(REPO, file))) continue;
		mkdirSync(dirname(join(to, file)), { recursive: true });
		copyFileSync(join(REPO, file), join(to, file));
	}
	symlinkSync(join(REPO, "node_modules"), join(to, "node_modules"));
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
	copyTracked(copy);
	git(copy, "init", "-q");
	// The ignore pattern node_modules/ skips folders only, and the copy holds a symlink.
	writeFileSync(join(copy, ".git", "info", "exclude"), "node_modules\n");
	commitAll(copy, "copy");
	for (const hook of preBumpHooks()) runHook(copy, hook);
});

after(() => rmSync(copy, { recursive: true, force: true }));

test("cog.toml runs the version writer, then the builder", () => {
	assert.deepEqual(preBumpHooks(), [
		`node scripts/set-version.ts ${NEW_VERSION}`,
		"node scripts/build.ts",
	]);
});

test("the source and every manifest carry the new version", () => {
	for (const { path, versionPath } of [
		{ path: SOURCE_PATH, versionPath: ["version"] },
		...MANIFESTS,
	]) {
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
		[SOURCE_PATH, ...MANIFESTS.map(({ path }) => path)].sort(),
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
