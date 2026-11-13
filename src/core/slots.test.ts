import assert from "node:assert/strict";
import { test } from "node:test";
import {
	pickModel,
	SLOT_SETTINGS,
	SLOTS,
	slotForLevel,
	slotLine,
	slotRecord,
	slotSetting,
	slotState,
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

const SET = { state: "set", model: "a/model" } as const;
const UNSET = { state: "unset" } as const;

test("pickModel gives a set slot its model as the target", () => {
	assert.deepEqual(pickModel(0, SET), {
		slot: "small",
		model: "a/model",
		target: "a/model",
	});
	assert.deepEqual(pickModel(1, SET), {
		slot: "middle",
		model: "a/model",
		target: "a/model",
	});
	assert.deepEqual(pickModel(2, SET), {
		slot: "large",
		model: "a/model",
		target: "a/model",
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

test("slotState gives no model unset and any model set", () => {
	assert.deepEqual(slotState(undefined), { state: "unset" });
	assert.deepEqual(slotState("a/m"), { state: "set", model: "a/m" });
});

test("slotRecord builds one entry per slot in level order", () => {
	assert.deepEqual(
		slotRecord((slot) => `${slot}!`),
		{ small: "small!", middle: "middle!", large: "large!" },
	);
	assert.deepEqual(Object.keys(slotRecord(() => 0)), [
		"small",
		"middle",
		"large",
	]);
});

test("SLOT_SETTINGS names the three settings in level order", () => {
	assert.deepEqual(SLOT_SETTINGS, [
		"small_model",
		"middle_model",
		"large_model",
	]);
});

test("slotLine words the report line of a slot with and without a model", () => {
	assert.equal(
		slotLine("small_model", "anthropic/claude-haiku-4-5"),
		"small_model: anthropic/claude-haiku-4-5",
	);
	assert.equal(slotLine("middle_model"), "middle_model: unset");
	assert.equal(slotLine("middle_model", undefined), "middle_model: unset");
});
