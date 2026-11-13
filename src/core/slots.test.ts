import assert from "node:assert/strict";
import { test } from "node:test";
import {
	pickModel,
	SLOTS,
	type SlotModels,
	slotForLevel,
	slotLine,
	slotSetting,
} from "./slots.ts";

test("the slots run small, middle, large in level order", () => {
	assert.deepEqual(SLOTS, ["small", "middle", "large"]);
});

test("slotForLevel gives each level its slot", () => {
	assert.equal(slotForLevel(0), "small");
	assert.equal(slotForLevel(1), "middle");
	assert.equal(slotForLevel(2), "large");
});

test("slotSetting names the setting of each slot", () => {
	assert.equal(slotSetting("small"), "small_model");
	assert.equal(slotSetting("middle"), "middle_model");
	assert.equal(slotSetting("large"), "large_model");
});

const SET: SlotModels = {
	small: { state: "set", model: "a/small" },
	middle: { state: "set", model: "a/middle" },
	large: { state: "set", model: "a/large" },
};
const UNSET: SlotModels = {
	small: { state: "unset" },
	middle: { state: "unset" },
	large: { state: "unset" },
};
const UNRESOLVED: SlotModels = {
	small: { state: "unresolved" },
	middle: { state: "unresolved" },
	large: { state: "unresolved" },
};

test("pickModel gives a set slot its model as the target", () => {
	assert.deepEqual(pickModel(0, SET), {
		slot: "small",
		model: "a/small",
		target: "a/small",
	});
	assert.deepEqual(pickModel(1, SET), {
		slot: "middle",
		model: "a/middle",
		target: "a/middle",
	});
	assert.deepEqual(pickModel(2, SET), {
		slot: "large",
		model: "a/large",
		target: "a/large",
	});
});

test("pickModel gives an unset slot no model and names it in the target", () => {
	assert.deepEqual(pickModel(0, UNSET), {
		slot: "small",
		model: undefined,
		target: "small model unset",
	});
	assert.deepEqual(pickModel(1, UNSET), {
		slot: "middle",
		model: undefined,
		target: "middle model unset",
	});
	assert.deepEqual(pickModel(2, UNSET), {
		slot: "large",
		model: undefined,
		target: "large model unset",
	});
});

test("pickModel gives an unresolved slot no model and names it in the target", () => {
	assert.deepEqual(pickModel(0, UNRESOLVED), {
		slot: "small",
		model: undefined,
		target: "small model unresolved",
	});
	assert.deepEqual(pickModel(1, UNRESOLVED), {
		slot: "middle",
		model: undefined,
		target: "middle model unresolved",
	});
	assert.deepEqual(pickModel(2, UNRESOLVED), {
		slot: "large",
		model: undefined,
		target: "large model unresolved",
	});
});

test("pickModel reads only the slot of the level", () => {
	assert.deepEqual(pickModel(0, { ...UNSET, small: SET.small }), {
		slot: "small",
		model: "a/small",
		target: "a/small",
	});
	assert.deepEqual(pickModel(2, { ...SET, large: UNSET.large }), {
		slot: "large",
		model: undefined,
		target: "large model unset",
	});
	assert.deepEqual(pickModel(1, { ...UNRESOLVED, middle: SET.middle }), {
		slot: "middle",
		model: "a/middle",
		target: "a/middle",
	});
});

test("slotLine words the report line of each state", () => {
	assert.equal(
		slotLine("small_model", "set", "anthropic/claude-haiku-4-5"),
		"small_model: anthropic/claude-haiku-4-5",
	);
	assert.equal(
		slotLine("large_model", "unresolved", "openai/gpt-5"),
		"large_model: openai/gpt-5 (unresolved)",
	);
	assert.equal(slotLine("middle_model", "unset", "x"), "middle_model: unset");
});
