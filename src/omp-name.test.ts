import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import { lockfileWith, useWorld } from "./omp-fakes.ts";
import { checkGates, readSettings } from "./omp-gates.ts";
import { readInstalledName } from "./omp-name.ts";
import { createExtension } from "./omp-router.ts";
import { ask, TOOL_NAME, UNREADABLE, unchanged } from "./settings.ts";

const CATALOGUE = "model-router-omp";
const SCOPED = "@akurganow/model-router";
const NAMES = [CATALOGUE, SCOPED];

const world = useWorld();
const install = () => createExtension(world.imports)(world.pi);

let root = "";
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "omp-name-"));
	mkdirSync(join(root, "extension"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const bundleUrl = (query = "") =>
	`${pathToFileURL(join(root, "extension", "index.js")).href}${query}`;
const writePackage = (text: string) =>
	writeFileSync(join(root, "package.json"), text);

for (const name of NAMES)
	test(`the reader gives ${name} from the package.json beside the bundle`, () => {
		writePackage(JSON.stringify({ name, version: "1.0.0" }));
		assert.equal(readInstalledName(bundleUrl()), name);
	});

test("the reader drops the mtime query omp adds to the module URL", () => {
	writePackage(JSON.stringify({ name: SCOPED }));
	assert.equal(readInstalledName(bundleUrl("?mtime=1762300000000")), SCOPED);
	assert.equal(readInstalledName(new URL(bundleUrl("?mtime=1"))), SCOPED);
});

const unreadablePackages: [string, string | undefined][] = [
	["a missing file", undefined],
	["bad JSON", "{ not json"],
	["a JSON value that is not an object", "[]"],
	["no name", JSON.stringify({ version: "1.0.0" })],
	["an empty name", JSON.stringify({ name: "" })],
	["a name that is not a string", JSON.stringify({ name: 7 })],
];
for (const [label, text] of unreadablePackages)
	test(`the reader gives nothing for ${label}`, () => {
		if (text !== undefined) writePackage(text);
		assert.equal(readInstalledName(bundleUrl()), undefined);
	});

for (const name of NAMES) {
	test(`settings are read under ${name}`, async () => {
		world.plugin = name;
		world.lockfile = {
			plugins: {},
			settings: { [name]: { provider: "auto", scope: "extended" } },
		};
		assert.deepEqual(await readSettings(world.imports, "/work"), {
			provider: "auto",
			scope: "extended",
		});
	});

	test(`a value stored under the other name is ignored under ${name}`, async () => {
		world.plugin = name;
		const other = NAMES.find((candidate) => candidate !== name) as string;
		world.lockfile = lockfileWith("auto", other);
		assert.deepEqual(await readSettings(world.imports, "/work"), {
			provider: "typesafe",
			scope: "core",
		});
	});

	test(`a project narrowing of auto holds under ${name}`, async () => {
		world.plugin = name;
		world.lockfile = lockfileWith("auto", name);
		world.project = { provider: "openrouter" };
		const result = await checkGates(world.imports, world.pi, world.ctx());
		assert.ok("attempts" in result);
		assert.deepEqual(
			result.attempts.map((attempt) => attempt.provider),
			["openrouter"],
		);
	});

	test(`a provider write lands under ${name}`, async () => {
		install();
		world.plugin = name;
		world.lockfile = lockfileWith("typesafe", name);
		const { options } = ask("provider", "typesafe");
		world.select = async () => options[1];
		await world.callTool({ setting: "provider" });
		await world.runCommand("model-router:scope", "extended");
		assert.deepEqual(
			world.writes.map(({ plugin, key }) => [plugin, key]),
			[
				[name, "provider"],
				[name, "scope"],
			],
		);
	});
}

test("a name that cannot be read falls back to the catalogue name for reads", async () => {
	world.plugin = undefined;
	world.lockfile = lockfileWith("openrouter", CATALOGUE);
	assert.deepEqual(await readSettings(world.imports, "/work"), {
		provider: "openrouter",
		scope: "core",
	});
});

test("a value stored under the scoped name is ignored when the name cannot be read", async () => {
	world.plugin = undefined;
	world.lockfile = lockfileWith("openrouter", SCOPED);
	assert.deepEqual(await readSettings(world.imports, "/work"), {
		provider: "typesafe",
		scope: "core",
	});
});

test("routing reads the catalogue settings when the name cannot be read", async () => {
	install();
	world.plugin = undefined;
	world.lockfile = lockfileWith("typesafe", CATALOGUE);
	await world.toolCall("c", { tasks: [{ task: "level0 a" }] });
	assert.equal(world.sent.length, 1);
});

test("the tool shows the catalogue settings when the name cannot be read", async () => {
	install();
	world.plugin = undefined;
	world.lockfile = lockfileWith("openrouter", CATALOGUE);
	const shown = await world.callTool({});
	assert.match(String(shown), /provider/);
	assert.notEqual(shown, UNREADABLE);
	assert.match(String(shown), /openrouter/);
});

test("commands and the tool refuse and write nothing when the name cannot be read", async () => {
	install();
	world.plugin = undefined;
	world.select = async () => ask("scope", "core").options[1];
	assert.equal(
		await world.callTool({ setting: "scope" }),
		unchanged("scope", UNREADABLE),
	);
	await world.runCommand("model-router:scope", "extended");
	assert.deepEqual(world.notes.slice(-1), [unchanged("scope", UNREADABLE)]);
	assert.equal(world.writes.length, 0);
	assert.ok(world.tools[TOOL_NAME]);
});
