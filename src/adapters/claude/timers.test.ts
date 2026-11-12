import assert from "node:assert/strict";
import { test } from "node:test";
import { clearTimeout, installTimers, setTimeout } from "./timers.ts";

// Node runs each test file in its own process, so the first test sees the module uninstalled.
test("a delegate called before install throws a clear error", () => {
	assert.throws(() => setTimeout(() => {}, 5), /setTimeout.*installTimers/);
	assert.throws(() => clearTimeout(undefined), /clearTimeout.*installTimers/);
});

test("setTimeout hands the delay and callback to the installed after", () => {
	const calls: [number, () => void][] = [];
	const timer = { cancel() {} };
	installTimers((ms, fn) => {
		calls.push([ms, fn]);
		return timer;
	});
	const fn = () => {};
	assert.equal(setTimeout(fn, 25), timer);
	assert.deepEqual(calls, [[25, fn]]);
});

test("clearTimeout cancels the timer and ignores undefined", () => {
	let cancelled = 0;
	installTimers(() => ({ cancel: () => cancelled++ }));
	clearTimeout(setTimeout(() => {}, 1));
	clearTimeout(undefined);
	assert.equal(cancelled, 1);
});

test("a later install replaces the earlier one", () => {
	const seen: string[] = [];
	const label = (name: string) => () => {
		seen.push(name);
		return { cancel() {} };
	};
	installTimers(label("a"));
	installTimers(label("b"));
	setTimeout(() => {}, 1);
	assert.deepEqual(seen, ["b"]);
});
