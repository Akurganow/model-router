import assert from "node:assert/strict";
import { test } from "node:test";
import type { DecidedWithWork } from "../../decision/decide.ts";
import { outcomeOf } from "../../decision/outcome.ts";
import type { SlotModels } from "../../decision/slots.ts";

const DECIDED: DecidedWithWork = {
	tier: 1,
	work: 2,
	probabilities: "0.90/0.80",
	suffix: " · typesafe x",
};

test("a set slot gives its model and the ladder's effort", () => {
	const models: SlotModels = {
		small: { state: "unset" },
		middle: { state: "set", model: "a/model" },
		large: { state: "unset" },
	};
	assert.deepEqual(outcomeOf(DECIDED, models), {
		slot: "middle",
		model: "a/model",
		effort: "high",
		line: "L1 a/model · high · p=0.90/0.80 · typesafe x",
	});
});

test("an unset slot gives no model and names the slot in the line", () => {
	const models: SlotModels = {
		small: { state: "unset" },
		middle: { state: "unset" },
		large: { state: "unset" },
	};
	assert.deepEqual(outcomeOf(DECIDED, models), {
		slot: "middle",
		model: undefined,
		effort: "high",
		line: "L1 middle model unset · high · p=0.90/0.80 · typesafe x",
	});
});

test("a kept effort gives no effort and shows its label in the line", () => {
	const models: SlotModels = {
		small: { state: "unset" },
		middle: { state: "set", model: "a/model" },
		large: { state: "unset" },
	};
	assert.deepEqual(outcomeOf(DECIDED, models, "caller effort"), {
		slot: "middle",
		model: "a/model",
		effort: undefined,
		line: "L1 a/model · caller effort · p=0.90/0.80 · typesafe x",
	});
});
