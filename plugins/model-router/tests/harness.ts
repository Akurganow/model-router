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
type Reply = {
	status?: number;
	headers?: Record<string, string>;
	text?: string;
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
	calls: number;
	request: Request;
	received: Loose;
	seen: Loose[];
	checks: Loose[];
	sent: string | undefined;
	auth: string | undefined;
};
export const KEYED = { options: { api_key: "test-key" } };

type Setup = {
	text?: string | ((body: string) => string);
	status?: number;
	replies?: readonly Reply[];
	offline?: boolean;
	offers?: Readonly<Record<string, string>>;
	decision?: ToolCheckDecision | "throw";
	delayMs?: number;
	env?: Readonly<Record<string, string>>;
	result?: { result: string } | { deny: string };
};

const newHarness = (clock: MockClock): Harness => ({
	clock,
	logs: [],
	debug: [],
	fetched: 0,
	calls: 0,
	request: {},
	received: {},
	seen: [],
	checks: [],
	sent: undefined,
	auth: undefined,
});

const logHandler =
	(h: Harness) => (_: unknown, e: { text: string; to?: string }) => {
		(e.to === "debug" ? h.debug : h.logs).push(e.text);
		return { value: undefined };
	};

const fetchHandler =
	(h: Harness, setup: Setup) => async (_: unknown, e: Request) => {
		const {
			text = ANSWER([0.9, 0.1, 0]),
			status = 200,
			replies = [],
			offline = false,
			delayMs = 0,
		} = setup;
		h.fetched += 1;
		h.request = e;
		const sent = e.init?.body ?? "";
		h.sent = sent;
		const { Authorization } = e.init?.headers ?? {};
		h.auth = Authorization;
		if (delayMs > 0) await h.clock.sleep(delayMs);
		if (offline) return { deny: "offline" };
		const reply = replies[Math.min(h.fetched, replies.length) - 1] ?? {};
		const code = reply.status ?? status;
		const body = reply.text ?? (typeof text === "function" ? text(sent) : text);
		return {
			value: {
				status: code,
				ok: code < 300,
				headers: reply.headers ?? {},
				text: body,
			},
		};
	};

const checkHandler =
	(h: Harness, decision: ToolCheckDecision | "throw") =>
	(_: unknown, e: Loose) => {
		h.checks.push(e);
		if (decision === "throw") throw new Error("boom");
		return { decision };
	};

const callHandler =
	(h: Harness, result: NonNullable<Setup["result"]>) =>
	(_: unknown, e: Loose) => {
		h.calls += 1;
		h.received = e;
		h.seen.push(e);
		return result;
	};

export const harness = (on: On, setup: Setup = {}): Harness => {
	const { decision = "allow", env = {}, result = { result: "ok" } } = setup;
	mock.env(on, env);
	const h = newHarness(mock.clock(on));
	on("ui.log", logHandler(h));
	on("http.fetch", fetchHandler(h, setup));
	on("agent.offer", () => ({ isOffered: true }));
	on("tool.check", checkHandler(h, decision));
	on("tool.call", callHandler(h, result));
	return h;
};

const BUILT_IN = "built-in";
// The agents Claude Code ships, as it offers them.
const BUILT_IN_OFFERS: Readonly<Record<string, string>> = {
	"general-purpose": BUILT_IN,
	claude: BUILT_IN,
	Explore: BUILT_IN,
	Plan: BUILT_IN,
	"statusline-setup": BUILT_IN,
	"claude-code-guide": BUILT_IN,
};

export const offer = ($: Engine, agent: string, source = BUILT_IN) =>
	$.agent.offer({
		agent,
		description: "",
		source,
		provider: { plugin: "engine", tier: "core" },
	});

export const offerAll = async ($: Engine, offers = BUILT_IN_OFFERS) => {
	for (const [agent, source] of Object.entries(offers))
		await offer($, agent, source);
};

export const callOnce = async (
	$: Engine,
	on: On,
	over: Record<string, unknown> = {},
	setup: Setup = {},
) => {
	const h = harness(on, setup);
	await offerAll($, setup.offers);
	const outcome: Outcome = await $.tool.call(agentCall(over));
	return { h, outcome };
};

// Runs a call to the end of the SDK's retries: three fetches inside 1500 ms.
export const retried = async ($: Engine, on: On, setup: Setup) => {
	const h = harness(on, setup);
	await offerAll($);
	const pending = $.tool.call(agentCall());
	await h.clock.advance(1500);
	await pending;
	return h;
};
