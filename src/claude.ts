import type { Fetch } from "@typesafe-ai/sdk";
import { prepareBrief, roleText } from "./brief.ts";
import {
	configCall,
	configCommand,
	registerConfigTool,
	resetConfig,
} from "./claude-config.ts";
import {
	type AgentCall,
	denied,
	type Engine,
	type HttpReply,
	type Next,
	type On,
	type Options,
	type Outcome,
	passOn,
} from "./claude-host.ts";
import { readKeys } from "./claude-keys.ts";
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
import { plan } from "./provider.ts";
import { resolveScope, type Scope } from "./scope.ts";
import { installTimers } from "./timers.ts";

const MODELS = ["haiku", "sonnet", "opus"] as const;
// Effort is calibrated per model. Haiku's row sits one step higher: at low it stops early on agentic prompts.
const EFFORT_LADDER = {
	haiku: ["medium", "high", "xhigh"],
	sonnet: ["low", "medium", "high"],
	opus: ["low", "medium", "high"],
} as const;

const BUILT_IN = "built-in";
const DEFAULT_AGENT = "general-purpose";
const FORK = "fork";
// Forks inherit their parent's model and the other built-ins are fixed-purpose, so only these four are scored.
const ROUTED_AGENTS: ReadonlySet<string> = new Set([
	DEFAULT_AGENT,
	"claude",
	"Explore",
	"Plan",
]);
// The debug log keeps 10000 characters of a line, and a body can carry 12000 of task text.
const DEBUG_PIECE_CHARS = 9000;

// The latest offer of each agent name. A user or plugin agent can take a built-in's name.
const offered = new Map<string, { source: string; description: string }>();

export function register(on: On, options: Options): void {
	offered.clear();
	on("agent.offer", (_, e, next) => {
		offered.set(e.agent, { source: e.source, description: e.description });
		return next(e);
	}).catch(passOn);
	on("tool.call", { tool: "Agent" }, ($, e, next) =>
		routeAgentCall($, e, next, options),
	).catch(passOn);
	resetConfig();
	on("session.start", registerConfigTool).catch(passOn);
	// The surface check reads the matchers, so the tool and command names stay literals here.
	on("tool.call", { tool: "mcp__model-router__config" }, ($, e) =>
		configCall($, e, options),
	);
	on("command.run", { command: "model-router:provider" }, ($, e) =>
		configCommand($, e, "provider", options),
	);
	on("command.run", { command: "model-router:scope" }, ($, e) =>
		configCommand($, e, "scope", options),
	);
}

function useClockTimers($: Engine): void {
	installTimers((ms, fn) => $.clock.after(ms, fn));
}

// Extended scope never reads the offers: any agent without a model of its own is routed, a fork excepted.
function routable(call: AgentCall, scope: Scope): boolean {
	const agent = call.subagent_type ?? DEFAULT_AGENT;
	if (call.name !== undefined || call.model !== undefined) return false;
	if (scope === "extended") return agent !== FORK;
	return ROUTED_AGENTS.has(agent) && offered.get(agent)?.source === BUILT_IN;
}

async function routeAgentCall(
	$: Engine,
	call: AgentCall,
	next: Next,
	options: Options,
): Promise<Outcome> {
	useClockTimers($);
	if (!routable(call, resolveScope(options.scope)) || (await denied($, call)))
		return next(call);
	const state = {
		role: roleText(
			offered.get(call.subagent_type ?? DEFAULT_AGENT)?.description,
		),
		description: call.description,
		task: prepareBrief(call.prompt),
	};
	const keys = await readKeys($, options, options.provider);
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
