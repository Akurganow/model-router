import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore, STORE_MAX } from "./omp-store.ts";

const AGENT = "task";
const decision = (line: string) => ({ role: "@smol", line });

test("an unnamed item is found by its call and index, once", () => {
	const store = createStore();
	store.add("call", 0, undefined, AGENT, decision("a"));
	assert.deepEqual(store.take("call:0", AGENT), decision("a"));
	assert.equal(store.take("call:0", AGENT), undefined);
});

test("a named item is found by its raw name, and the take removes the index key too", () => {
	const store = createStore();
	store.add("call", 2, " Pad ", AGENT, decision("a"));
	assert.equal(store.take("Pad", AGENT), undefined);
	assert.deepEqual(store.take(" Pad ", AGENT), decision("a"));
	assert.equal(store.take("call:2", AGENT), undefined);
});

test("a blank or non-string name adds no name key", () => {
	const store = createStore();
	store.add("call", 0, "  ", AGENT, decision("a"));
	store.add("call", 1, 7, AGENT, decision("b"));
	assert.equal(store.take("  ", AGENT), undefined);
	assert.deepEqual(store.take("call:1", AGENT), decision("b"));
});

test("two items with one name are ambiguous until one is taken by its index", () => {
	const store = createStore();
	store.add("call", 0, "Same", AGENT, decision("a"));
	store.add("call", 1, "Same", AGENT, decision("b"));
	assert.equal(store.take("Same", AGENT), undefined);
	assert.deepEqual(store.take("call:1", AGENT), decision("b"));
	assert.deepEqual(store.take("Same", AGENT), decision("a"));
});

test("a name used by two calls is ambiguous", () => {
	const store = createStore();
	store.add("one", 0, "Same", AGENT, decision("a"));
	store.add("two", 0, "Same", AGENT, decision("b"));
	assert.equal(store.take("Same", AGENT), undefined);
});

test("progress swaps the index and name keys for the id", () => {
	const store = createStore();
	store.add("call", 0, "Foo", AGENT, decision("a"));
	store.add("call", 1, undefined, AGENT, decision("b"));
	store.learn("call", [{ index: 0, id: "0-Foo" }]);
	assert.equal(store.take("Foo", AGENT), undefined);
	assert.equal(store.take("call:0", AGENT), undefined);
	assert.deepEqual(store.take("0-Foo", AGENT), decision("a"));
	assert.deepEqual(store.take("call:1", AGENT), decision("b"));
});

test("the id outlives the end of its call, the other keys do not", () => {
	const store = createStore();
	store.add("call", 0, "Foo", AGENT, decision("a"));
	store.add("call", 1, "Bar", AGENT, decision("b"));
	store.learn("call", [{ index: 0, id: "0-Foo" }]);
	store.end("call");
	assert.deepEqual(store.take("0-Foo", AGENT), decision("a"));
	assert.equal(store.take("Bar", AGENT), undefined);
	assert.equal(store.take("call:1", AGENT), undefined);
});

test("an end drops a call's unlearned keys and leaves other calls alone", () => {
	const store = createStore();
	store.add("one", 0, "Foo", AGENT, decision("a"));
	store.add("two", 0, "Bar", AGENT, decision("b"));
	store.end("one");
	assert.equal(store.take("Foo", AGENT), undefined);
	assert.deepEqual(store.take("Bar", AGENT), decision("b"));
});

test("progress that is malformed, unknown or for another call changes nothing", () => {
	const store = createStore();
	store.add("call", 0, "Foo", AGENT, decision("a"));
	for (const progress of [
		undefined,
		"x",
		[null],
		[{ index: 0 }],
		[{ index: "0", id: "i" }],
		[{ index: 0, id: "" }],
		[{ index: 5, id: "i" }],
	])
		store.learn("call", progress);
	store.learn("other", [{ index: 0, id: "i" }]);
	assert.equal(store.take("i", AGENT), undefined);
	assert.deepEqual(store.take("Foo", AGENT), decision("a"));
});

test("two items given one id are ambiguous", () => {
	const store = createStore();
	store.add("call", 0, undefined, AGENT, decision("a"));
	store.add("call", 1, undefined, AGENT, decision("b"));
	store.learn("call", [
		{ index: 0, id: "same" },
		{ index: 1, id: "same" },
	]);
	assert.equal(store.take("same", AGENT), undefined);
});

test("the store holds 64 entries and drops the oldest", () => {
	assert.equal(STORE_MAX, 64);
	const store = createStore();
	for (let i = 0; i <= STORE_MAX; i++)
		store.add(`call${i}`, 0, undefined, AGENT, decision(String(i)));
	assert.equal(store.take("call0:0", AGENT), undefined);
	assert.deepEqual(store.take("call1:0", AGENT), decision("1"));
	assert.deepEqual(
		store.take(`call${STORE_MAX}:0`, AGENT),
		decision(String(STORE_MAX)),
	);
});

test("a taken entry leaves room, so the cap counts live entries", () => {
	const store = createStore();
	for (let i = 0; i < STORE_MAX; i++)
		store.add(`call${i}`, 0, undefined, AGENT, decision(String(i)));
	store.take("call5:0", AGENT);
	store.add("extra", 0, undefined, AGENT, decision("x"));
	assert.deepEqual(store.take("call0:0", AGENT), decision("0"));
});

test("a decision binds to its agent: another agent takes nothing and leaves it stored", () => {
	const store = createStore();
	store.add("call", 0, "Foo", "scout", decision("a"));
	assert.equal(store.take("call:0", "task"), undefined);
	assert.equal(store.take("Foo", "task"), undefined);
	assert.deepEqual(store.take("call:0", "scout"), decision("a"));
	assert.equal(store.take("Foo", "scout"), undefined);
});

test("an ambiguous key takes nothing for any agent", () => {
	const store = createStore();
	store.add("call", 0, "Same", "scout", decision("a"));
	store.add("call", 1, "Same", "task", decision("b"));
	assert.equal(store.take("Same", "scout"), undefined);
	assert.equal(store.take("Same", "task"), undefined);
});
