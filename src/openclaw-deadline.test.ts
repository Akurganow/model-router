import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROUTING_LIMIT_MS } from "./compose.ts";
import {
	deadlineFor,
	HOOK_TIMEOUT_MS,
	MIN_DEADLINE_MS,
	MIN_TIMEOUT_MS,
} from "./openclaw-deadline.ts";

describe("deadlineFor", () => {
	it("leaves the minimum deadline at the minimum hook timeout", () => {
		assert.equal(deadlineFor(MIN_TIMEOUT_MS), MIN_DEADLINE_MS);
		assert.ok(deadlineFor(MIN_TIMEOUT_MS - 1) < MIN_DEADLINE_MS);
	});

	it("gives the registered hook timeout the full routing limit", () => {
		assert.equal(deadlineFor(HOOK_TIMEOUT_MS), ROUTING_LIMIT_MS);
		assert.ok(deadlineFor(HOOK_TIMEOUT_MS - 1) < ROUTING_LIMIT_MS);
	});

	it("caps the deadline at the routing limit", () => {
		assert.equal(deadlineFor(600000), ROUTING_LIMIT_MS);
	});
});
