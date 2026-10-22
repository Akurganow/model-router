import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildBundle, checkClaudeBundle, MAX_BUNDLE_BYTES } from "./build.ts";
import { useTempRoot } from "./temp-root.ts";

const GOOD = `export function register(on) {
	return setTimeout(() => {}, 1);
}
`;

const box = useTempRoot("build-");
const outPath = () => join(box.root, "out", "register.js");
const buildClaude = (source: string) => {
	box.put("entry.ts", source);
	return buildBundle("claude", join(box.root, "entry.ts"), outPath());
};

test("a good Claude Code entry builds with the timers rebound", async () => {
	assert.deepEqual(await buildClaude(GOOD), []);
	const code = readFileSync(outPath(), "utf8");
	assert.match(code, /^function register\(/m);
	assert.match(code, /^function setTimeout\(/m);
	assert.match(code.trimEnd(), /export \{\s*register\s*\};?$/);
});

test("an arrow register fails the form check", async () => {
	const problems = await buildClaude("export const register = () => {};\n");
	assert.match(problems.join("\n"), /function register\(/);
});

test("a free setTimeout fails the timer check", () => {
	const code =
		"function register() {}\nsetTimeout(() => {}, 1);\nexport { register };\n";
	assert.match(checkClaudeBundle(code).join("\n"), /setTimeout/);
});

test("a call to a property named setTimeout is not a free reference", () => {
	const code =
		"function register() {}\nglobalThis.setTimeout;\nexport { register };\n";
	assert.deepEqual(checkClaudeBundle(code), []);
});

test("an oversized bundle fails the size check", async () => {
	const big = `export function register() {\n\treturn "${"a".repeat(MAX_BUNDLE_BYTES)}";\n}\n`;
	assert.deepEqual(
		(await buildClaude(big)).map((p) => p.replace(/\d+ bytes/, "N bytes")),
		[`${outPath()} is N bytes, over the ${MAX_BUNDLE_BYTES} limit`],
	);
});

test("two builds give identical bytes", async () => {
	await buildClaude(GOOD);
	const first = readFileSync(outPath());
	await buildClaude(GOOD);
	assert.deepEqual(readFileSync(outPath()), first);
});

test("the output names the shim by repo-relative path only", async () => {
	await buildClaude(GOOD);
	const code = readFileSync(outPath(), "utf8");
	assert.match(code, /^\/\/ src\/timers\.ts$/m);
	assert.equal(
		code.includes(fileURLToPath(new URL("../", import.meta.url))),
		false,
	);
});

test("an omp entry builds and keeps its host imports external", async () => {
	box.put(
		"omp.ts",
		'import "@oh-my-pi/pi-coding-agent";\nexport default () => 1;\n',
	);
	const out = join(box.root, "out", "index.js");
	assert.deepEqual(await buildBundle("omp", join(box.root, "omp.ts"), out), []);
	assert.match(readFileSync(out, "utf8"), /@oh-my-pi\/pi-coding-agent/);
});
