import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import {
	BUDGET_CHARS,
	DEADLINE_MS,
	OMISSION_MARKER,
	prepareBrief,
} from "../extension/core.ts";
import extension from "../extension/index.ts";
import type { Call } from "./helpers.ts";
import { jevAnswer, reply, taskEvent, tasksOf, useWorld } from "./helpers.ts";

const world = useWorld();

const CONTEXT_CAP = 3000;
const MAX_PARALLEL = 4;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sent = (call: Call | undefined) => call?.body.state.task ?? "";

describe("the scored brief", () => {
	test("holds the task first and the capped context after it", async () => {
		const context = "C".repeat(10000);
		await world.run({ context, tasks: [{ task: "Do the thing" }] });
		const brief = sent(world.calls[0]);
		assert.ok(brief.startsWith("Do the thing"));
		const tail = brief.slice("Do the thing".length);
		assert.ok(tail.includes("C"));
		assert.ok(tail.includes(OMISSION_MARKER));
		assert.ok(tail.length - tail.indexOf("C") <= CONTEXT_CAP);
		assert.ok(brief.length <= BUDGET_CHARS);
	});

	test("keeps a short context whole", async () => {
		await world.run({ context: "Shared notes", tasks: [{ task: "Do it" }] });
		assert.ok(sent(world.calls[0]).endsWith("Shared notes"));
	});

	test("redacts secrets in the context", async () => {
		await world.run({
			context: "set API_KEY=abc123def456 first",
			tasks: [{ task: "Do it" }],
		});
		assert.ok(!sent(world.calls[0]).includes("abc123def456"));
	});

	test("shrinks the context to the budget the task leaves", async () => {
		const task = "T".repeat(11000);
		await world.run({ context: "C".repeat(5000), tasks: [{ task }] });
		const brief = sent(world.calls[0]);
		assert.ok(brief.startsWith(task));
		assert.ok(brief.length <= BUDGET_CHARS);
		assert.equal(brief.length, BUDGET_CHARS);
	});

	test("drops the context when under 500 characters remain", async () => {
		const task = "T".repeat(11600);
		await world.run({ context: "C".repeat(5000), tasks: [{ task }] });
		assert.equal(sent(world.calls[0]), task);
	});

	test("never shortens the task for the context", async () => {
		const task = "T".repeat(20000);
		await world.run({ context: "C".repeat(5000), tasks: [{ task }] });
		assert.equal(sent(world.calls[0]), prepareBrief(task));
	});

	test("sends the same text as a task alone when there is no context", async () => {
		await world.run({ tasks: [{ task: "Do it" }] });
		assert.equal(sent(world.calls[0]), "Do it");
	});
});

describe("limits", () => {
	test("at most four items are scored at once", async () => {
		let inFlight = 0;
		let peak = 0;
		world.fetchWith(async () => {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await wait(15);
			inFlight -= 1;
			return reply(jevAnswer(1, 1));
		});
		const tasks = Array.from({ length: 10 }, (_, i) => ({ task: `task ${i}` }));
		const result = await world.run({ tasks });
		assert.equal(peak, MAX_PARALLEL);
		assert.equal(tasksOf(result).length, 10);
		assert.equal(world.notes.length, 1);
	});

	test("one deadline of 8000 ms covers the batch", async () => {
		const timeout = mock.method(
			AbortSignal,
			"timeout",
			() => new AbortController().signal,
		);
		await world.run({ tasks: [{ task: "a" }, { task: "b" }, { task: "c" }] });
		assert.deepEqual(
			timeout.mock.calls.map((c) => c.arguments),
			[[DEADLINE_MS]],
		);
		assert.equal(DEADLINE_MS, 8000);
	});

	test("the deadline aborts running requests and stops queued ones", async () => {
		const deadline = new AbortController();
		mock.method(AbortSignal, "timeout", () => deadline.signal);
		world.fetchWith(
			({ init }) =>
				new Promise((_resolve, reject) => {
					init.signal.addEventListener("abort", () =>
						reject(new Error("aborted")),
					);
				}),
		);
		const tasks = Array.from({ length: 6 }, (_, i) => ({ task: `task ${i}` }));
		const pending = world.run({ tasks });
		await wait(20);
		deadline.abort();
		assert.equal(await pending, undefined);
		assert.equal(world.calls.length, MAX_PARALLEL);
		const entries = (world.notes[0] ?? "").split(" | ");
		assert.equal(entries.length, 6);
		for (const entry of entries)
			assert.match(entry, /skipped, no answer in 8000 ms$/);
	});

	test("a retry waits 300 ms, then asks again", async () => {
		world.fetchWith((_call, n) =>
			n === 0 ? reply("", 503) : reply(jevAnswer(0, 0)),
		);
		const result = await world.run({ tasks: [{ task: "a" }] });
		assert.equal(world.calls.length, 2);
		assert.deepEqual(tasksOf(result), [
			{ task: "a", agent: "router_light", effort: "med" },
		]);
	});

	test("the deadline during the retry wait stops the retry", async () => {
		const deadline = new AbortController();
		mock.method(AbortSignal, "timeout", () => deadline.signal);
		world.fetchWith(() => reply("", 503));
		const pending = world.run({ tasks: [{ task: "a" }] });
		await wait(30);
		deadline.abort();
		assert.equal(await pending, undefined);
		assert.equal(world.calls.length, 1);
		assert.match(world.notes[0] ?? "", /skipped, no answer in 8000 ms/);
	});
});

describe("delivery and failure", () => {
	test("without a UI the line goes to standard error", async () => {
		await world.run({ tasks: [{ task: "a" }] }, { hasUI: false });
		assert.equal(world.notes.length, 0);
		assert.equal(world.stderr.length, 1);
		assert.match(
			world.stderr[0] ?? "",
			/^model-router task 1: L0 router_light · med · p=.*\n$/,
		);
	});

	test("a throwing request keeps the item and names the reason", async () => {
		world.fetchWith(() => {
			throw new Error("boom");
		});
		const result = await world.run({ tasks: [{ task: "a" }] });
		assert.equal(result, undefined);
		assert.match(
			world.notes[0] ?? "",
			/^model-router task 1: skipped, network error$/,
		);
	});

	test("an answer that is not JSON is a malformed answer", async () => {
		world.fetchWith(() => reply("<html>"));
		assert.equal(await world.run({ tasks: [{ task: "a" }] }), undefined);
		assert.match(world.notes[0] ?? "", /skipped, malformed answer/);
	});

	test("a throwing credential lookup with no variable reads as an unset key", async () => {
		const key = async () => {
			throw new Error("store locked");
		};
		assert.equal(
			await world.run({ tasks: [{ task: "a" }] }, { key }),
			undefined,
		);
		assert.match(world.notes[0] ?? "", /skipped, api_key unset/);
	});

	test("a throwing notification does not reach omp", async () => {
		const notify = () => {
			throw new Error("ui gone");
		};
		const result = await world.run({ tasks: [{ task: "a" }] }, { notify });
		assert.equal(tasksOf(result).length, 1);
	});

	test("a hostile event does not throw", async () => {
		const event = taskEvent({});
		Object.defineProperty(event, "input", {
			get() {
				throw new Error("no input");
			},
		});
		const handlers: ((e: unknown, c: unknown) => Promise<unknown>)[] = [];
		extension({
			on: (_event, handler) => void handlers.push(handler as never),
		});
		assert.equal(await handlers[0]?.(event, world.makeCtx()), undefined);
		assert.equal(
			await handlers[0]?.(taskEvent(null as never), world.makeCtx()),
			undefined,
		);
		assert.equal(await handlers[0]?.(null, null), undefined);
	});
});
