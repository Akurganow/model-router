import assert from "node:assert/strict";
import { test } from "node:test";
import type { Writer } from "../../core/models.ts";
import { throws, useWorld } from "./fakes.ts";
import { configured, modelPort, slotName } from "./models.ts";

const world = useWorld();
const port = () => modelPort(world.imports, world.pi, world.ctx());
const writer = (): Writer => {
	const found = port().writer;
	assert.ok(found !== null, "a session with a UI has a writer");
	return found;
};
const withRole = (role: string, value: unknown) => {
	world.config.modelRoles = { [role]: value };
};

test("the list maps omp's entries to provider/id with their prices and context", async () => {
	world.list = () => [
		{
			provider: "anthropic",
			id: "claude-haiku-4-5",
			cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
			contextWindow: 200000,
		},
		{
			provider: "stub",
			id: "m",
			cost: { input: 0.5, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: null,
		},
	];
	assert.deepEqual(await port().list(), [
		{
			id: "anthropic/claude-haiku-4-5",
			input: 1,
			output: 5,
			context: 200000,
		},
		{ id: "stub/m", input: 0.5, output: 0 },
	]);
});

test("an all-zero price counts only when omp marks it free", async () => {
	const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
	world.list = () => [
		{ provider: "a", id: "free", cost: zero, pricingStatus: "free" },
		{ provider: "a", id: "plan", cost: zero, pricingStatus: "included" },
		{ provider: "a", id: "varies", cost: zero, pricingStatus: "variable" },
		{ provider: "a", id: "unknown", cost: zero, pricingStatus: "unknown" },
		{ provider: "a", id: "unmarked", cost: zero, contextWindow: 128000 },
		{ provider: "a", id: "cache-only", cost: { ...zero, cacheRead: 0.1 } },
	];
	assert.deepEqual(await port().list(), [
		{ id: "a/free", input: 0, output: 0 },
		{ id: "a/plan" },
		{ id: "a/varies" },
		{ id: "a/unknown" },
		{ id: "a/unmarked", context: 128000 },
		{ id: "a/cache-only", input: 0, output: 0 },
	]);
});

test("an entry with no cost or no context keeps its id", async () => {
	world.list = () => [
		{ provider: "a", id: "bare" },
		{ provider: "a", id: "text", cost: "cheap", contextWindow: "200k" },
	];
	assert.deepEqual(await port().list(), [{ id: "a/bare" }, { id: "a/text" }]);
});

test("an entry with no provider or id, or that is no record, is dropped", async () => {
	world.list = () => [
		null,
		"a/b",
		{ id: "lonely" },
		{ provider: "a" },
		{ provider: 1, id: "b" },
		{ provider: "a", id: "kept" },
	];
	assert.deepEqual(await port().list(), [{ id: "a/kept" }]);
});

test("a list that throws rejects the port's list", async () => {
	world.list = throws;
	await assert.rejects(port().list(), /boom/);
});

test("each slot is named by its setting and its omp role", () => {
	assert.equal(slotName("small"), "small_model (smol role)");
	assert.equal(slotName("middle"), "middle_model (middle role)");
	assert.equal(slotName("large"), "large_model (slow role)");
	assert.equal(writer().name("middle"), "middle_model (middle role)");
});

test("a role's configured patterns are its current value", async () => {
	withRole("middle", "stub/m");
	assert.equal(await writer().current("middle"), "stub/m");
	withRole("middle", "stub/m, stub/n");
	assert.equal(await writer().current("middle"), "stub/m, stub/n");
	withRole("middle", ["stub/m", "stub/n,stub/o"]);
	assert.equal(await writer().current("middle"), "stub/m, stub/n, stub/o");
	withRole("slow", "@smol");
	assert.equal(await writer().current("large"), "@smol");
});

test("a role with no pattern is unset", async () => {
	for (const value of [undefined, null, "", "   ", [], [" ", ""], 7]) {
		withRole("middle", value);
		assert.equal(
			await writer().current("middle"),
			undefined,
			JSON.stringify(value),
		);
	}
	world.config.modelRoles = {};
	assert.equal(configured(world.imports, world.pi, "middle"), undefined);
});

test("an unreadable modelRoles reads as unset", () => {
	world.config.modelRoles = undefined;
	assert.equal(configured(world.imports, world.pi, "small"), undefined);
	world.config.modelRoles = "not a record";
	assert.equal(configured(world.imports, world.pi, "small"), undefined);
	const imports = { ...world.imports, lookup: () => ({ get: throws }) };
	assert.equal(configured(imports, world.pi, "small"), undefined);
});

test("the report reads the slot's role, not another role", () => {
	world.config.modelRoles = { smol: "a/s", middle: "a/m", slow: "a/l" };
	assert.equal(configured(world.imports, world.pi, "small"), "a/s");
	assert.equal(configured(world.imports, world.pi, "middle"), "a/m");
	assert.equal(configured(world.imports, world.pi, "large"), "a/l");
});

test("the dialog question names omp's other uses of smol and slow", async () => {
	world.select = async () => "picked";
	const question = "Which model should the small level run?";
	assert.equal(await writer().select("small", question, ["x"]), "picked");
	await writer().select("middle", "Which model should the middle level run?", [
		"y",
	]);
	await writer().select("large", "Which model should the large level run?", [
		"z",
	]);
	assert.deepEqual(world.dialogs, [
		{
			title:
				"Which model should the small level run? omp also uses smol for the scout and sonic agents, commit messages, session titles and the prewalk hand-off.",
			options: ["x"],
		},
		{ title: "Which model should the middle level run?", options: ["y"] },
		{
			title:
				"Which model should the large level run? omp also uses slow for the reviewer agent and the advisor.",
			options: ["z"],
		},
	]);
});

test("a write sets one role in modelRoles and returns the value now configured", async () => {
	assert.equal(await writer().write("middle", "stub/m"), "stub/m");
	assert.deepEqual(world.entryWrites, [
		{ id: "modelRoles", key: "middle", value: "stub/m" },
	]);
	assert.deepEqual(world.config.modelRoles, {
		smol: "prov/small",
		slow: "prov/large",
		middle: "stub/m",
	});
	assert.equal(await writer().write("small", "stub/s"), "stub/s");
	assert.equal(await writer().write("large", "stub/l"), "stub/l");
	assert.deepEqual(
		world.entryWrites.map(({ key }) => key),
		["middle", "smol", "slow"],
	);
});

test("a write that throws rejects and changes nothing", async () => {
	world.writeEntry = throws;
	await assert.rejects(writer().write("middle", "stub/m"), /boom/);
	assert.deepEqual(world.config.modelRoles, {
		smol: "prov/small",
		slow: "prov/large",
	});
});

test("a write with no modelRoles to write rejects as unreadable", async () => {
	world.config.modelRoles = undefined;
	await assert.rejects(writer().write("middle", "stub/m"), {
		message: "settings unreadable",
	});
	const imports = {
		...world.imports,
		lookup: () => ({ get: () => ({}) }),
	};
	const bare = modelPort(imports, world.pi, world.ctx()).writer;
	assert.ok(bare !== null);
	await assert.rejects(bare.write("middle", "stub/m"), {
		message: "settings unreadable",
	});
});

test("the writer refuses no caller", () => {
	assert.equal(writer().authorize(), undefined);
});

test("without a UI there is no writer", () => {
	world.hasUI = false;
	assert.equal(port().writer, null);
});

test("the user path names the role in /models and in config.yml", () => {
	const { help } = port();
	assert.equal(
		help("small"),
		"small_model is omp's smol role (Fast). Set it in /models under Roles, or under modelRoles.smol in config.yml.",
	);
	assert.equal(
		help("middle"),
		"middle_model is the middle role. Add it in /models under Roles with + New role… and the name middle, or under modelRoles.middle in config.yml.",
	);
	assert.equal(
		help("large"),
		"large_model is omp's slow role (Thinking). Set it in /models under Roles, or under modelRoles.slow in config.yml.",
	);
});
