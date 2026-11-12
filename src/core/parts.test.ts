import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { work } from "./effort.ts";
import { tier } from "./model.ts";

const SOURCE = {
	model: readFileSync(join(import.meta.dirname, "model.ts"), "utf8"),
	effort: readFileSync(join(import.meta.dirname, "effort.ts"), "utf8"),
};

type Import = { from: string; typeOnly: boolean; names: string[] };

// Matches both `import x from "y"` and the side-effect form `import "y"`.
const IMPORT =
	/^import\s+(?:(type\s+)?([^;"']*?)\s*from\s+)?["']([^"']+)["']/gm;
const CLIENT_FILE = /claude|omp|client|compose/i;

function importsOf(source: string): Import[] {
	return [...source.matchAll(IMPORT)].map(
		([, typeKeyword, clause = "", from = ""]) => ({
			from,
			typeOnly: typeKeyword !== undefined,
			names: clause
				.replace(/[{}]/g, "")
				.split(",")
				.map((name) => name.trim())
				.filter(Boolean),
		}),
	);
}

test("neither part imports a client file", () => {
	assert.ok(importsOf(SOURCE.effort).length > 0);
	for (const source of [SOURCE.model, SOURCE.effort])
		for (const { from } of importsOf(source))
			assert.doesNotMatch(from, CLIENT_FILE);
});

test("neither part imports the other", () => {
	for (const { from } of importsOf(SOURCE.model))
		assert.doesNotMatch(from, /effort/);
	for (const { from } of importsOf(SOURCE.effort))
		assert.doesNotMatch(from, /model/);
});

test("both parts share one shape: a key, a score question and a pick function", () => {
	for (const part of [tier, work]) {
		assert.deepEqual(Object.keys(part).sort(), ["key", "pick", "question"]);
		assert.deepEqual(Object.keys(part.question).sort(), [
			"criteria",
			"instructions",
			"type",
		]);
		assert.equal(part.question.type, "score");
		assert.ok([0, 1, 2].includes(part.pick({ "0": 1, "1": 0, "2": 0 })));
	}
});
