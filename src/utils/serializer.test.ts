import assert from "node:assert/strict";
import { test } from "node:test";
import { serializer } from "./serializer.ts";

const idle = async () => {
	for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

// A job that stays open until the test settles it. Its start is logged under the given name.
function held(log: string[], name: string) {
	const control = {
		resolve: (_: string) => {},
		reject: (_: Error) => {},
	};
	const job = () => {
		log.push(name);
		return new Promise<string>((resolve, reject) => {
			control.resolve = resolve;
			control.reject = reject;
		});
	};
	return { job, control };
}

test("jobs run in order, each after the one before it settles", async () => {
	const log: string[] = [];
	const serial = serializer();
	const a = held(log, "a");
	const b = held(log, "b");
	const first = serial(a.job);
	const second = serial(b.job);
	await idle();
	assert.deepEqual(log, ["a"]);
	a.control.resolve("one");
	assert.equal(await first, "one");
	await idle();
	assert.deepEqual(log, ["a", "b"]);
	b.control.resolve("two");
	assert.equal(await second, "two");
});

test("a failing job rejects its own caller, and the next job still runs", async () => {
	const log: string[] = [];
	const serial = serializer();
	const a = held(log, "a");
	const b = held(log, "b");
	const first = serial(a.job);
	const second = serial(b.job);
	await idle();
	a.control.reject(new Error("boom"));
	await assert.rejects(first, { message: "boom" });
	await idle();
	assert.deepEqual(log, ["a", "b"]);
	b.control.resolve("two");
	assert.equal(await second, "two");
});

test("a job that throws before it returns a promise does not stop the next job", async () => {
	const serial = serializer();
	const first = serial(() => {
		throw new Error("sync");
	});
	const second = serial(async () => "after");
	await assert.rejects(first, { message: "sync" });
	assert.equal(await second, "after");
});

test("two serializers do not wait on each other", async () => {
	const log: string[] = [];
	const one = serializer();
	const other = serializer();
	const a = held(log, "a");
	const stuck = one(a.job);
	assert.equal(await other(async () => "free"), "free");
	assert.deepEqual(log, ["a"]);
	a.control.resolve("done");
	assert.equal(await stuck, "done");
});
