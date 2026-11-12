import assert from "node:assert/strict";
import { test } from "node:test";
import { LEVEL_SLOTS, modelForLevel, SLOTS, slotForLevel } from "./slots.ts";

test("level 0 names the small slot, level 2 the large slot, and the middle none", () => {
	assert.deepEqual(LEVEL_SLOTS, { 0: "small", 2: "large" });
	assert.deepEqual(Object.values(LEVEL_SLOTS), [...SLOTS]);
});

test("slotForLevel gives the end levels their slot and the middle level none", () => {
	assert.equal(slotForLevel(0), "small");
	assert.equal(slotForLevel(1), null);
	assert.equal(slotForLevel(2), "large");
});

test("modelForLevel keeps the model at the middle level, whatever is set", () => {
	const set = { small: "a/small", large: "a/large" };
	assert.deepEqual(modelForLevel(1, set), { slot: null });
	assert.deepEqual(modelForLevel(1, { small: undefined, large: undefined }), {
		slot: null,
	});
});

test("modelForLevel gives an end level its slot and that slot's model", () => {
	const set = { small: "a/small", large: "a/large" };
	assert.deepEqual(modelForLevel(0, set), { slot: "small", model: "a/small" });
	assert.deepEqual(modelForLevel(2, set), { slot: "large", model: "a/large" });
	assert.deepEqual(modelForLevel(0, { ...set, large: undefined }), {
		slot: "small",
		model: "a/small",
	});
	assert.deepEqual(modelForLevel(2, { ...set, small: undefined }), {
		slot: "large",
		model: "a/large",
	});
});

test("modelForLevel skips an end level whose own slot has no model", () => {
	const set = { small: "a/small", large: "a/large" };
	assert.deepEqual(modelForLevel(0, { ...set, small: undefined }), {
		skipped: "small model unset",
	});
	assert.deepEqual(modelForLevel(2, { ...set, large: undefined }), {
		skipped: "large model unset",
	});
});
