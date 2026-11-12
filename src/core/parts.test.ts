import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tier } from "./tier.ts";
import { work } from "./work.ts";

const SOURCE = {
	tier: readFileSync(join(import.meta.dirname, "tier.ts"), "utf8"),
	work: readFileSync(join(import.meta.dirname, "work.ts"), "utf8"),
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
	assert.ok(importsOf(SOURCE.work).length > 0);
	for (const source of [SOURCE.tier, SOURCE.work])
		for (const { from } of importsOf(source))
			assert.doesNotMatch(from, CLIENT_FILE);
});

test("neither part imports the other", () => {
	for (const { from } of importsOf(SOURCE.tier))
		assert.doesNotMatch(from, /work/);
	for (const { from } of importsOf(SOURCE.work))
		assert.doesNotMatch(from, /tier/);
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
