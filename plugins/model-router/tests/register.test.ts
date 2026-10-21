import type { On, ToolCallArgs, ToolCheckDecision } from "claude-code";
import type { MockClock } from "claude-code/testing";
import { expect, mock, test } from "claude-code/testing";

const score = (p: number[]) => ({
	type: "score",
	score: 0,
	confidence: 0.9,
	legend: {},
	probabilities: { "0": p[0], "1": p[1], "2": p[2] },
});

const ANSWER = (tier: number[], work: number[] = [0.2, 0.6, 0.2]) =>
	JSON.stringify({
		model: "jev-1.14.0",
		answers: { tier: score(tier), work: score(work) },
		usage: { input_tokens: 1, output_tokens: 1 },
	});

const TOOL_RESULT = { result: "ok" };

const PROMPT =
	"Create src/hello.ts with exactly this content and run the tests.";

const agentCall = (over: Record<string, unknown> = {}) =>
	({
		tool: "Agent",
		tool_use_id: "toolu_1",
		prompt: PROMPT,
		description: "write hello",
		subagent_type: "general-purpose",
		...over,
	}) as unknown as ToolCallArgs;

type Loose = {
	tool?: unknown;
	model?: unknown;
	effort?: unknown;
	prompt?: unknown;
	input?: unknown;
};
type Request = {
	url?: string;
	init?: {
		method?: string;
		headers?: { Authorization?: string; "Content-Type"?: string };
		body?: string;
	};
};
type Outcome = { result?: unknown; deny?: unknown };
type Harness = {
	clock: MockClock;
	logs: string[];
	debug: string[];
	fetched: number;
	received: Loose;
	checked: Loose;
	sent: string | undefined;
	auth: string | undefined;
};

const harness = (
	on: On,
	fetchText = ANSWER([0.9, 0.1, 0]),
	status = 200,
	decision: ToolCheckDecision | "throw" = "allow",
	fetchDelayMs = 0,
	env: Readonly<Record<string, string>> = {},
): Harness => {
	mock.env(on, env);
	const h: Harness = {
		clock: mock.clock(on),
		logs: [],
		debug: [],
		fetched: 0,
		received: {},
		checked: {},
		sent: undefined,
		auth: undefined,
	};
	on("ui.log", (_: unknown, e: { text: string; to?: string }) => {
		(e.to === "debug" ? h.debug : h.logs).push(e.text);
		return { value: undefined };
	});
	on("http.fetch", async (_, e) => {
		h.fetched += 1;
		h.sent = e.init?.body;
		const { Authorization } = e.init?.headers ?? {};
		h.auth = Authorization;
		if (fetchDelayMs > 0) await h.clock.sleep(fetchDelayMs);
		return {
			value: { status, ok: status < 300, headers: {}, text: fetchText },
		};
	});
	on("tool.check", (_, e) => {
		h.checked = e;
		if (decision === "throw") throw new Error("boom");
		return { decision };
	});
	on("tool.call", (_, e) => {
		h.received = e;
		return TOOL_RESULT;
	});
	return h;
};

test(
	"the hook sets the model and the effort on the Agent call",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on);
		const r: Outcome = await $.tool.call(agentCall());
		expect(h.received.model).toBe("haiku");
		expect(h.received.effort).toBe("high");
		expect(h.received.prompt).toBe(PROMPT);
		expect(r.result).toBe("ok");
		expect(h.logs).toEqual([
			"L0 haiku · high · p=0.90/0.60 · jev jev-1.14.0 · 1/1 tok",
		]);
	},
);

test(
	"a fork, a named agent and a caller-named model pass through without a fetch",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on);
		await $.tool.call(agentCall({ subagent_type: "fork" }));
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
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		mock.clock(on);
		let request: Request = {};
		on("ui.log", () => ({ value: undefined }));
		on("http.fetch", (_, e) => {
			request = e;
			return {
				value: {
					status: 200,
					ok: true,
					headers: {},
					text: ANSWER([0.9, 0.1, 0]),
				},
			};
		});
		on("tool.check", () => ({ decision: "allow" }));
		on("tool.call", () => TOOL_RESULT);
		await $.tool.call(agentCall({ subagent_type: undefined }));
		expect(JSON.parse(request.init?.body ?? "").state.role).toBe(
			"general-purpose",
		);
	},
);

test(
	"a missing key passes through and says so",
	{ options: {} },
	async ($, on) => {
		const h = harness(on);
		await $.tool.call(agentCall());
		expect(h.received.model).toBeUndefined();
		expect(h.fetched).toBe(0);
		expect(h.logs).toEqual(["skipped, api_key unset"]);
	},
);

test(
	"an empty key passes through like a missing one",
	{ options: { api_key: "" } },
	async ($, on) => {
		const h = harness(on);
		await $.tool.call(agentCall());
		expect(h.received.model).toBeUndefined();
		expect(h.fetched).toBe(0);
		expect(h.logs).toEqual(["skipped, api_key unset"]);
	},
);

test(
	"the option is the key when it is set",
	{ options: { api_key: "option-key" } },
	async ($, on) => {
		const h = harness(on);
		await $.tool.call(agentCall());
		expect(h.auth).toBe("Bearer option-key");
	},
);

test(
	"TYPESAFE_API_KEY is the key when the option is empty",
	{ options: { api_key: "" } },
	async ($, on) => {
		const h = harness(on, undefined, 200, "allow", 0, {
			TYPESAFE_API_KEY: "typesafe-var-key",
		});
		await $.tool.call(agentCall());
		expect(h.auth).toBe("Bearer typesafe-var-key");
		expect(h.received.model).toBe("haiku");
		expect([...h.logs, ...h.debug].join("\n")).not.toContain(
			"typesafe-var-key",
		);
	},
);

test(
	"the option wins over the variable",
	{ options: { api_key: "option-key" } },
	async ($, on) => {
		const h = harness(on, undefined, 200, "allow", 0, {
			TYPESAFE_API_KEY: "typesafe-var-key",
		});
		await $.tool.call(agentCall());
		expect(h.auth).toBe("Bearer option-key");
	},
);

test(
	"an empty option and an empty variable pass through as unset",
	{ options: { api_key: "" } },
	async ($, on) => {
		const h = harness(on, undefined, 200, "allow", 0, {
			TYPESAFE_API_KEY: "",
		});
		await $.tool.call(agentCall());
		expect(h.received.model).toBeUndefined();
		expect(h.fetched).toBe(0);
		expect(h.logs).toEqual(["skipped, api_key unset"]);
	},
);

test(
	"an HTTP error passes through and names the status",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on, "overloaded", 529);
		const pending = $.tool.call(agentCall());
		await h.clock.advance(300);
		await pending;
		expect(h.fetched).toBe(2);
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual(["skipped, HTTP 529"]);
	},
);

test(
	"a malformed answer passes through",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on, "not json");
		await $.tool.call(agentCall());
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual(["skipped, malformed answer"]);
	},
);

test(
	"a slow Jev passes through after the timeout",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on, ANSWER([1, 0, 0]), 200, "allow", 60000);
		const pending = $.tool.call(agentCall());
		await h.clock.advance(8000);
		await pending;
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual(["skipped, no answer in 8000 ms"]);
	},
);

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
	{ options: { api_key: "test-key" }, plugins: [interrupter] },
	async ($, on) => {
		const h = harness(on, ANSWER([1, 0, 0]), 200, "allow", 60000);
		const pending = $.tool.call(agentCall());
		await h.clock.advance(100);
		expect(await pending).toEqual({ result: "interrupted" });
		expect(h.logs.length).toBe(1);
		expect(h.logs[0]).toMatch(/^skipped, /);
		expect(h.received.model).toBeUndefined();
		expect(h.received.prompt).toBe(PROMPT);
	},
);

test(
	"the request goes to the systemone endpoint with the key and the pinned model",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		mock.clock(on);
		let request: Request = {};
		on("ui.log", () => ({ value: undefined }));
		on("http.fetch", (_, e) => {
			request = e;
			return {
				value: {
					status: 200,
					ok: true,
					headers: {},
					text: ANSWER([0.9, 0.1, 0]),
				},
			};
		});
		on("tool.check", () => ({ decision: "allow" }));
		on("tool.call", () => TOOL_RESULT);
		await $.tool.call(agentCall());
		expect(request.url).toBe("https://api.typesafe.ai/v1/systemone");
		expect(request.init?.method).toBe("POST");
		expect(request.init?.headers?.Authorization).toBe("Bearer test-key");
		expect(request.init?.headers?.["Content-Type"]).toBe("application/json");
		const body = JSON.parse(request.init?.body ?? "");
		expect(body.model).toBe("jev-latest");
		expect(body.state.description).toBe("write hello");
	},
);

test(
	"the model option picks the Jev alias",
	{ options: { api_key: "test-key", model: "jev-preview" } },
	async ($, on) => {
		const h = harness(on);
		await $.tool.call(agentCall());
		expect(JSON.parse(h.sent ?? "").model).toBe("jev-preview");
	},
);

test(
	"an unknown model option falls back to jev-latest",
	{ options: { api_key: "test-key", model: "jev-1.14.0" } },
	async ($, on) => {
		const h = harness(on);
		await $.tool.call(agentCall());
		expect(JSON.parse(h.sent ?? "").model).toBe("jev-latest");
	},
);

test(
	"an Agent call that names an effort keeps it and gets the model",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on, ANSWER([0.1, 0.8, 0.1]));
		await $.tool.call(agentCall({ effort: "low" }));
		expect(h.received.model).toBe("sonnet");
		expect(h.received.effort).toBe("low");
		expect(h.logs).toEqual([
			"L1 sonnet · caller effort · p=0.80/0.60 · jev jev-1.14.0 · 1/1 tok",
		]);
	},
);

test(
	"a denied call says so and returns the denial",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		mock.clock(on);
		const logs: string[] = [];
		on("ui.log", (_: unknown, e: { text: string; to?: string }) => {
			if (e.to !== "debug") logs.push(e.text);
			return { value: undefined };
		});
		on("http.fetch", () => ({
			value: {
				status: 200,
				ok: true,
				headers: {},
				text: ANSWER([0.9, 0.1, 0]),
			},
		}));
		on("tool.check", () => ({ decision: "allow" }));
		on("tool.call", () => ({ deny: "no" }));
		const r: Outcome = await $.tool.call(agentCall());
		expect(r.deny).toBe("no");
		expect(logs).toEqual([
			"L0 haiku · high · p=0.90/0.60 · jev jev-1.14.0 · 1/1 tok",
			"denied",
		]);
	},
);

test(
	"a hook failure lets the call run unchanged",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		mock.clock(on);
		let runs = 0;
		let received: Loose = {};
		on("ui.log", () => ({ value: undefined }));
		on("http.fetch", () => ({
			value: {
				status: 200,
				ok: true,
				headers: {},
				text: ANSWER([0.9, 0.1, 0]),
			},
		}));
		on("tool.check", () => ({ decision: "allow" }));
		on("tool.call", (_, e) => {
			runs += 1;
			received = e;
			return TOOL_RESULT;
		});
		const r: Outcome = await $.tool.call(agentCall({ prompt: 42 }));
		expect(runs).toBe(1);
		expect(received.model).toBeUndefined();
		expect(received.prompt).toBe(42);
		expect(r.result).toBe("ok");
	},
);

test(
	"a call that permission rules deny is not sent",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on, undefined, 200, "deny");
		const r: Outcome = await $.tool.call(agentCall());
		expect(h.fetched).toBe(0);
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual([]);
		expect(h.debug).toEqual([]);
		expect(r.result).toBe("ok");
	},
);

test(
	"a call that would prompt is still routed",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on, undefined, 200, "ask");
		await $.tool.call(agentCall());
		expect(h.fetched).toBe(1);
		expect(h.received.model).toBe("haiku");
	},
);

test(
	"each request body goes to the debug log without the key",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on);
		await $.tool.call(agentCall());
		expect(h.debug.length).toBe(1);
		expect(h.debug[0]?.startsWith("request 1/1 {")).toBe(true);
		expect(h.debug[0]).toContain('"role":"general-purpose"');
		expect(h.debug[0]).toContain('"description":"write hello"');
		expect(h.debug[0]).not.toContain("test-key");
	},
);

test(
	"the permission check gets the call's arguments and nothing else",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on);
		await $.tool.call(agentCall());
		expect(h.checked.tool).toBe("Agent");
		expect(h.checked.input).toEqual({
			prompt: PROMPT,
			description: "write hello",
			subagent_type: "general-purpose",
		});
	},
);

test(
	"a permission check that throws lets the call run unchanged",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on, undefined, 200, "throw");
		const r: Outcome = await $.tool.call(agentCall());
		expect(h.fetched).toBe(0);
		expect(h.received.model).toBeUndefined();
		expect(h.logs).toEqual([]);
		expect(r.result).toBe("ok");
	},
);

test(
	"a long request goes to the debug log in pieces that join back",
	{ options: { api_key: "test-key" } },
	async ($, on) => {
		const h = harness(on);
		await $.tool.call(agentCall({ prompt: "x".repeat(12000) }));
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
