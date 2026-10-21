import { expect, test } from "claude-code/testing";
import { ANSWER, agentCall, callOnce, KEYED, PROMPT } from "./harness.ts";

test(
	"the hook sets the model and the effort on the Agent call",
	KEYED,
	async ($, on) => {
		const { h, outcome } = await callOnce($, on);
		expect(h.received.model).toBe("haiku");
		expect(h.received.effort).toBe("high");
		expect(h.received.prompt).toBe(PROMPT);
		expect(outcome.result).toBe("ok");
		expect(h.logs).toEqual([
			"L0 haiku · high · p=0.90/0.60 · jev jev-1.14.0 · 1/1 tok",
		]);
	},
);

test(
	"a fork, a named agent and a caller-named model pass through without a fetch",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on, { subagent_type: "fork" });
		expect(h.received.model).toBeUndefined();
		await $.tool.call(agentCall({ name: "scout" }));
		expect(h.received.model).toBeUndefined();
		await $.tool.call(agentCall({ model: "sonnet" }));
		expect(h.received.model).toBe("sonnet");
		expect(h.received.effort).toBeUndefined();
		expect(h.fetched).toBe(0);
		expect(h.logs).toEqual([]);
	},
);

test(
	"a call without an agent type is routed as general-purpose",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on, { subagent_type: undefined });
		expect(JSON.parse(h.sent ?? "").state.role).toBe("general-purpose");
	},
);

test(
	"the request goes to the systemone endpoint with the key and the pinned model",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on);
		expect(h.request.url).toBe("https://api.typesafe.ai/v1/systemone");
		expect(h.request.init?.method).toBe("POST");
		expect(h.request.init?.headers?.Authorization).toBe("Bearer test-key");
		expect(h.request.init?.headers?.["Content-Type"]).toBe("application/json");
		const body = JSON.parse(h.sent ?? "");
		expect(body.model).toBe("jev-latest");
		expect(body.state.description).toBe("write hello");
	},
);

for (const [name, model, alias] of [
	["the model option picks the Jev alias", "jev-preview", "jev-preview"],
	[
		"an unknown model option falls back to jev-latest",
		"jev-1.14.0",
		"jev-latest",
	],
] as const)
	test(name, { options: { api_key: "test-key", model } }, async ($, on) => {
		const { h } = await callOnce($, on);
		expect(JSON.parse(h.sent ?? "").model).toBe(alias);
	});

test(
	"an Agent call that names an effort keeps it and gets the model",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce(
			$,
			on,
			{ effort: "low" },
			{ text: ANSWER([0.1, 0.8, 0.1]) },
		);
		expect(h.received.model).toBe("sonnet");
		expect(h.received.effort).toBe("low");
		expect(h.logs).toEqual([
			"L1 sonnet · caller effort · p=0.80/0.60 · jev jev-1.14.0 · 1/1 tok",
		]);
	},
);

test(
	"each request body goes to the debug log without the key",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on);
		expect(h.debug.length).toBe(1);
		expect(h.debug[0]?.startsWith("request 1/1 {")).toBe(true);
		expect(h.debug[0]).toContain('"role":"general-purpose"');
		expect(h.debug[0]).toContain('"description":"write hello"');
		expect(h.debug[0]).not.toContain("test-key");
	},
);

test(
	"a long request goes to the debug log in pieces that join back",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on, { prompt: "x".repeat(12000) });
		expect(h.debug.length).toBe(2);
		expect(h.debug[0]?.startsWith("request 1/2 ")).toBe(true);
		expect(h.debug[1]?.startsWith("request 2/2 ")).toBe(true);
		for (const line of h.debug)
			expect(line.length <= 9000 + "request 2/2 ".length).toBe(true);
		expect(
			h.debug.map((line) => line.replace(/^request \d+\/\d+ /, "")).join(""),
		).toBe(h.sent);
	},
);
