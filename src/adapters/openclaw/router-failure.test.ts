import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMIT_REACHED } from "../../core/compose.ts";
import { MIN_DEADLINE_MS } from "../../core/handler-deadline.ts";
import {
	CONTEXT,
	DEADLINE_MS,
	lines,
	settle,
	setup,
	TASK,
} from "./handler-fakes.ts";
import { createBeforeToolCall, SPAWN_TOOL } from "./router.ts";
import type { BeforeToolCallEvent, ToolContext } from "./types.ts";

describe("failure", () => {
	const faults: [string, (s: ReturnType<typeof setup>) => void][] = [
		[
			"the settings read",
			(s) => {
				s.api.pluginConfig = {
					get provider(): never {
						throw new Error("settings");
					},
				};
				s.runtime.answers.config = {};
			},
		],
		["the config read", (s) => s.runtime.throwOn.add("config")],
		[
			"the gates input",
			(s) => {
				s.runtime.answers.config = {
					get agents(): never {
						throw new Error("agents");
					},
				};
			},
		],
		[
			"the logger",
			(s) => {
				s.api.logger.info = () => {
					throw new Error("logger");
				};
			},
		],
	];
	for (const [name, inject] of faults)
		it(`returns nothing when ${name} throws`, async () => {
			const s = setup({ levels: { tier: 0, work: 1 } });
			inject(s);
			assert.equal(await s.call(), undefined);
		});

	it("returns nothing when the event params throw", async () => {
		const s = setup();
		const params = {
			get task(): never {
				throw new Error("task");
			},
		};
		assert.equal(
			await s.handler({ toolName: SPAWN_TOOL, params }, CONTEXT),
			undefined,
		);
	});

	it("returns nothing when the Jev fetch throws", async () => {
		const s = setup();
		const handler = createBeforeToolCall(s.api, DEADLINE_MS, {
			fetchFn: () => {
				throw new Error("fetch");
			},
			clock: s.time.clock,
			env: {},
		});
		assert.equal(
			await handler({ toolName: SPAWN_TOOL, params: { task: TASK } }, CONTEXT),
			undefined,
		);
	});
});

describe("a malformed hook call", () => {
	const spawn = { toolName: SPAWN_TOOL, params: { task: TASK } };
	const levels = { tier: 0, work: 1 };

	it("routes the requesting agent itself when ctx is undefined", async () => {
		const s = setup({ levels });
		assert.ok(await s.handler(spawn, undefined as unknown as ToolContext));
	});

	it("routes the requesting agent itself when ctx is empty", async () => {
		const s = setup({ levels });
		assert.ok(await s.handler(spawn, {} as ToolContext));
	});

	it("returns nothing when the abort signal is not a signal", async () => {
		const s = setup({ levels });
		const ctx = { ...CONTEXT, abortSignal: {} as AbortSignal };
		assert.equal(await s.handler(spawn, ctx), undefined);
		assert.equal(s.jev.requests.length, 0);
	});

	it("returns nothing when the clock throws", async () => {
		const s = setup({ levels });
		const handler = createBeforeToolCall(s.api, DEADLINE_MS, {
			fetchFn: s.jev.fetch,
			clock: {
				after: () => {
					throw new Error("clock");
				},
			},
			env: {},
		});
		assert.equal(await handler(spawn, CONTEXT), undefined);
		assert.equal(s.jev.requests.length, 0);
	});

	it("returns nothing when the event is missing", async () => {
		const s = setup({ levels });
		assert.equal(
			await s.handler(undefined as unknown as BeforeToolCallEvent, CONTEXT),
			undefined,
		);
	});
});

describe("deadline", () => {
	it("is inert below the minimum: nothing asked, nothing timed, nothing logged", async () => {
		const s = setup({ deadlineMs: MIN_DEADLINE_MS - 1 });
		assert.equal(await s.call(), undefined);
		assert.equal(s.jev.requests.length, 0);
		assert.deepEqual(s.time.delays(), []);
		assert.deepEqual(lines(s), []);
	});

	it("routes at the minimum", async () => {
		const s = setup({ deadlineMs: MIN_DEADLINE_MS });
		assert.ok(await s.call());
		assert.deepEqual(s.time.delays(), [MIN_DEADLINE_MS]);
	});

	it("aborts a late scorer at the deadline, settles with nothing and logs one timeout line", async () => {
		const s = setup();
		s.jev.mode.current = "hang";
		const pending = s.call();
		await settle();
		assert.deepEqual(s.time.delays(), [DEADLINE_MS]);
		assert.equal(s.jev.requests[0]?.signal?.aborted, false);
		s.time.fire();
		assert.equal(await pending, undefined);
		assert.equal(s.jev.requests[0]?.signal?.aborted, true);
		assert.deepEqual(lines(s), ["model-router skipped, timeout"]);
		await settle();
		assert.deepEqual(lines(s), ["model-router skipped, timeout"]);
	});

	it("aborts the request with the limit reason", async () => {
		const s = setup();
		s.jev.mode.current = "hang";
		const pending = s.call();
		await settle();
		s.time.fire();
		await pending;
		assert.equal(s.jev.requests[0]?.signal?.reason, LIMIT_REACHED);
	});

	it("stops a request when the hook's own signal aborts, and logs one cancelled line", async () => {
		const s = setup();
		s.jev.mode.current = "hang";
		const hook = new AbortController();
		const pending = s.call({}, { ...CONTEXT, abortSignal: hook.signal });
		await settle();
		hook.abort();
		assert.equal(await pending, undefined);
		assert.equal(s.jev.requests[0]?.signal?.aborted, true);
		assert.deepEqual(lines(s), ["model-router skipped, cancelled"]);
		await settle();
		assert.deepEqual(lines(s), ["model-router skipped, cancelled"]);
	});

	it("writes the timeout line at the deadline, before the handler settles", async () => {
		const s = setup();
		s.jev.mode.current = "hang";
		const pending = s.call();
		await settle();
		s.time.fire();
		assert.deepEqual(lines(s), ["model-router skipped, timeout"]);
		await pending;
	});

	it("writes one cancelled line when the hook's signal is already aborted", async () => {
		const s = setup();
		const hook = new AbortController();
		hook.abort();
		assert.equal(
			await s.call({}, { ...CONTEXT, abortSignal: hook.signal }),
			undefined,
		);
		await settle();
		assert.deepEqual(lines(s), ["model-router skipped, cancelled"]);
	});

	it("writes no line for a passing spawn when the hook's signal is already aborted", async () => {
		const s = setup();
		const hook = new AbortController();
		hook.abort();
		await s.call(
			{ model: "acme/own" },
			{ ...CONTEXT, abortSignal: hook.signal },
		);
		await settle();
		assert.deepEqual(lines(s), []);
	});

	it("writes no timeout line for a spawn that passes", async () => {
		const s = setup();
		const pending = s.call({ model: "acme/own" });
		s.time.fire();
		assert.equal(await pending, undefined);
		await settle();
		assert.deepEqual(lines(s), []);
	});

	it("writes one line when the hook's signal aborts after a routed line", async () => {
		const s = setup();
		const hook = new AbortController();
		const info = s.api.logger.info;
		// The abort lands while the work still runs, between the routed line and the end of the work.
		s.api.logger.info = (message) => {
			info(message);
			hook.abort();
		};
		await s.call({}, { ...CONTEXT, abortSignal: hook.signal });
		await settle();
		assert.equal(lines(s).length, 1);
		assert.match(lines(s)[0] ?? "", /^model-router L/);
	});

	it("writes no line and throws nothing when the logger throws at the deadline", async () => {
		const s = setup();
		s.jev.mode.current = "hang";
		const errors: unknown[] = [];
		const record = (err: unknown) => errors.push(err);
		process.on("uncaughtException", record);
		try {
			s.api.logger.info = () => {
				throw new Error("logger");
			};
			const pending = s.call();
			await settle();
			s.time.fire();
			assert.equal(await pending, undefined);
			await settle();
			assert.deepEqual(errors, []);
		} finally {
			process.off("uncaughtException", record);
		}
	});

	it("cancels its timer when the work ends first", async () => {
		const s = setup();
		await s.call();
		assert.equal(s.time.live(), 0);
	});

	it("leaves no unhandled rejection when cancelling the timer throws", async () => {
		const s = setup();
		const rejections: unknown[] = [];
		const record = (reason: unknown) => rejections.push(reason);
		process.on("unhandledRejection", record);
		try {
			const handler = createBeforeToolCall(s.api, DEADLINE_MS, {
				fetchFn: s.jev.fetch,
				clock: {
					after: () => ({
						cancel: () => {
							throw new Error("cancel");
						},
					}),
				},
				env: {},
			});
			assert.ok(
				await handler(
					{ toolName: SPAWN_TOOL, params: { task: TASK } },
					CONTEXT,
				),
			);
			await settle();
			await settle();
			assert.deepEqual(rejections, []);
		} finally {
			process.off("unhandledRejection", record);
		}
	});
});
