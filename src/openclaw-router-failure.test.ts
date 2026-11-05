import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMIT_REACHED } from "./compose.ts";
import {
	CONTEXT,
	DEADLINE_MS,
	lines,
	settle,
	setup,
	TASK,
} from "./openclaw-handler-fakes.ts";
import {
	createBeforeToolCall,
	MIN_DEADLINE_MS,
	SPAWN_TOOL,
} from "./openclaw-router.ts";
import type { BeforeToolCallEvent, ToolContext } from "./openclaw-types.ts";

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
		["the default model resolve", (s) => s.runtime.throwOn.add("defaultModel")],
		["the model resolve", (s) => s.runtime.throwOn.add("allowedRef")],
		["the credential check", (s) => s.runtime.throwOn.add("credential")],
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

	it("routes the own default agent when ctx is undefined", async () => {
		const s = setup({ levels });
		assert.ok(await s.handler(spawn, undefined as unknown as ToolContext));
	});

	it("routes the own default agent when ctx is empty", async () => {
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

	it("aborts a late scorer at the deadline, settles with nothing and logs nothing", async () => {
		const s = setup();
		s.jev.mode.current = "hang";
		const pending = s.call();
		await settle();
		assert.deepEqual(s.time.delays(), [DEADLINE_MS]);
		assert.equal(s.jev.requests[0]?.signal?.aborted, false);
		s.time.fire();
		assert.equal(await pending, undefined);
		assert.equal(s.jev.requests[0]?.signal?.aborted, true);
		await settle();
		assert.deepEqual(lines(s), []);
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

	it("stops a request when the hook's own signal aborts, and logs nothing", async () => {
		const s = setup();
		s.jev.mode.current = "hang";
		const hook = new AbortController();
		const pending = s.call({}, { ...CONTEXT, abortSignal: hook.signal });
		await settle();
		hook.abort();
		assert.equal(await pending, undefined);
		assert.equal(s.jev.requests[0]?.signal?.aborted, true);
		assert.deepEqual(lines(s), []);
	});

	it("covers the model checks: a result that arrives late is dropped", async () => {
		const s = setup({ levels: { tier: 0, work: 1 } });
		let release: (value: boolean) => void = () => undefined;
		s.runtime.runtime.modelAuth.isProviderApiKeyConfiguredAsync = () =>
			new Promise((resolve) => {
				release = resolve;
			});
		const pending = s.call();
		await settle();
		await settle();
		s.time.fire();
		assert.equal(await pending, undefined);
		release(true);
		await settle();
		assert.deepEqual(lines(s), []);
	});

	it("cancels its timer when the work ends first", async () => {
		const s = setup();
		await s.call();
		s.time.fire();
		assert.deepEqual(lines(s).length, 1);
	});
});
