import type {
	ConfigSetInput,
	ConfigSetResult,
	On,
	PromptOrigin,
	ToolCallArgs,
	ToolCheckDecision,
} from "claude-code";
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
type Registered = {
	name: string;
	description: string;
	inputSchema: unknown;
};
type Outcome = { result?: unknown; deny?: unknown };
type Harness = {
	clock: MockClock;
	logs: string[];
	debug: string[];
	fetched: number;
	calls: number;
	requests: Request[];
	request: Request;
	received: Loose;
	seen: Loose[];
	checks: Loose[];
	registered: Registered[];
	asked: Asked[];
	sent: string | undefined;
	auth: string | undefined;
	envReads: string[];
};
export const KEYED = { options: { api_key: "test-key" } };

type Setup = {
	text?: string | ((body: string) => string);
	status?: number;
	replies?: readonly Reply[];
	offline?: boolean;
	offers?: Readonly<Record<string, string>>;
	descriptions?: Readonly<Record<string, string>>;
	decision?: ToolCheckDecision | "throw";
	delayMs?: number;
	env?: Readonly<Record<string, string>>;
	result?: { result: string } | { deny: string };
	// Answers the plugin's dialog with the text the person gave, or undefined for a dismissal.
	// It gets the labels and may wait on the test's clock.
	dialog?: (
		labels: string[],
	) => string | undefined | Promise<string | undefined>;
};
type Asked = { question: string; header: string; labels: string[] };

const newHarness = (clock: MockClock): Harness => ({
	clock,
	logs: [],
	debug: [],
	fetched: 0,
	calls: 0,
	requests: [],
	request: {},
	received: {},
	seen: [],
	checks: [],
	registered: [],
	asked: [],
	sent: undefined,
	auth: undefined,
	envReads: [],
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
		h.requests.push(e);
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

// Records each variable read, so a test can show a variable was never read.
const envHandler =
	(h: Harness, env: Readonly<Record<string, string>>) =>
	(_: unknown, e: { name: string }) => {
		h.envReads.push(e.name);
		return { value: env[e.name] };
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

// A hook the test registers first answers first, so the dialog goes in ahead of the catch-all.
const dialogHandler =
	(h: Harness, reply: NonNullable<Setup["dialog"]>) =>
	async (_: unknown, e: { questions: unknown }) => {
		const [{ question, header, options }] = e.questions as unknown as [
			{ question: string; header: string; options: { label: string }[] },
		];
		const labels = options.map((option) => option.label);
		h.asked.push({ question, header, labels });
		const answer = await reply(labels);
		return answer === undefined
			? { deny: "dismissed" }
			: { result: { questions: e.questions, answers: { [question]: answer } } };
	};

const registerHandler = (h: Harness) => (_: unknown, e: Registered) => {
	h.registered.push(e);
	return { value: { tool: `mcp__model-router__${e.name}` } };
};

export const harness = (on: On, setup: Setup = {}): Harness => {
	const { decision = "allow", env = {}, result = { result: "ok" } } = setup;
	const h = newHarness(mock.clock(on));
	if (setup.dialog)
		on(
			"tool.call",
			{ tool: "AskUserQuestion" },
			dialogHandler(h, setup.dialog),
		);
	on("env.get", envHandler(h, env));
	on("ui.log", logHandler(h));
	on("http.fetch", fetchHandler(h, setup));
	on("agent.offer", () => ({ isOffered: true }));
	on("tool.check", checkHandler(h, decision));
	on("tool.register", registerHandler(h));
	on("session.start", (_, e) => ({ cwd: e.cwd }));
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

// Short texts in the style of the descriptions Claude Code gives its built-in agents.
const BUILT_IN_DESCRIPTIONS: Readonly<Record<string, string>> = {
	"general-purpose":
		"General-purpose agent for researching complex questions and executing multi-step tasks.",
	claude: "Catch-all agent for any task that fits no more specific agent.",
	Explore:
		"Read-only search agent for broad fan-out searches across a codebase.",
	Plan: "Software architect agent for designing implementation plans.",
	"statusline-setup": "Configures the user's Claude Code status line setting.",
	"claude-code-guide": "Answers questions about Claude Code and its SDK.",
};

export const offer = (
	$: Engine,
	agent: string,
	source = BUILT_IN,
	description = "",
) =>
	$.agent.offer({
		agent,
		description,
		source,
		provider: { plugin: "engine", tier: "core" },
	});

export const offerAll = async (
	$: Engine,
	offers = BUILT_IN_OFFERS,
	descriptions = BUILT_IN_DESCRIPTIONS,
) => {
	for (const [agent, source] of Object.entries(offers))
		await offer($, agent, source, descriptions[agent]);
};

export const callOnce = async (
	$: Engine,
	on: On,
	over: Record<string, unknown> = {},
	setup: Setup = {},
) => {
	const h = harness(on, setup);
	await offerAll($, setup.offers, setup.descriptions);
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

export const CONFIG_TOOL = "mcp__model-router__config";

export const sessionStart = ($: Engine) =>
	$.session.start({ cwd: "/", surface: null, isInteractive: true });

// Calls the config tool as the model does, with the setting it names or none.
export const configTool = async ($: Engine, setting?: unknown) => {
	const outcome: Outcome = await $.tool.call({
		tool: CONFIG_TOOL,
		...(setting === undefined ? {} : { setting }),
	} as unknown as ToolCallArgs);
	return outcome;
};

// Answers $.config.set beneath the plugin and records what it was asked to write.
export const config = (
	on: On,
	answer: (e: ConfigSetInput) => ConfigSetResult,
) => {
	const writes: ConfigSetInput[] = [];
	on("config.set", (_, e) => {
		writes.push(e);
		return answer(e);
	});
	return writes;
};

// Runs a command as the person types it at the prompt, or from the origin given.
export const runCommand = async (
	$: Engine,
	command: string,
	args = "",
	origin: PromptOrigin = { kind: "composer" },
) =>
	(
		await $.command.run({
			command,
			args,
			origin,
			presentation: { isFullscreen: false, columns: 80 },
		})
	).text;
