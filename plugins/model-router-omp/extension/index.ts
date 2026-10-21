import { hasCustomTaskAgent } from "./agents.ts";
import { contextText } from "./prompt.ts";
import type { Agent, Outcome, Run, Task } from "./route.ts";
import {
	batchDeadline,
	mapLimit,
	routeItem,
	SELECTORS,
	skipEntry,
} from "./route.ts";
import {
	type ReadSettings,
	readTaskSettings,
	type TaskSettings,
} from "./settings.ts";
import type { Context, Pi, ToolCallEvent, ToolCallResult } from "./types.ts";

const LINE_PREFIX = "model-router ";
const ENTRY_SEPARATOR = " | ";
const MAX_PARALLEL = 4;
const KEY_PROVIDER = "typesafe";
const SKIP_CUSTOM_AGENT = "custom task agent";
const SKIP_NO_KEY = "api_key unset";

const isEligible = (item: unknown): item is Task => {
	if (typeof item !== "object" || item === null) return false;
	const { agent, task } = item as Record<string, unknown>;
	return (
		(agent === undefined || agent === "task") &&
		typeof task === "string" &&
		task !== ""
	);
};

// The key goes only to TypeSafe. omp's own credential comes first, then the variable.
async function findKey(ctx: Context): Promise<string | undefined> {
	try {
		const key = await ctx.modelRegistry.getApiKeyForProvider(KEY_PROVIDER);
		if (typeof key === "string" && key !== "") return key;
	} catch {
		// A broken credential store falls through to the variable.
	}
	const { TYPESAFE_API_KEY } = process.env;
	return TYPESAFE_API_KEY || undefined;
}

const jevAlias = (): string => {
	const { MODEL_ROUTER_JEV } = process.env;
	return MODEL_ROUTER_JEV === "jev-preview" ? "jev-preview" : "jev-latest";
};

function report(ctx: Context, outcomes: readonly Outcome[]): void {
	const line = LINE_PREFIX + outcomes.map((o) => o.entry).join(ENTRY_SEPARATOR);
	try {
		if (ctx.hasUI) ctx.ui.notify(line);
		else process.stderr.write(`${line}\n`);
	} catch {
		// A failed report must never block the spawn.
	}
}

const agentModel = (ctx: Context) => (agent: Agent) => {
	for (const selector of SELECTORS[agent]) {
		try {
			const model = ctx.models?.resolve(selector);
			if (model) return model;
		} catch {
			// An unresolvable selector falls through to the next, as in omp.
		}
	}
	return undefined;
};

// The user's choice in task.enableEffort decides whether the router sets effort at all. Settings that
// cannot be read count as omp's auto.
async function effortRun(
	ctx: Context,
	readSettings: ReadSettings,
): Promise<Run["effort"]> {
	const { enableEffort, maxEffort } = await readSettings(ctx.cwd).catch(
		() => ({}) as TaskSettings,
	);
	if (enableEffort !== true) return undefined;
	return maxEffort === undefined
		? { model: agentModel(ctx) }
		: { model: agentModel(ctx), max: maxEffort };
}

async function route(
	event: ToolCallEvent,
	ctx: Context,
	readSettings: ReadSettings,
): Promise<ToolCallResult | undefined> {
	const { input } = event;
	const { tasks, context } = input;
	if (event.toolName !== "task" || !Array.isArray(tasks)) return undefined;
	const eligible = tasks.flatMap((item, i) =>
		isEligible(item) ? [{ position: i + 1, item }] : [],
	);
	if (eligible.length === 0) return undefined;

	const custom = hasCustomTaskAgent(ctx.cwd);
	const key = custom ? undefined : await findKey(ctx);
	const effort =
		key === undefined ? undefined : await effortRun(ctx, readSettings);
	const run: Run | undefined =
		key === undefined
			? undefined
			: {
					key,
					model: jevAlias(),
					context: contextText(context),
					signal: batchDeadline(),
					...(effort ? { effort } : {}),
				};
	const skip = custom ? SKIP_CUSTOM_AGENT : SKIP_NO_KEY;
	const outcomes = run
		? await mapLimit(eligible, MAX_PARALLEL, ({ position, item }) =>
				routeItem(position, item, run),
			)
		: eligible.map(({ position }) => skipEntry(position, skip));
	report(ctx, outcomes);

	const routed = [...tasks];
	for (const [i, { position }] of eligible.entries()) {
		const item = outcomes[i]?.item;
		if (item) routed[position - 1] = item;
	}
	return outcomes.some((o) => o.item)
		? { input: { ...input, tasks: routed } }
		: undefined;
}

export default function extension(
	pi: Pi,
	readSettings: ReadSettings = readTaskSettings,
): void {
	pi.on("tool_call", async (event, ctx) => {
		try {
			return await route(event, ctx, readSettings);
		} catch {
			return undefined;
		}
	});
}
