import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import {
	ANSWER,
	agentCall,
	callOnce,
	harness,
	KEYED,
	offerAll,
	PROMPT,
} from "./harness.ts";

test(
	"an HTTP error passes through after the SDK retries and names the status",
	KEYED,
	async ($, on) => {
		const h = harness(on, { text: "overloaded", status: 529 });
		await offerAll($);
		const pending = $.tool.call(agentCall());
		await h.clock.advance(1500);
		await pending;
		expect(h.fetched).toBe(3);
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual(["skipped, HTTP 529"]);
	},
);

test(
	"a failing network passes through after the SDK retries",
	KEYED,
	async ($, on) => {
		const h = harness(on, { offline: true });
		await offerAll($);
		const pending = $.tool.call(agentCall());
		await h.clock.advance(1500);
		await pending;
		expect(h.fetched).toBe(3);
		expect(h.logs).toEqual(["skipped, network error"]);
	},
);

test("a malformed answer passes through", KEYED, async ($, on) => {
	const { h } = await callOnce($, on, {}, { text: "not json" });
	expect(h.received.model).toBeUndefined();
	expect(h.logs).toEqual(["skipped, bad reply"]);
});

test("a slow Jev passes through after the timeout", KEYED, async ($, on) => {
	const h = harness(on, { text: ANSWER([1, 0, 0]), delayMs: 60000 });
	await offerAll($);
	const pending = $.tool.call(agentCall());
	await h.clock.advance(7999);
	expect(h.logs).toEqual([]);
	await h.clock.advance(1);
	await pending;
	expect(h.received.model).toBeUndefined();
	expect(h.logs).toEqual(["skipped, timeout"]);
	await h.clock.advance(60000);
	expect(h.fetched).toBe(1);
});

// A hook above that settles first abandons the dispatch, as the user's interrupt does.
const interrupter = {
	name: "interrupter",
	tier: "prepend" as const,
	register(on: On) {
		on("tool.call", { tool: "Agent" }, async ($, e, next) => {
			next(e).catch(() => undefined);
			await $.clock.sleep(100);
			return { result: "interrupted" };
		});
	},
};

test(
	"an abandoned call ends the Jev wait at once and passes through",
	{ ...KEYED, plugins: [interrupter] },
	async ($, on) => {
		const h = harness(on, { text: ANSWER([1, 0, 0]), delayMs: 60000 });
		await offerAll($);
		const pending = $.tool.call(agentCall());
		await h.clock.advance(100);
		expect(await pending).toEqual({ result: "interrupted" });
		expect(h.logs).toEqual(["skipped, cancelled"]);
		expect(h.received.model).toBeUndefined();
		expect(h.received.prompt).toBe(PROMPT);
	},
);

test("a denied call says so and returns the denial", KEYED, async ($, on) => {
	const { h, outcome } = await callOnce($, on, {}, { result: { deny: "no" } });
	expect(outcome.deny).toBe("no");
	expect(h.logs).toEqual([
		"L0 haiku · high · p=0.90/0.60 · jev jev-1.14.0 · 1/1 tok",
		"denied",
	]);
});

test(
	"a rejected key names the status and logs neither the body nor the task",
	KEYED,
	async ($, on) => {
		const secret = "sk-live-0123456789abcdef";
		const body = JSON.stringify({
			error: `bad key ${secret} for task: ${PROMPT}`,
		});
		const { h } = await callOnce($, on, {}, { status: 401, text: body });
		expect(h.fetched).toBe(1);
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual(["skipped, HTTP 401"]);
		expect(h.debug.join("")).not.toContain(secret);
	},
);

test("a hook failure lets the call run unchanged", KEYED, async ($, on) => {
	const { h, outcome } = await callOnce($, on, { prompt: 42 });
	expect(h.calls).toBe(1);
	expect(h.received.model).toBeUndefined();
	expect(h.received.prompt).toBe(42);
	expect(outcome.result).toBe("ok");
});

// The engine runs its own permission check after the hooks, and a deny there ends the call.
test("a call that permission rules deny is not sent", KEYED, async ($, on) => {
	const { h, outcome } = await callOnce($, on, {}, { decision: "deny" });
	expect(h.fetched).toBe(0);
	expect(h.checks.length).toBe(2);
	expect(h.logs).toEqual([]);
	expect(h.debug).toEqual([]);
	expect(h.calls).toBe(0);
	expect(String(outcome.result)).toMatch(/denied/);
});

test(
	"a permission check that throws lets the call run unchanged",
	KEYED,
	async ($, on) => {
		const { h, outcome } = await callOnce($, on, {}, { decision: "throw" });
		expect(h.fetched).toBe(0);
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual([]);
		expect(outcome.result).toBe("ok");
	},
);

test("a call that would prompt is still routed", KEYED, async ($, on) => {
	const { h } = await callOnce($, on, {}, { decision: "ask" });
	expect(h.fetched).toBe(1);
	expect(h.logs.length).toBe(1);
	expect(h.logs[0]).toMatch(/^L0 haiku/);
});

test(
	"the permission check gets the call's arguments and nothing else",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on);
		expect(h.checks[0]?.tool).toBe("Agent");
		expect(h.checks[0]?.input).toEqual({
			prompt: PROMPT,
			description: "write hello",
			subagent_type: "general-purpose",
		});
	},
);
