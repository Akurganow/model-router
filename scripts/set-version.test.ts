import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import { SOURCE_PATH } from "./build/source.ts";
import { checkVersions, MANIFESTS } from "./manifests.ts";
import { main, setVersion } from "./set-version.ts";
import { useTempRoot } from "./temp-root.ts";

const claude = "plugins/model-router/.claude-plugin/plugin.json";
const COMMAND_TIMEOUT_MS = 30_000;

const box = useTempRoot("set-version-");
const { put, read } = box;

const sourceText = (version: string) =>
	`{\n\t"name": "model-router",\n\t"version": "${version}"\n}\n`;

/**
 * Writes the source and every manifest with the given version, each holding
 * only its version path.
 */
function seedAll(version: string) {
	put(SOURCE_PATH, sourceText(version));
	for (const { path, versionPath } of MANIFESTS) {
		const json = versionPath.reduceRight<unknown>(
			(inner, key) => (typeof key === "number" ? [inner] : { [key]: inner }),
			version,
		);
		put(path, `${JSON.stringify(json, null, "\t")}\n`);
	}
}

const SOURCE_WITH_NESTED = `{
	"name": "model-router",
	"version": "0.11.0",
	"nested": {
		"version": "0.11.0"
	},
	"list": [
		{
			"version": "0.11.0"
		}
	]
}
`;

test("only the top-level version line changes, so tabs, key order, nested versions and the final newline stay", () => {
	put(SOURCE_PATH, SOURCE_WITH_NESTED);
	setVersion(box.root, "1.2.3");
	assert.equal(
		read(SOURCE_PATH),
		SOURCE_WITH_NESTED.replace("0.11.0", "1.2.3"),
	);
});

test("a version that is the last key keeps its missing comma", () => {
	const text = '{\n\t"name": "x",\n\t"version": "0.11.0"\n}\n';
	put(SOURCE_PATH, text);
	setVersion(box.root, "3.0.0");
	assert.equal(read(SOURCE_PATH), text.replace("0.11.0", "3.0.0"));
});

test("a source with only a nested version line stops the bump and names the file", () => {
	const text = '{\n\t"nested": {\n\t\t"version": "0.11.0"\n\t}\n}\n';
	put(SOURCE_PATH, text);
	assert.throws(() => setVersion(box.root, "1.2.3"), {
		message: new RegExp(`${SOURCE_PATH}.*found 0`),
	});
	assert.equal(read(SOURCE_PATH), text);
});

test("a source with two top-level version lines stops the bump and writes nothing", () => {
	const text = '{\n\t"version": "0.11.0",\n\t"version": "0.12.0"\n}\n';
	put(SOURCE_PATH, text);
	assert.throws(() => setVersion(box.root, "1.2.3"), {
		message: new RegExp(`${SOURCE_PATH}.*found 2`),
	});
	assert.equal(read(SOURCE_PATH), text);
});

test("a missing source is an error that names the file", () => {
	assert.throws(() => setVersion(box.root, "1.2.3"), {
		message: `${SOURCE_PATH} is missing`,
	});
});

test("the writer writes the source only, and the check names the manifests the build has not caught up", () => {
	seedAll("0.11.0");
	const before = MANIFESTS.map(({ path }) => read(path));
	setVersion(box.root, "1.2.3");
	assert.equal(read(SOURCE_PATH), sourceText("1.2.3"));
	assert.deepEqual(
		MANIFESTS.map(({ path }) => read(path)),
		before,
	);
	assert.match(checkVersions(box.root).join("\n"), /1\.2\.3.*0\.11\.0/s);
});

test("the command refuses a version that is not X.Y.Z with exit code 2", () => {
	const script = fileURLToPath(new URL("./set-version.ts", import.meta.url));
	const run = spawnSync(process.execPath, [script, "1.2"], {
		encoding: "utf8",
		timeout: COMMAND_TIMEOUT_MS,
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
	put(SOURCE_PATH, sourceText("0.11.0"));
	assert.equal(quietly(["1.2"]).status, 2);
	assert.equal(read(SOURCE_PATH), sourceText("0.11.0"));
});

test("main bumps the source and exits 0", () => {
	seedAll("0.11.0");
	const { status, errors } = quietly(["1.2.3"]);
	assert.equal(status, 0);
	assert.deepEqual(errors, []);
	assert.equal(JSON.parse(read(SOURCE_PATH)).version, "1.2.3");
});

test("main reports a source without a version line and exits 1", () => {
	put(SOURCE_PATH, '{\n\t"name": "x"\n}\n');
	const { status, errors } = quietly(["1.2.3"]);
	assert.equal(status, 1);
	assert.match(errors.join("\n"), /metadata\/source\.json.*found 0/);
});

test("main reports a missing source and exits 1", () => {
	const { status, errors } = quietly(["1.2.3"]);
	assert.equal(status, 1);
	assert.deepEqual(errors, [`${SOURCE_PATH} is missing`]);
});

test("main --check exits 0 when the versions agree and 1 when they differ", () => {
	seedAll("0.11.0");
	assert.equal(quietly(["--check"]).status, 0);
	put(claude, '{"version": "0.12.0"}');
	const { status, errors } = quietly(["--check"]);
	assert.equal(status, 1);
	assert.match(errors.join("\n"), /plugin versions are not one/);
});
