import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import {
	ANSWER,
	agentCall,
	callOnce,
	harness,
	KEYED,
	PROMPT,
} from "./harness.ts";

test(
	"an HTTP error passes through and names the status",
	KEYED,
	async ($, on) => {
		const h = harness(on, { text: "overloaded", status: 529 });
		const pending = $.tool.call(agentCall());
		await h.clock.advance(300);
		await pending;
		expect(h.fetched).toBe(2);
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual(["skipped, HTTP 529"]);
	},
);

test("a malformed answer passes through", KEYED, async ($, on) => {
	const { h } = await callOnce($, on, {}, { text: "not json" });
	expect(h.received.model).toBeUndefined();
	expect(h.logs).toEqual(["skipped, malformed answer"]);
});

test("a slow Jev passes through after the timeout", KEYED, async ($, on) => {
	const h = harness(on, { text: ANSWER([1, 0, 0]), delayMs: 60000 });
	const pending = $.tool.call(agentCall());
	await h.clock.advance(8000);
	await pending;
	expect(h.received.model).toBeUndefined();
	expect(h.logs).toEqual(["skipped, no answer in 8000 ms"]);
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
		const pending = $.tool.call(agentCall());
		await h.clock.advance(100);
		expect(await pending).toEqual({ result: "interrupted" });
		expect(h.logs.length).toBe(1);
		expect(h.logs[0]).toMatch(/^skipped, /);
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

test("a hook failure lets the call run unchanged", KEYED, async ($, on) => {
	const { h, outcome } = await callOnce($, on, { prompt: 42 });
	expect(h.calls).toBe(1);
	expect(h.received.model).toBeUndefined();
	expect(h.received.prompt).toBe(42);
	expect(outcome.result).toBe("ok");
});

for (const [name, decision] of [
	["a call that permission rules deny is not sent", "deny"],
	["a permission check that throws lets the call run unchanged", "throw"],
] as const)
	test(name, KEYED, async ($, on) => {
		const { h, outcome } = await callOnce($, on, {}, { decision });
		expect(h.fetched).toBe(0);
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual([]);
		expect(h.debug).toEqual([]);
		expect(outcome.result).toBe("ok");
	});

test("a call that would prompt is still routed", KEYED, async ($, on) => {
	const { h } = await callOnce($, on, {}, { decision: "ask" });
	expect(h.fetched).toBe(1);
	expect(h.received.model).toBe("haiku");
});

test(
	"the permission check gets the call's arguments and nothing else",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on);
		expect(h.checked.tool).toBe("Agent");
		expect(h.checked.input).toEqual({
			prompt: PROMPT,
			description: "write hello",
			subagent_type: "general-purpose",
		});
	},
);
