import type { Fetch } from "@typesafe-ai/sdk";
import {
	DEFAULT_ROLE,
	descriptionText,
	prepareBrief,
	roleText,
} from "./brief.ts";
import {
	configCall,
	configCommand,
	registerConfigTool,
	resetConfig,
} from "./claude-config.ts";
import {
	type AgentCall,
	type AgentSpawn,
	EFFORTS_MAX,
	type Engine,
	type HttpReply,
	type Next,
	type On,
	type Options,
	type Outcome,
	passOn,
	passStep,
	type Started,
	type StepNext,
	type StepStream,
	type TurnStep,
} from "./claude-host.ts";
import { readKeys } from "./claude-keys.ts";
import {
	type Decision,
	LIMIT_REACHED,
	ROUTING_LIMIT_MS,
	type RouteInput,
	route,
	type Skipped,
} from "./compose.ts";
import { decide } from "./decide.ts";
import { work } from "./effort.ts";
import { effortFor } from "./ladder.ts";
import { routedLine, skippedLine } from "./line.ts";
import { tier } from "./model.ts";
import type { Level } from "./part.ts";
import { plan } from "./provider.ts";
import { CALLER_EFFORT } from "./reasons.ts";
import { resolveScope, type Scope } from "./scope.ts";
import { installTimers } from "./timers.ts";

const MODELS = ["haiku", "sonnet", "opus"] as const;

const BUILT_IN = "built-in";
// The origin of a spawn the Agent tool makes. Another plugin's $.agent.spawn carries its own name.
const ENGINE = "engine";
const GENERAL_PURPOSE = "general-purpose";
const CLAUDE_AGENT = "claude";
const FORK = "fork";
const DEFAULT_ROLE_AGENTS: ReadonlySet<string> = new Set([
	GENERAL_PURPOSE,
	CLAUDE_AGENT,
]);
// Forks inherit their parent's model and the other built-ins are fixed-purpose, so only these four are scored.
const ROUTED_AGENTS: ReadonlySet<string> = new Set([
	...DEFAULT_ROLE_AGENTS,
	"Explore",
	"Plan",
]);
// The debug log keeps 10000 characters of a line, and a body can carry 12000 of task text.
const DEBUG_PIECE_CHARS = 9000;

// The latest offer of each agent name. A user or plugin agent can take a built-in's name.
const offered = new Map<string, { source: string; description: string }>();
// Agent calls whose caller set an effort, by tool_use_id. The spawn input carries no effort.
const callerEffort = new Set<string>();
// The effort routed for each started subagent, applied to its model requests.
// A message resumes a finished subagent under its id, so the entry outlives its run, up to EFFORTS_MAX entries.
const efforts = new Map<string, string>();
// Spawns that have not named their agent yet: a subagent's first request can come before its spawn settles.
const starting = new Set<Promise<unknown>>();
// Agents whose steps already waited for the spawns in flight. Only an agent's first step can beat its spawn.
const waited = new Set<string>();
// A step from an agent no routed spawn names waits this long for the spawns in flight, then goes on.
const STEP_WAIT_MS = 1000;

export function register(on: On, options: Options): void {
	offered.clear();
	callerEffort.clear();
	efforts.clear();
	starting.clear();
	waited.clear();
	on("agent.offer", (_, e, next) => {
		offered.set(e.agent, { source: e.source, description: e.description });
		return next(e);
	}).catch(passOn);
	on("tool.call", { tool: "Agent" }, noteCallerEffort).catch(passOn);
	on("agent.spawn", ($, e, next) => routeSpawn($, e, next, options)).catch(
		passOn,
	);
	on("turn.step", stepEffort).catch(passStep);
	on("turn.complete", (_, e, next) => {
		if (e.agentId !== undefined) waited.delete(e.agentId);
		return next(e);
	}).catch(passOn);
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

// The entry waits for this call's spawn, which deletes it. A call that ends in error or throws never spawns.
async function noteCallerEffort(
	_: Engine,
	e: AgentCall,
	next: Next,
): Promise<Outcome> {
	const id = e.tool_use_id;
	if (id !== undefined && e.effort !== undefined) callerEffort.add(id);
	try {
		const outcome = await next(e);
		if (id !== undefined && (outcome.deny !== undefined || outcome.isError))
			callerEffort.delete(id);
		return outcome;
	} catch (error) {
		if (id !== undefined) callerEffort.delete(id);
		throw error;
	}
}

function useClockTimers($: Engine): void {
	installTimers((ms, fn) => $.clock.after(ms, fn));
}

// Extended scope never reads the offers: any agent without a model of its own is routed, a fork excepted.
function routable(spawn: AgentSpawn, scope: Scope): boolean {
	const agent = spawn.subagentType;
	if (spawn.name !== undefined || spawn.model !== undefined) return false;
	if (spawn.fork || spawn.isTeammate || spawn.resume || spawn.workflow)
		return false;
	if (scope === "extended") return agent !== FORK;
	return ROUTED_AGENTS.has(agent) && offered.get(agent)?.source === BUILT_IN;
}

/**
 * Only Claude Code's own default agents send the fixed role. An agent a user defines under the same name sends its own description.
 */
function roleFor(agent: string): string {
	const offer = offered.get(agent);
	// The mod registers after Claude Code's offers, so an agent with no offer is the built-in.
	const own = offer === undefined || offer.source === BUILT_IN;
	return DEFAULT_ROLE_AGENTS.has(agent) && own
		? DEFAULT_ROLE
		: roleText(offer?.description);
}

/**
 * The spawn runs after the permission decision and changes only the model, so the Agent call the server reviewed stays as written.
 */
async function routeSpawn(
	$: Engine,
	spawn: AgentSpawn,
	next: Next<Started>,
	options: Options,
): Promise<Started> {
	useClockTimers($);
	const callerSet = callerEffort.delete(spawn.tool_use_id);
	if (
		next.origin.plugin !== ENGINE ||
		!routable(spawn, resolveScope(options.scope))
	)
		return next(spawn);
	const state = {
		role: roleFor(spawn.subagentType),
		description: descriptionText(spawn.description),
		task: prepareBrief(spawn.prompt),
	};
	const keys = await readKeys($, options, options.provider);
	const decision = await scored($, next.signal, {
		state,
		attempts: plan(options.provider, keys),
		keys,
	});
	const picked = pick(decision);
	if ("skipped" in picked) {
		await $.ui.log(skippedLine(picked.skipped));
		return next(spawn);
	}
	// Claude Code ranks this variable above any per-invocation effort, so a set value keeps the engine's effort.
	const kept = callerSet
		? CALLER_EFFORT
		: (await $.env.get("CLAUDE_CODE_EFFORT_LEVEL"))
			? "env effort"
			: undefined;
	await $.ui.log(decisionLine(picked, kept));
	const { model, effort } = picked;
	const started = next({ ...spawn, model });
	if (kept === undefined) track(started, effort);
	const outcome = await started;
	if (outcome.deny !== undefined) await $.ui.log("denied");
	return outcome;
}

function track(started: Promise<Started>, effort: string): void {
	const settled = started.then(
		({ agentId }) => {
			if (agentId === undefined) return;
			const leastRecent = efforts.keys().next();
			if (efforts.size >= EFFORTS_MAX && !leastRecent.done)
				efforts.delete(leastRecent.value);
			efforts.set(agentId, effort);
		},
		() => undefined,
	);
	starting.add(settled);
	settled.finally(() => starting.delete(settled));
}

// A subagent's requests carry its agentId. The routed effort replaces the session default, unless the model has none.
async function* stepEffort($: Engine, e: TurnStep, next: StepNext): StepStream {
	if (
		e.agentId !== undefined &&
		!efforts.has(e.agentId) &&
		!waited.has(e.agentId)
	) {
		waited.add(e.agentId);
		await spawnsSettled($);
	}
	const effort = routedEffort(e.agentId);
	if (effort === undefined || e.effort === undefined) return yield* next(e);
	return yield* next({ ...e, effort });
}

// A read moves the entry to the end, so the full store drops the least recently used agent first.
function routedEffort(agentId: string | undefined): string | undefined {
	if (agentId === undefined) return undefined;
	const effort = efforts.get(agentId);
	if (effort === undefined) return undefined;
	efforts.delete(agentId);
	efforts.set(agentId, effort);
	return effort;
}

// The step cannot tell which spawn is its own, so it waits for them all, for a short time at most.
async function spawnsSettled($: Engine): Promise<void> {
	if (starting.size === 0) return;
	const stop = new AbortController();
	try {
		await Promise.race([
			Promise.all(starting),
			$.clock.sleep(STEP_WAIT_MS, { signal: stop.signal }).catch(() => {}),
		]);
	} finally {
		stop.abort();
	}
}

type Picked = {
	model: (typeof MODELS)[number];
	effort: string;
	level: Level;
	probabilities: string;
	suffix: string;
};

/**
 * Returns the model, effort, level, probabilities and suffix for a decision
 * that holds the tier and work parts. Returns the skip unchanged when the
 * decision is a skip, and a bad-reply skip when a part is missing. Never
 * throws.
 */
function pick(decision: Decision | Skipped): Picked | Skipped {
	const decided = decide(decision, tier.key, work.key);
	if ("skipped" in decided) return decided;
	return {
		model: MODELS[decided.tier],
		effort: effortFor(decided.tier, decided.work),
		level: decided.tier,
		probabilities: decided.probabilities,
		suffix: decided.suffix,
	};
}

/**
 * Returns the routing line for a pick. A kept effort replaces the picked
 * effort. Never throws.
 */
function decisionLine(picked: Picked, kept: string | undefined): string {
	return routedLine({
		level: picked.level,
		target: picked.model,
		effort: kept ?? picked.effort,
		probabilities: picked.probabilities,
		suffix: picked.suffix,
	});
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
