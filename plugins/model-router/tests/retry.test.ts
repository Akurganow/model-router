import { expect, test } from "claude-code/testing";
import {
	ANSWER,
	agentCall,
	harness,
	KEYED,
	offerAll,
	PROMPT,
} from "./harness.ts";

const SERVER_ERROR = { status: 500, text: "oops" };
const FIRST_BACKOFF_MIN_MS = 375;
const FIRST_BACKOFF_MAX_MS = 500;

test(
	"a retry waits on the clock timers inside the backoff window",
	KEYED,
	async ($, on) => {
		const h = harness(on, { replies: [SERVER_ERROR, {}] });
		await offerAll($);
		const pending = $.tool.call(agentCall());
		await h.clock.advance(FIRST_BACKOFF_MIN_MS - 1);
		expect(h.fetched).toBe(1);
		await h.clock.advance(FIRST_BACKOFF_MAX_MS - FIRST_BACKOFF_MIN_MS + 1);
		await pending;
		expect(h.fetched).toBe(2);
		expect(h.received.model).toBe("haiku");
		expect(h.logs.length).toBe(1);
	},
);

test("Retry-After sets the wait exactly", KEYED, async ($, on) => {
	const retryAfter = { status: 429, headers: { "retry-after": "3" }, text: "" };
	const h = harness(on, { replies: [retryAfter, {}] });
	await offerAll($);
	const pending = $.tool.call(agentCall());
	await h.clock.advance(2999);
	expect(h.fetched).toBe(1);
	await h.clock.advance(1);
	await pending;
	expect(h.fetched).toBe(2);
	expect(h.received.model).toBe("haiku");
});

test("the limit cuts a retry wait short", KEYED, async ($, on) => {
	const retryAfter = {
		status: 429,
		headers: { "retry-after": "20" },
		text: "",
	};
	const h = harness(on, { replies: [retryAfter, {}] });
	await offerAll($);
	const pending = $.tool.call(agentCall());
	await h.clock.advance(8000);
	await pending;
	expect(h.fetched).toBe(1);
	expect(h.logs).toEqual(["skipped, timeout"]);
	await h.clock.advance(20000);
	expect(h.fetched).toBe(1);
});

test(
	"two overlapping calls each get their own decision",
	KEYED,
	async ($, on) => {
		const h = harness(on, {
			delayMs: 100,
			text: (body) =>
				body.includes("ALPHA") ? ANSWER([0.9, 0.1, 0]) : ANSWER([0, 0.1, 0.9]),
		});
		await offerAll($);
		const alpha = $.tool.call(agentCall({ prompt: `ALPHA ${PROMPT}` }));
		const beta = $.tool.call(agentCall({ prompt: `BETA ${PROMPT}` }));
		await h.clock.advance(100);
		await Promise.all([alpha, beta]);
		const modelOf = (tag: string) =>
			h.seen.find((c) => String(c.prompt).startsWith(tag))?.model;
		expect(modelOf("ALPHA")).toBe("haiku");
		expect(modelOf("BETA")).toBe("opus");
		expect(h.logs.length).toBe(2);
	},
);
