import type { Fetch } from "@typesafe-ai/sdk";
import { prepareBrief } from "./brief.ts";
import {
	type Decision,
	decisionSuffix,
	LIMIT_REACHED,
	ROUTING_LIMIT_MS,
	type RouteInput,
	route,
	type Skipped,
} from "./compose.ts";
import { work } from "./effort.ts";
import { tier } from "./model.ts";
import { formatProbability, type Level } from "./part.ts";
import { order, PROVIDER_VALUES, type Provider, plan } from "./provider.ts";
import { installTimers } from "./timers.ts";

// The mods API and hook types this adapter uses. The bundle must not depend on the generated declarations.
type Timer = { cancel(): void };
type HttpInit = {
	method?: string | undefined;
	headers?: Record<string, string> | undefined;
	body?: string | undefined;
};
type HttpReply = {
	status: number;
	ok: boolean;
	headers: Record<string, string>;
	text: string;
};
type Engine = {
	clock: {
		after(ms: number, fn: () => void): Timer;
		sleep(ms: number, options: { signal: AbortSignal }): Promise<void>;
	};
	env: { get(name: string): Promise<string | undefined> };
	config: {
		set(row: { key: string; value: string }): Promise<{ deny?: string }>;
	};
	http: { fetch(url: string, init?: HttpInit): Promise<HttpReply> };
	tool: {
		check(call: {
			tool: string;
			input: Record<string, unknown>;
		}): Promise<{ decision: string }>;
	};
	ui: { log(text: string, options?: { to: "debug" }): Promise<unknown> };
};
type Outcome = { readonly deny?: string };
type Next = {
	(e: unknown): Promise<Outcome>;
	readonly signal: AbortSignal;
};
type Hook<E, R = Outcome> = ($: Engine, e: E, next: Next) => Promise<R>;
type CommandRun = { command: string; args: string };
type CommandOutput = { text: string };
type AgentOffer = { agent: string; source: string };
type AgentCall = {
	tool: "Agent";
	tool_use_id?: string;
	agentId?: string;
	requestMeta?: unknown;
	prompt: string;
	description: string;
	subagent_type?: string;
	name?: string;
	model?: string;
	effort?: string;
};
type On = {
	(
		event: "agent.offer",
		hook: Hook<AgentOffer>,
	): { catch(handler: Hook<unknown>): unknown };
	(
		event: "tool.call",
		matcher: { tool: "Agent" },
		hook: Hook<AgentCall>,
	): { catch(handler: Hook<unknown>): unknown };
	(
		event: "command.run",
		matcher: { command: string },
		hook: Hook<CommandRun, CommandOutput>,
	): { catch(handler: Hook<unknown>): unknown };
};
type Options = {
	readonly api_key?: unknown;
	readonly openrouter_api_key?: unknown;
	readonly provider?: unknown;
};
type Keys = Partial<Record<Provider, string>>;

const MODELS = ["haiku", "sonnet", "opus"] as const;
// Effort is calibrated per model. Haiku's row sits one step higher: at low it stops early on agentic prompts.
const EFFORT_LADDER = {
	haiku: ["medium", "high", "xhigh"],
	sonnet: ["low", "medium", "high"],
	opus: ["low", "medium", "high"],
} as const;

const PROVIDER_ROW = "model-router.provider";

const BUILT_IN = "built-in";
const DEFAULT_AGENT = "general-purpose";
// Forks inherit their parent's model and the other built-ins are fixed-purpose, so only these four are scored.
const ROUTED_AGENTS: ReadonlySet<string> = new Set([
	DEFAULT_AGENT,
	"claude",
	"Explore",
	"Plan",
]);
// The debug log keeps 10000 characters of a line, and a body can carry 12000 of task text.
const DEBUG_PIECE_CHARS = 9000;

// The sensitive option comes first. The desktop app reads it back empty after a restart, so the variable stands in.
const KEY_OPTIONS: Readonly<Record<Provider, keyof Options>> = {
	typesafe: "api_key",
	openrouter: "openrouter_api_key",
};

// The latest source of each offered agent name. A user or plugin agent can take a built-in's name.
const offered = new Map<string, string>();

export function register(on: On, options: Options): void {
	offered.clear();
	on("agent.offer", (_, e, next) => {
		offered.set(e.agent, e.source);
		return next(e);
	}).catch(passOn);
	on("tool.call", { tool: "Agent" }, ($, e, next) =>
		routeAgentCall($, e, next, options),
	).catch(passOn);
	// The surface check reads the matcher, so the command name stays a literal here.
	on("command.run", { command: "model-router:provider" }, ($, e) =>
		providerCommand($, e.args.trim(), options.provider),
	);
}

const describeProvider = (value: unknown) =>
	`provider: ${value} (${order(value).join(", then ")})`;

// The hook answers in the command's place, so the command's markdown body runs only when the hook is missing.
async function providerCommand(
	$: Engine,
	args: string,
	current: unknown,
): Promise<CommandOutput> {
	if (args === "") return { text: describeProvider(current) };
	if (!PROVIDER_VALUES.some((value) => value === args))
		return { text: `provider: use one of ${PROVIDER_VALUES.join(", ")}` };
	try {
		const { deny } = await $.config.set({ key: PROVIDER_ROW, value: args });
		return {
			text:
				deny === undefined
					? describeProvider(args)
					: `provider unchanged: ${deny}`,
		};
	} catch (err) {
		return {
			text: `provider unchanged: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

function passOn(_: Engine, e: unknown, next: Next): Promise<Outcome> {
	return next(e);
}

function useClockTimers($: Engine): void {
	installTimers((ms, fn) => $.clock.after(ms, fn));
}

const nonEmpty = (v: unknown): string | undefined =>
	typeof v === "string" && v !== "" ? v : undefined;

function routable(call: AgentCall): boolean {
	const agent = call.subagent_type ?? DEFAULT_AGENT;
	return (
		call.name === undefined &&
		call.model === undefined &&
		ROUTED_AGENTS.has(agent) &&
		offered.get(agent) === BUILT_IN
	);
}

// A call the user's rules deny as Claude made it never leaves the machine. The check opens no dialog.
async function denied($: Engine, call: AgentCall): Promise<boolean> {
	const {
		tool: _tool,
		tool_use_id: _id,
		agentId: _agentId,
		requestMeta: _meta,
		...input
	} = call;
	return (await $.tool.check({ tool: "Agent", input })).decision === "deny";
}

async function routeAgentCall(
	$: Engine,
	call: AgentCall,
	next: Next,
	options: Options,
): Promise<Outcome> {
	useClockTimers($);
	if (!routable(call) || (await denied($, call))) return next(call);
	const state = {
		role: call.subagent_type ?? DEFAULT_AGENT,
		description: call.description,
		task: prepareBrief(call.prompt),
	};
	const keys = await readKeys($, options);
	const decision = await scored($, next.signal, {
		state,
		attempts: plan(options.provider, {
			typesafe: keys.typesafe !== undefined,
			openrouter: keys.openrouter !== undefined,
		}),
		keys,
	});
	const picked = pick(decision);
	if ("skipped" in picked) {
		await $.ui.log(`skipped, ${picked.skipped}`);
		return next(call);
	}
	const keepEffort = call.effort !== undefined;
	await $.ui.log(decisionLine(picked, keepEffort));
	const { model, effort } = picked;
	const outcome = await next(
		keepEffort ? { ...call, model } : { ...call, model, effort },
	);
	if (outcome.deny !== undefined) await $.ui.log("denied");
	return outcome;
}

// Each key goes only to its own provider. The key of a provider the value leaves out is never read.
async function readKeys($: Engine, options: Options): Promise<Keys> {
	const keys: Keys = {};
	for (const provider of order(options.provider)) {
		const key =
			nonEmpty(options[KEY_OPTIONS[provider]]) ??
			nonEmpty(await keyVariable($, provider));
		if (key !== undefined) keys[provider] = key;
	}
	return keys;
}

// plugin validate lists the variables a module reads, so each $.env.get names its variable literally.
function keyVariable($: Engine, provider: Provider): Promise<unknown> {
	return provider === "typesafe"
		? $.env.get("TYPESAFE_API_KEY")
		: $.env.get("OPENROUTER_API_KEY");
}

type Picked = {
	model: (typeof MODELS)[number];
	effort: string;
	level: Level;
	probabilities: string;
	suffix: string;
};

function pick(decision: Decision | Skipped): Picked | Skipped {
	if ("skipped" in decision) return decision;
	const tiered = decision.parts[tier.key];
	const worked = decision.parts[work.key];
	if (!tiered || !worked) return { skipped: "bad reply" };
	const model = MODELS[tiered.level];
	return {
		model,
		effort: EFFORT_LADDER[model][worked.level],
		level: tiered.level,
		probabilities: `${formatProbability(tiered.probabilities[tiered.level])}/${formatProbability(worked.probabilities[worked.level])}`,
		suffix: decisionSuffix(decision),
	};
}

function decisionLine(picked: Picked, keepEffort: boolean): string {
	const effort = keepEffort ? "caller effort" : picked.effort;
	return `L${picked.level} ${picked.model} · ${effort} · p=${picked.probabilities}${picked.suffix}`;
}

// The limit covers the whole call, retries included. Aborting also ends the retry wait, so no request follows a skip.
async function scored(
	$: Engine,
	cancel: AbortSignal,
	input: Pick<RouteInput, "state" | "attempts" | "keys">,
) {
	const stop = new AbortController();
	$.clock.sleep(ROUTING_LIMIT_MS, { signal: stop.signal }).then(
		() => stop.abort(LIMIT_REACHED),
		() => undefined,
	);
	try {
		return await route({
			...input,
			parts: [tier, work],
			fetchFn: engineFetch($),
			signal: AbortSignal.any([stop.signal, cancel]),
		});
	} finally {
		stop.abort();
	}
}

// $.http.fetch takes no signal, so the call races the abort. The request itself runs to its end.
function engineFetch($: Engine): Fetch {
	return (url, init) => {
		const body = String(init?.body ?? "");
		return abortable(async () => {
			await logRequest($, body);
			const reply = await $.http.fetch(url, {
				method: init?.method,
				headers: init?.headers as Record<string, string>,
				body,
			});
			return toResponse(reply);
		}, init?.signal);
	};
}

function abortable<T>(
	start: () => Promise<T>,
	signal: AbortSignal | null | undefined,
): Promise<T> {
	if (!signal) return start();
	return new Promise((resolve, reject) => {
		if (signal.aborted) return reject(signal.reason);
		const onAbort = () => reject(signal.reason);
		signal.addEventListener("abort", onAbort, { once: true });
		start()
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", onAbort));
	});
}

// Only the body goes to the log. Headers carry the key.
async function logRequest($: Engine, body: string): Promise<void> {
	const pieces = Math.ceil(body.length / DEBUG_PIECE_CHARS);
	for (let i = 0; i < pieces; i++)
		await $.ui.log(
			`request ${i + 1}/${pieces} ${body.slice(i * DEBUG_PIECE_CHARS, (i + 1) * DEBUG_PIECE_CHARS)}`,
			{ to: "debug" },
		);
}

// The mod runtime has no Response, so the SDK gets the parts of one it reads.
function toResponse({ status, ok, headers, text }: HttpReply): Response {
	const header = (name: string) => headers[name.toLowerCase()];
	return {
		status,
		ok,
		body: null,
		headers: {
			get: (name: string) => header(name) ?? null,
			has: (name: string) => header(name) !== undefined,
		},
		text: async () => text,
		clone() {
			return this;
		},
	} as unknown as Response;
}
