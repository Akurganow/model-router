import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
import { fileURLToPath } from "node:url";
import { MANIFESTS, setVersion } from "./set-version.ts";

const claude = "plugins/model-router/.claude-plugin/plugin.json";
const omp = "plugins/model-router-omp/package.json";
const codex = "plugins/model-router-codex/.codex-plugin/plugin.json";

const claudeText = `{
	"name": "model-router",
	"version": "0.11.0",
	"keywords": [
		"claude-code"
	]
}
`;
const ompText = `{
	"name": "model-router-omp",
	"version": "0.11.0",
	"private": true,
	"omp": {
		"extensions": [
			"./extension/index.ts"
		]
	}
}
`;
const codexText = `{
	"name": "model-router-codex",
	"version": "0.11.0",
	"skills": "./skills/"
}
`;

let root = "";
const put = (path: string, text: string) => {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
};
const read = (path: string) => readFileSync(join(root, path), "utf8");

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "set-version-"));
	put(claude, claudeText);
	put(omp, ompText);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test("one call writes the version into every manifest that exists", () => {
	assert.deepEqual(setVersion(root, "1.2.3", [claude, omp, codex]), [
		claude,
		omp,
	]);
	assert.equal(JSON.parse(read(claude)).version, "1.2.3");
	assert.equal(JSON.parse(read(omp)).version, "1.2.3");
});

test("only the version line changes, so tabs, key order and the final newline stay", () => {
	setVersion(root, "1.2.3", [claude, omp]);
	assert.equal(read(claude), claudeText.replace("0.11.0", "1.2.3"));
	assert.equal(read(omp), ompText.replace("0.11.0", "1.2.3"));
});

test("a manifest added to the list gets the version when its file exists", () => {
	put(codex, codexText);
	assert.equal(setVersion(root, "2.0.0", [claude, omp, codex]).length, 3);
	assert.equal(read(codex), codexText.replace("0.11.0", "2.0.0"));
});

test("a version that is the last key keeps its missing comma", () => {
	const text = '{\n\t"name": "x",\n\t"version": "0.11.0"\n}\n';
	put(codex, text);
	setVersion(root, "3.0.0", [codex]);
	assert.equal(read(codex), text.replace("0.11.0", "3.0.0"));
});

test("a manifest without a version line stops the bump and names the file", () => {
	put(omp, '{\n\t"name": "model-router-omp"\n}\n');
	assert.throws(() => setVersion(root, "1.2.3", [claude, omp]), {
		message: new RegExp(omp.replaceAll(".", "\\.")),
	});
});

test("the default list names the Claude Code and omp manifests", () => {
	assert.ok(MANIFESTS.includes(claude));
	assert.ok(MANIFESTS.includes(omp));
});

test("the command refuses a version that is not X.Y.Z with exit code 2", () => {
	const script = fileURLToPath(new URL("./set-version.ts", import.meta.url));
	const run = spawnSync(process.execPath, [script, "1.2"], {
		encoding: "utf8",
	});
	assert.equal(run.status, 2);
	assert.match(run.stderr, /usage: node scripts\/set-version\.ts X\.Y\.Z/);
});
