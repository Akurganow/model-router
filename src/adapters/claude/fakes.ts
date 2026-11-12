import { jevAnswer } from "../../core/jev-fakes.ts";
import type { Engine, HttpReply } from "./host.ts";
import { register } from "./index.ts";

type Hook = ($: unknown, e: unknown, next: unknown) => Promise<unknown>;

export const AGENT_CALL = "agent.spawn";
export const SPAWN = {
	tool_use_id: "toolu_1",
	prompt: "p",
	description: "d",
	subagentType: "general-purpose",
	fork: false,
};
export const CLOCK = {
	after: () => ({ cancel() {} }),
	sleep: () => new Promise(() => {}),
};

export const flush = async () => {
	for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

/**
 * The continuation under a hook. Its origin names the plugin that started the call, and "engine" is the Agent tool itself.
 */
export const nextHook = (plugin = "engine") =>
	Object.assign(async () => ({}), {
		signal: new AbortController().signal,
		origin: { plugin },
	});

/**
 * Registers the mod against a hook collector and returns its hooks by event name.
 * A hook with a matcher is keyed by the event, a space and the matcher as JSON.
 */
export function registered(
	options: Record<string, unknown> = {},
): Record<string, Hook> {
	const hooks: Record<string, Hook> = {};
	const on = (event: string, ...rest: unknown[]) => {
		const matcher = rest.length > 1 ? ` ${JSON.stringify(rest[0])}` : "";
		hooks[`${event}${matcher}`] = rest.at(-1) as Hook;
		return { catch: () => undefined };
	};
	register(on as never, options);
	return hooks;
}

const SCORE = (p: number[]) => ({ type: "score", probabilities: { ...p } });
export const ANSWER = JSON.stringify({
	model: "jev-1.14.0",
	answers: { tier: SCORE([0.9, 0.1, 0]), work: SCORE([0.2, 0.6, 0.2]) },
});

type Offer = { agent: string; source: string; description?: string };
export const BUILT_IN_DEFAULT: Offer = {
	agent: "general-purpose",
	source: "built-in",
};

export type Call = {
	options?: Record<string, unknown>;
	env?: Record<string, string>;
	offers?: readonly Offer[];
	subagentType?: string;
	/** The one-line description of the Agent call. Defaults to the one of SPAWN. */
	description?: string;
	/** The task text of the spawn. Defaults to the one of SPAWN. */
	prompt?: string;
	/** The reply to each Jev request, by URL. Defaults to ANSWER with status 200. */
	reply?: (url: string) => HttpReply;
	/** Sends a caller effort with the Agent call. */
	callerEffort?: boolean;
};

/**
 * Registers the mod, makes the offers, then spawns `subagentType` as the engine does.
 * Returns the env names read, the requests Jev received with the role and description each carried,
 * their parsed bodies, the lines logged to the default log, the spawn the engine received
 * and the effort the subagent's first model request carries.
 */
export async function routedCall({
	options = {},
	env = {},
	offers = [BUILT_IN_DEFAULT],
	subagentType = "general-purpose",
	description = SPAWN.description,
	prompt = SPAWN.prompt,
	reply,
	callerEffort,
}: Call) {
	const reads: string[] = [];
	const requests: { url: string; model: unknown }[] = [];
	const bodies: unknown[] = [];
	const roles: unknown[] = [];
	const descriptions: unknown[] = [];
	const logs: string[] = [];
	const $ = {
		clock: CLOCK,
		env: {
			get: async (name: string) => {
				reads.push(name);
				return env[name];
			},
		},
		http: {
			fetch: async (url: string, init: { body: string }) => {
				const body = JSON.parse(init.body);
				requests.push({ url, model: body.model });
				bodies.push(body);
				roles.push(body.state.role);
				descriptions.push(body.state.description);
				return (
					reply?.(url) ?? { status: 200, ok: true, headers: {}, text: ANSWER }
				);
			},
		},
		tool: { check: async () => ({ decision: "allow" }) },
		ui: {
			// The request bodies go to the debug log; the decision line goes to the default one.
			log: async (text: string, to?: { to: string }) => {
				if (to === undefined) logs.push(text);
			},
		},
	};
	const next = nextHook();
	const hooks = registered(options);
	for (const offer of offers) await hooks["agent.offer"]?.($, offer, next);
	if (callerEffort)
		await hooks['tool.call {"tool":"Agent"}']?.(
			$,
			{ tool: "Agent", tool_use_id: SPAWN.tool_use_id, effort: "low" },
			next,
		);
	const received: unknown[] = [];
	const engine = Object.assign(
		async (spawn: unknown) => {
			received.push(spawn);
			return { agentId: "agent-1" };
		},
		{ signal: next.signal, origin: next.origin },
	);
	await hooks[AGENT_CALL]?.(
		$,
		{ ...SPAWN, subagentType, description, prompt },
		engine,
	);
	const steps: { effort?: string }[] = [];
	const step = hooks["turn.step"] as unknown as (
		...args: unknown[]
	) => AsyncIterable<unknown>;
	// biome-ignore lint/correctness/useYield: the bottom of the chain streams no chunks
	const bottom = async function* (e: { effort?: string }) {
		steps.push(e);
		return {};
	};
	for await (const _ of step($, { agentId: "agent-1", effort: "max" }, bottom));
	return {
		reads,
		requests,
		bodies,
		roles,
		descriptions,
		logs,
		spawned: received[0] as { model?: string } | undefined,
		requestEffort: steps[0]?.effort,
	};
}

export type Answers = {
	tier?: number;
	work?: number;
	model?: string;
	usage?: object;
};

/**
 * Returns the fake Jev reply with status 200. Its body holds a tier answer when
 * tier is given, a work answer when work is given, and the model and usage as
 * passed.
 */
export const answer = ({ tier, work, model, usage }: Answers): HttpReply => {
	const { answers } = jevAnswer(tier ?? 0, work);
	return {
		status: 200,
		ok: true,
		headers: {},
		text: JSON.stringify({
			model,
			usage,
			answers: tier === undefined ? { work: answers.work } : answers,
		}),
	};
};

const TOKENS = { input_tokens: 812, output_tokens: 9 };
export const FULL = { model: "jev-1.14.0", usage: TOKENS };
export const FULL_SUFFIX = " · jev jev-1.14.0 · 812/9 tok";

export const routed = (answers: Answers, run: Omit<Call, "reply"> = {}) =>
	routedCall({
		...run,
		options: { api_key: "ts-key", ...run.options },
		reply: () => answer(answers),
	});

// An engine whose dialogs stay open until a test answers them. Each step is logged as it starts.
export function dialogs() {
	const log: string[] = [];
	const open: {
		resolve: (answer: string) => void;
		reject: (reason: Error) => void;
	}[] = [];
	const $ = {
		tool: {
			check: async () => {
				log.push("check");
				return { decision: "allow" };
			},
		},
		ui: {
			ask: () => {
				log.push("ask");
				return new Promise<string>((resolve, reject) => {
					open.push({ resolve, reject });
				});
			},
		},
		config: { set: async () => ({}) },
	} as unknown as Engine;
	return { $, log, open };
}

type Step = string | { ask: unknown } | { set: unknown };

// An engine that answers each dialog with `answer` and logs every host call in order.
export function answeringEngine(
	answer: () => Promise<string>,
	set: () => Promise<{ deny?: string }> = async () => ({}),
) {
	const log: Step[] = [];
	const $ = {
		tool: {
			check: async () => {
				log.push("check");
				return { decision: "allow" };
			},
		},
		ui: {
			ask: async (question: string, opts: unknown) => {
				log.push({ ask: [question, opts] });
				return answer();
			},
		},
		config: {
			set: async (row: unknown) => {
				log.push({ set: row });
				return set();
			},
		},
	} as unknown as Engine;
	return { $, log };
}

// An engine that records each variable read and answers it with `answer`.
export const recordingEngine = (answer: (name: string) => unknown) => {
	const reads: string[] = [];
	const engine = {
		tool: { check: async () => ({ decision: "allow" }) },
		env: {
			get: async (name: string) => {
				reads.push(name);
				return answer(name);
			},
		},
	} as unknown as Engine;
	return { engine, reads };
};
