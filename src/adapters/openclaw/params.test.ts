import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readParam, readSpawn, readStringParam } from "./params.ts";

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

describe("readSpawn", () => {
	it("reads a spawn with nothing set as empty values", () => {
		assert.deepEqual(readSpawn({}), {
			task: undefined,
			agent: { kind: "none" },
			model: undefined,
			thinking: undefined,
			description: "",
			runtime: undefined,
			visible: false,
			context: undefined,
			mode: undefined,
			thread: false,
		});
	});

	it("reads every field once, as the tool does", () => {
		assert.deepEqual(
			readSpawn({
				task: " do it ",
				agentId: " writer ",
				model: " openai/x ",
				thinking: " low ",
				label: " docs ",
				taskName: "ignored",
				runtime: "subagent",
				visible: true,
				context: "isolated",
				mode: "run",
				thread: true,
			}),
			{
				task: " do it ",
				agent: { kind: "id", id: "writer" },
				model: "openai/x",
				thinking: "low",
				description: "docs",
				runtime: "subagent",
				visible: true,
				context: "isolated",
				mode: "run",
				thread: true,
			},
		);
	});

	it("reads the agent from agentId, else agent_id, and trims it", () => {
		const agent = (params: Record<string, unknown>) => readSpawn(params).agent;
		assert.deepEqual(agent({ agent_id: " w " }), { kind: "id", id: "w" });
		assert.deepEqual(agent({ agentId: "a", agent_id: "b" }), {
			kind: "id",
			id: "a",
		});
		for (const blank of ["", "  ", null, undefined])
			assert.deepEqual(agent({ agentId: blank, agent_id: "b" }), {
				kind: "none",
			});
	});

	it("marks an agent id that is set but not text as invalid", () => {
		for (const bad of [4, true, {}, []]) {
			const invalid = { kind: "invalid" };
			assert.deepEqual(readSpawn({ agentId: bad }).agent, invalid);
			assert.deepEqual(readSpawn({ agent_id: bad }).agent, invalid);
			assert.deepEqual(
				readSpawn({ agentId: bad, agent_id: "w" }).agent,
				invalid,
			);
		}
	});

	it("keeps only text for the model and the thinking, trimmed", () => {
		for (const bad of ["", "  ", 5, {}, null]) {
			assert.equal(readSpawn({ model: bad }).model, undefined);
			assert.equal(readSpawn({ thinking: bad }).thinking, undefined);
		}
	});

	it("describes the spawn by its label, else its task name, else nothing", () => {
		assert.equal(readSpawn({ label: "a", taskName: "b" }).description, "a");
		assert.equal(readSpawn({ label: 3, taskName: " b " }).description, "b");
		assert.equal(readSpawn({ label: " ", taskName: 3 }).description, "");
	});

	it("tells the subagent runtime from any other value that is set", () => {
		const runtime = (value: unknown) => readSpawn({ runtime: value }).runtime;
		for (const unset of [undefined, null, "", "  "])
			assert.equal(runtime(unset), undefined);
		assert.equal(runtime("subagent"), "subagent");
		for (const other of ["acp", "Subagent", 5, true, {}])
			assert.equal(runtime(other), "other");
	});

	it("reads the flags as the tool does: only the exact values count", () => {
		assert.equal(readSpawn({ visible: "true" }).visible, false);
		assert.equal(readSpawn({ thread: 1 }).thread, false);
		assert.equal(readSpawn({ context: "other" }).context, undefined);
		assert.equal(readSpawn({ context: "fork" }).context, "fork");
		assert.equal(readSpawn({ mode: "other" }).mode, undefined);
		assert.equal(readSpawn({ mode: "session" }).mode, "session");
	});

	it("keeps the task as text, untrimmed, and nothing for a non-text task", () => {
		assert.equal(readSpawn({ task: 5 }).task, undefined);
		assert.equal(readSpawn({ task: "" }).task, "");
	});
});
