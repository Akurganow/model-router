import assert from "node:assert/strict";
import { test } from "node:test";
import { tier } from "./tier.ts";
import { work } from "./work.ts";

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
