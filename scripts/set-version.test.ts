import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkVersions, MANIFESTS } from "./manifests.ts";
import { main, setVersion } from "./set-version.ts";
import { useTempRoot } from "./temp-root.ts";

const claude = "plugins/model-router/.claude-plugin/plugin.json";
const omp = "plugins/model-router-omp/package.json";
const extra = "plugins/model-router-extra/plugin.json";
const catalog = ".omp-plugin/marketplace.json";

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
const extraText = `{
	"name": "model-router-extra",
	"version": "0.11.0",
	"skills": "./skills/"
}
`;

const catalogText = `{
	"name": "model-router",
	"plugins": [
		{
			"name": "model-router",
			"source": "./plugins/model-router-omp",
			"version": "0.11.0",
			"homepage": "https://example.com"
		}
	]
}
`;

const box = useTempRoot("set-version-", (put) => {
	put(claude, claudeText);
	put(omp, ompText);
});
const { put, read } = box;

function seedAll(version: string) {
	for (const { path, versionPath } of MANIFESTS) {
		const json = versionPath.reduceRight<unknown>(
			(inner, key) => (typeof key === "number" ? [inner] : { [key]: inner }),
			version,
		);
		put(path, `${JSON.stringify(json, null, "\t")}\n`);
	}
}

test("one call writes the version into every manifest that exists", () => {
	assert.deepEqual(setVersion(box.root, "1.2.3", [claude, omp, extra]), [
		claude,
		omp,
	]);
	assert.equal(JSON.parse(read(claude)).version, "1.2.3");
	assert.equal(JSON.parse(read(omp)).version, "1.2.3");
});

test("only the version line changes, so tabs, key order and the final newline stay", () => {
	setVersion(box.root, "1.2.3", [claude, omp]);
	assert.equal(read(claude), claudeText.replace("0.11.0", "1.2.3"));
	assert.equal(read(omp), ompText.replace("0.11.0", "1.2.3"));
});

test("a manifest added to the list gets the version when its file exists", () => {
	put(extra, extraText);
	assert.equal(setVersion(box.root, "2.0.0", [claude, omp, extra]).length, 3);
	assert.equal(read(extra), extraText.replace("0.11.0", "2.0.0"));
});

test("a version that is the last key keeps its missing comma", () => {
	const text = '{\n\t"name": "x",\n\t"version": "0.11.0"\n}\n';
	put(extra, text);
	setVersion(box.root, "3.0.0", [extra]);
	assert.equal(read(extra), text.replace("0.11.0", "3.0.0"));
});

test("a manifest without a version line stops the bump and names the file", () => {
	put(omp, '{\n\t"name": "model-router-omp"\n}\n');
	assert.throws(() => setVersion(box.root, "1.2.3", [claude, omp]), {
		message: new RegExp(omp.replaceAll(".", "\\.")),
	});
});

test("a nested catalog version is rewritten and nothing else changes", () => {
	put(catalog, catalogText);
	assert.deepEqual(setVersion(box.root, "1.2.3", [claude, catalog]), [
		claude,
		catalog,
	]);
	assert.equal(read(catalog), catalogText.replace("0.11.0", "1.2.3"));
});

test("the writer writes every manifest in the list, the catalog included, and the check agrees", () => {
	seedAll("0.11.0");
	assert.deepEqual(
		setVersion(box.root, "1.2.3"),
		MANIFESTS.map((manifest) => manifest.path),
	);
	assert.deepEqual(checkVersions(box.root), []);
	assert.equal(JSON.parse(read(catalog)).plugins[0].version, "1.2.3");
});

test("the writer and the check import no esbuild", () => {
	for (const file of ["./set-version.ts", "./manifests.ts"]) {
		const source = readFileSync(new URL(file, import.meta.url), "utf8");
		assert.doesNotMatch(source, /esbuild/);
	}
});

test("the command refuses a version that is not X.Y.Z with exit code 2", () => {
	const script = fileURLToPath(new URL("./set-version.ts", import.meta.url));
	const run = spawnSync(process.execPath, [script, "1.2"], {
		encoding: "utf8",
	});
	assert.equal(run.status, 2);
	assert.match(run.stderr, /usage: node scripts\/set-version\.ts X\.Y\.Z/);
});

const USAGE = /usage: node scripts\/set-version\.ts X\.Y\.Z/;

function quietly(args: string[]) {
	const errors: string[] = [];
	mock.method(console, "error", (text: unknown) => void errors.push(`${text}`));
	try {
		return { status: main(args, box.root), errors };
	} finally {
		mock.restoreAll();
	}
}

test("main with no version prints the usage and exits 2", () => {
	const { status, errors } = quietly([]);
	assert.equal(status, 2);
	assert.match(errors.join("\n"), USAGE);
});

test("main with a malformed version exits 2 and writes nothing", () => {
	put(claude, claudeText);
	assert.equal(quietly(["1.2"]).status, 2);
	assert.equal(read(claude), claudeText);
});

test("main bumps every manifest and exits 0", () => {
	seedAll("0.11.0");
	const { status, errors } = quietly(["1.2.3"]);
	assert.equal(status, 0);
	assert.deepEqual(errors, []);
	assert.equal(JSON.parse(read(claude)).version, "1.2.3");
});

test("main reports a manifest without a version line and exits 1", () => {
	put(claude, '{\n\t"name": "x"\n}\n');
	const { status, errors } = quietly(["1.2.3"]);
	assert.equal(status, 1);
	assert.match(errors.join("\n"), /no version line in/);
});

test("main --check exits 0 when the versions agree and 1 when they differ", () => {
	seedAll("0.11.0");
	assert.equal(quietly(["--check"]).status, 0);
	put(claude, claudeText.replace("0.11.0", "0.12.0"));
	const { status, errors } = quietly(["--check"]);
	assert.equal(status, 1);
	assert.match(errors.join("\n"), /plugin versions are not one/);
});

test("a bad manifest later in the list leaves the earlier ones unwritten", () => {
	put(omp, '{\n\t"name": "model-router-omp"\n}\n');
	assert.throws(() => setVersion(box.root, "1.2.3", [claude, omp]));
	assert.equal(read(claude), claudeText);
});
