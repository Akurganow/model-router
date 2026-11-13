import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROUTING_LIMIT_MS } from "./compose.ts";
import {
	deadlineFor,
	MIN_DEADLINE_MS,
	MIN_TIMEOUT_MS,
} from "./handler-deadline.ts";

describe("deadlineFor", () => {
	it("leaves the minimum deadline at the minimum hook timeout", () => {
		assert.equal(deadlineFor(MIN_TIMEOUT_MS), MIN_DEADLINE_MS);
		assert.ok(deadlineFor(MIN_TIMEOUT_MS - 1) < MIN_DEADLINE_MS);
	});

	it("caps the deadline at the routing limit", () => {
		assert.equal(deadlineFor(600000), ROUTING_LIMIT_MS);
	});
});
