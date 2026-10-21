import type { On, ToolCallArgs, ToolCheckDecision } from "claude-code";
import type { Engine, MockClock } from "claude-code/testing";
import { mock } from "claude-code/testing";

type Levels = Record<string, number>;

const score = (p: Levels) => ({
	type: "score",
	score: 0,
	confidence: 0.9,
	legend: {},
	probabilities: p,
});

export const answer = (
	tier: Levels,
	work: Levels = { "0": 0.2, "1": 0.6, "2": 0.2 },
) =>
	JSON.stringify({
		model: "jev-1.14.0",
		answers: { tier: score(tier), work: score(work) },
		usage: { input_tokens: 1, output_tokens: 1 },
	});

const levels = (p: number[]): Levels => ({
	"0": p[0] ?? 0,
	"1": p[1] ?? 0,
	"2": p[2] ?? 0,
});

export const ANSWER = (tier: number[], work?: number[]) =>
	answer(levels(tier), work && levels(work));

export const PROMPT =
	"Create src/hello.ts with exactly this content and run the tests.";

export const agentCall = (over: Record<string, unknown> = {}) =>
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
export type Outcome = { result?: unknown; deny?: unknown };
type Harness = {
	clock: MockClock;
	logs: string[];
	debug: string[];
	fetched: number;
	calls: number;
	request: Request;
	received: Loose;
	checked: Loose;
	sent: string | undefined;
	auth: string | undefined;
};
export const KEYED = { options: { api_key: "test-key" } };

type Setup = {
	text?: string;
	status?: number;
	decision?: ToolCheckDecision | "throw";
	delayMs?: number;
	env?: Readonly<Record<string, string>>;
	result?: { result: string } | { deny: string };
};

export const harness = (on: On, setup: Setup = {}): Harness => {
	const {
		text = ANSWER([0.9, 0.1, 0]),
		status = 200,
		decision = "allow",
		delayMs = 0,
		env = {},
		result = { result: "ok" },
	} = setup;
	mock.env(on, env);
	const h: Harness = {
		clock: mock.clock(on),
		logs: [],
		debug: [],
		fetched: 0,
		calls: 0,
		request: {},
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
		h.request = e;
		h.sent = e.init?.body;
		const { Authorization } = e.init?.headers ?? {};
		h.auth = Authorization;
		if (delayMs > 0) await h.clock.sleep(delayMs);
		return { value: { status, ok: status < 300, headers: {}, text } };
	});
	on("tool.check", (_, e) => {
		h.checked = e;
		if (decision === "throw") throw new Error("boom");
		return { decision };
	});
	on("tool.call", (_, e) => {
		h.calls += 1;
		h.received = e;
		return result;
	});
	return h;
};

export const callOnce = async (
	$: Engine,
	on: On,
	over: Record<string, unknown> = {},
	setup: Setup = {},
) => {
	const h = harness(on, setup);
	const outcome: Outcome = await $.tool.call(agentCall(over));
	return { h, outcome };
};
