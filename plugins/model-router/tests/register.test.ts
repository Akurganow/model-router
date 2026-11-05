import { expect, test } from "claude-code/testing";
import { ANSWER, agentCall, callOnce, KEYED, PROMPT } from "./harness.ts";

// The plugin folder cannot import src/brief.ts, so the test pins the start of the fixed role.
const DEFAULT_ROLE_PREFIX =
	"General-purpose agent for researching complex questions, searching";
const EXTENDED = { options: { api_key: "test-key", scope: "extended" } };

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

for (const subagentType of [undefined, "claude"] as const)
	test(
		`${subagentType ?? "general-purpose"} is routed with the fixed default role`,
		KEYED,
		async ($, on) => {
			const { h } = await callOnce($, on, { subagent_type: subagentType });
			expect(JSON.parse(h.sent ?? "").state.role).toContain(
				DEFAULT_ROLE_PREFIX,
			);
			expect(h.received.model).toBe("haiku");
		},
	);

for (const [subagentType, role] of [
	[
		"Explore",
		"Read-only search agent for broad fan-out searches across a codebase.",
	],
	["Plan", "Software architect agent for designing implementation plans."],
] as const)
	test(
		`${subagentType} is routed with its offered description as the role`,
		KEYED,
		async ($, on) => {
			const { h } = await callOnce($, on, { subagent_type: subagentType });
			expect(JSON.parse(h.sent ?? "").state.role).toBe(role);
			expect(h.received.model).toBe("haiku");
		},
	);

for (const [name, description, role] of [
	[
		"a user general-purpose agent with a long description is cut at the cap",
		"x".repeat(600),
		"x".repeat(500),
	],
	[
		"a user general-purpose agent with an empty description gets the neutral line",
		"",
		"An agent with no description.",
	],
] as const)
	test(name, EXTENDED, async ($, on) => {
		const { h } = await callOnce(
			$,
			on,
			{},
			{
				offers: { "general-purpose": "user" },
				descriptions: { "general-purpose": description },
			},
		);
		expect(JSON.parse(h.sent ?? "").state.role).toBe(role);
	});

test(
	"a user general-purpose agent sends its own description",
	EXTENDED,
	async ($, on) => {
		const { h } = await callOnce(
			$,
			on,
			{},
			{
				offers: { "general-purpose": "user" },
				descriptions: { "general-purpose": "Mine." },
			},
		);
		expect(JSON.parse(h.sent ?? "").state.role).toBe("Mine.");
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

test(
	"the endpoint and model come from the code, not from the environment",
	KEYED,
	async ($, on) => {
		const env = {
			TYPESAFE_BASE_URL: "https://evil.example",
			TYPESAFE_DEFAULT_MODEL: "env-model",
			TYPESAFE_LOG_LEVEL: "debug",
		};
		const { h } = await callOnce($, on, {}, { env });
		expect(h.request.url).toBe("https://api.typesafe.ai/v1/systemone");
		expect(JSON.parse(h.sent ?? "").model).toBe("jev-latest");
		expect(h.debug.length).toBe(1);
	},
);

test(
	"a stored model option is ignored and jev-latest is sent",
	{ options: { api_key: "test-key", model: "jev-preview" } },
	async ($, on) => {
		const { h } = await callOnce($, on);
		expect(JSON.parse(h.sent ?? "").model).toBe("jev-latest");
	},
);

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
		expect(h.debug[0]).toContain(
			'"role":"General-purpose agent for researching complex questions, searching',
		);
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

test(
	"the Agent call reaches the tool as the model wrote it",
	KEYED,
	async ($, on) => {
		const { h } = await callOnce($, on);
		expect(h.seen).toEqual([agentCall()]);
	},
);

test("the main loop's requests keep their effort", KEYED, async ($, on) => {
	const { h } = await callOnce($, on);
	const main = $.turn.step({
		turnId: "main",
		index: 0,
		model: "opus",
		effort: "low",
		messageCount: 1,
	});
	for await (const _ of main);
	expect(h.received.effort).toBe("low");
});
