import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { budgetFor } from "./deadline.ts";

// The timeouts that leave 999, 1000 and 1001 ms of deadline.
describe("the omp deadline floor", () => {
	it("closes with the exact text at 2999 ms, 999 ms short of a second", () => {
		assert.deepEqual(budgetFor(2999), {
			closed: "tool call timeout 2999 ms leaves 999 ms to route",
		});
	});

	it("keeps a 1000 ms deadline at 3000 ms", () => {
		assert.deepEqual(budgetFor(3000), { deadline: 1000 });
	});

	it("keeps a 1001 ms deadline at 3001 ms", () => {
		assert.deepEqual(budgetFor(3001), { deadline: 1001 });
	});
});
