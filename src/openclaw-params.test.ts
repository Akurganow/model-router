import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readParam, readStringParam } from "./openclaw-params.ts";

describe("readParam", () => {
	it("reads the own key, else the snake-case key", () => {
		assert.equal(readParam({ agentId: "a" }, "agentId"), "a");
		assert.equal(readParam({ agent_id: "b" }, "agentId"), "b");
		assert.equal(readParam({ agentId: "a", agent_id: "b" }, "agentId"), "a");
	});

	it("lets an own key win even when it is empty or not text", () => {
		assert.equal(readParam({ agentId: "", agent_id: "b" }, "agentId"), "");
		assert.equal(readParam({ agentId: 4, agent_id: "b" }, "agentId"), 4);
	});

	it("does not read an inherited name", () => {
		assert.equal(readParam({}, "constructor"), undefined);
	});

	it("keeps a key that has no snake-case form", () => {
		assert.equal(readParam({ model: "m" }, "model"), "m");
		assert.equal(readParam({}, "model"), undefined);
	});
});

describe("readStringParam", () => {
	it("returns trimmed text", () => {
		assert.equal(readStringParam({ model: " a/b " }, "model"), "a/b");
		assert.equal(readStringParam({ agent_id: " w " }, "agentId"), "w");
	});

	it("counts blank text and non-text as absent", () => {
		for (const value of ["", "  ", "\t\n", 4, null, {}, []])
			assert.equal(readStringParam({ label: value }, "label"), undefined);
	});
});
