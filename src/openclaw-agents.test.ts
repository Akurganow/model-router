import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findAgent, normalizeAgentId, sameAgent } from "./openclaw-agents.ts";
import type { OpenClawConfig } from "./openclaw-types.ts";

describe("normalizeAgentId", () => {
	const cases: [unknown, string][] = [
		["main", "main"],
		["Writer", "writer"],
		["  Ops_1-b  ", "ops_1-b"],
		["a b", "a-b"],
		["--x--", "x"],
		["Ünï", "n"],
		["", "main"],
		["   ", "main"],
		["!!!", "main"],
		[undefined, "main"],
		[7, "main"],
		["ops-", "ops-"],
		["a".repeat(70), "a".repeat(64)],
		[`-${"b".repeat(70)}`, "b".repeat(64)],
	];
	for (const [value, expected] of cases)
		it(`maps ${JSON.stringify(value)} to ${expected}`, () => {
			assert.equal(normalizeAgentId(value), expected);
		});

	it("compares two ids after the same normalisation", () => {
		assert.equal(sameAgent("Main", " main "), true);
		assert.equal(sameAgent("main", "writer"), false);
	});
});

describe("findAgent", () => {
	const writer = { id: "Writer", description: "d" };
	const find = (agents: unknown, id: string | undefined = "writer") =>
		findAgent({ agents } as OpenClawConfig, id);

	it("finds an entry by its normalised key", () => {
		assert.deepEqual(find({ entries: { Writer: writer } }), writer);
		assert.deepEqual(find({ entries: { writer } }, " WRITER "), writer);
	});

	it("finds a list item by its normalised id", () => {
		assert.deepEqual(find({ list: [{ id: "x" }, writer] }), writer);
	});

	it("returns the first match", () => {
		const first = { description: "first" };
		const found = find({
			entries: { Writer: first, writer: { description: "second" } },
		});
		assert.deepEqual(found, first);
		const item = { id: "w", description: "first" };
		const later = { id: "W", description: "second" };
		assert.deepEqual(find({ list: [item, later] }, "w"), item);
	});

	it("reads the list only when entries is absent", () => {
		assert.equal(find({ entries: {}, list: [writer] }), undefined);
		assert.equal(find({ entries: "x", list: [writer] }), undefined);
		assert.deepEqual(find({ entries: undefined, list: [writer] }), writer);
	});

	it("skips entries and items that are not records", () => {
		assert.equal(find({ entries: { writer: "x" } }), undefined);
		assert.equal(find({ list: ["writer", null, 3] }), undefined);
	});

	it("matches a list item without an id as the default agent", () => {
		assert.deepEqual(find({ list: [{ model: "m" }] }, "main"), { model: "m" });
	});

	it("does not find an inherited name or a missing roster", () => {
		assert.equal(find({ entries: {} }, "constructor"), undefined);
		assert.equal(find(undefined), undefined);
		assert.equal(find({}), undefined);
		assert.equal(find({ list: "x" }), undefined);
		assert.equal(findAgent(undefined, "writer"), undefined);
		assert.equal(findAgent({}, undefined), undefined);
	});
});
