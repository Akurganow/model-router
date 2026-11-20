import { DEFAULT_ROLE, roleText, routingState } from "#core/brief/brief.ts";
import { scoreWork } from "#core/decision/decide.ts";
import { outcomeOf } from "#core/decision/outcome.ts";
import { resolveScope, type Scope } from "#core/options/scope.ts";
import { skippedLine } from "#core/output/line.ts";
import { CALLER_EFFORT } from "#core/output/reasons.ts";
import { plan } from "#core/providers/provider.ts";
import { limitSignal, ROUTING_LIMIT_MS } from "#core/scoring/limit.ts";
import type { RouteInput } from "#core/scoring/route.ts";
import type { Fetch } from "#core/scoring/transport/send.ts";
import {
	type AgentCall,
	type AgentSpawn,
	EFFORTS_MAX,
	type Engine,
	type HttpReply,
	type Next,
	type Options,
	type Outcome,
	type Started,
	type StepNext,
	type StepStream,
	type TurnStep,
} from "./host.ts";
import { readKeys } from "./keys.ts";

// Claude Code names a fixed model for each slot, so every slot is set.
const MODELS = { small: "haiku", middle: "sonnet", large: "opus" };

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

export function resetRouting(): void {
	offered.clear();
	callerEffort.clear();
	efforts.clear();
	starting.clear();
	waited.clear();
}

export function noteOffer(
	agent: string,
	source: string,
	description: string,
): void {
	offered.set(agent, { source, description });
}

export function forgetWaited(agentId: string): void {
	waited.delete(agentId);
}

// The entry waits for this call's spawn, which deletes it. A call that ends in error or throws never spawns.
export async function noteCallerEffort(
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
export async function routeSpawn(
	$: Engine,
	spawn: AgentSpawn,
	next: Next<Started>,
	options: Options,
): Promise<Started> {
	const callerSet = callerEffort.delete(spawn.tool_use_id);
	if (
		next.origin.plugin !== ENGINE ||
		!routable(spawn, resolveScope(options.scope))
	)
		return next(spawn);
	const state = routingState({
		role: roleFor(spawn.subagentType),
		description: spawn.description,
		task: spawn.prompt,
	});
	const keys = await readKeys($, options, options.provider);
	const decided = await scored($, next.signal, {
		state,
		attempts: plan(options.provider, keys),
	});
	if ("skipped" in decided) {
		await $.ui.log(skippedLine(decided.skipped));
		return next(spawn);
	}
	// Claude Code ranks this variable above any per-invocation effort, so a set value keeps the engine's effort.
	const kept = callerSet
		? CALLER_EFFORT
		: (await $.env.get("CLAUDE_CODE_EFFORT_LEVEL"))
			? "env effort"
			: undefined;
	const { model, effort, line } = outcomeOf(decided, MODELS, kept);
	await $.ui.log(line);
	const started = next(model === undefined ? spawn : { ...spawn, model });
	if (effort !== undefined) track(started, effort);
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
export async function* stepEffort(
	$: Engine,
	e: TurnStep,
	next: StepNext,
): StepStream {
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

// The limit covers the whole call, retries included. Aborting also ends the retry wait, so no request follows a skip.
async function scored(
	$: Engine,
	cancel: AbortSignal,
	input: Pick<RouteInput, "state" | "attempts">,
) {
	const clock = {
		after: (ms: number, fn: () => void) => $.clock.after(ms, fn),
	};
	const limit = limitSignal(ROUTING_LIMIT_MS, clock, cancel);
	try {
		return await scoreWork({
			...input,
			fetchFn: engineFetch($),
			clock,
			signal: limit.signal,
		});
	} finally {
		limit.disarm();
	}
}

// $.http.fetch takes no signal. The transport races this call against its own abort, so a skip
// ends the wait at once while the request itself runs to its end.
function engineFetch($: Engine): Fetch {
	return async (url, init) => {
		const { body } = init;
		await logRequest($, body);
		const reply = await $.http.fetch(url, {
			method: init.method,
			headers: init.headers,
			body,
		});
		return toReply(reply);
	};
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

// The mod runtime has no Response, so the transport gets the three members it reads.
function toReply({
	status,
	headers,
	text,
}: HttpReply): Awaited<ReturnType<Fetch>> {
	return {
		status,
		headers: { get: (name) => headers[name.toLowerCase()] ?? null },
		text: async () => text,
	};
}
