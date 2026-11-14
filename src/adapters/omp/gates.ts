import { KEY_UNSET, UNREADABLE } from "../../core/reasons.ts";
import {
	type Slot,
	type SlotModel,
	slotRecord,
	slotState,
} from "../../core/slots.ts";
import {
	type Facts,
	ROLE_MARK,
	type Spawning,
	spawnCheck,
	TASK,
} from "./items.ts";
import {
	findKeys,
	type Routing,
	readConfig,
	readSettings,
	type Settings,
} from "./settings.ts";
import type { Context, OmpImports, Pi } from "./types.ts";

// The omp model role that holds each slot's model.
const ROLE_NAMES = { small: "smol", middle: "midl", large: "slow" } as const;

export type Batch = Routing & { readonly facts: Facts };
type Closed = { readonly closed: string };

// A spawn is judged like a batch item, for its own agent. Its effort needs the facts read again.
export async function checkGates(
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
	spawning: Spawning = { agent: TASK },
): Promise<Batch | Closed> {
	const batch = await openBatch(omp, pi, ctx, await readSettings(omp, ctx.cwd));
	if ("closed" in batch) return batch;
	const reason = spawnCheck(spawning, batch.facts);
	return reason === undefined ? batch : { closed: reason };
}

/**
 * Returns the routing and the facts for the whole batch, or a closed reason
 * when a gate shuts it: unreadable settings, an unset key or an unreadable
 * config. Each gate fails closed, and the keys are the cheapest check. What
 * each item needs to be judged comes back as facts, read once. Never throws.
 */
export async function openBatch(
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
	settings: Settings | undefined,
): Promise<Batch | Closed> {
	if (settings === undefined) return { closed: UNREADABLE };
	const routing = await findKeys(ctx, settings.provider);
	if (routing.attempts.length === 0) return { closed: KEY_UNSET };
	const config = readConfig(omp.lookup, pi.pi.settings);
	if (config === undefined) return { closed: UNREADABLE };
	const agents = await discover(pi, ctx);
	const models = slotRecord((slot) => slotModel(ctx, slot));
	return {
		...routing,
		facts: { ...config, scope: settings.scope, agents, models },
	};
}

/**
 * Returns the state of a slot's role: set when omp has a model for the role,
 * unset when it has none. omp finds a model for `smol` and `slow` by itself,
 * and for `midl` only when modelRoles names it. A role omp has no model for
 * would fail the child with `No model selected.` Never throws.
 * Source: docs/clients.md#omp-model-roles.
 */
export function slotModel(ctx: Context, slot: Slot): SlotModel {
	const role = ROLE_MARK + ROLE_NAMES[slot];
	return slotState(resolves(ctx, role) ? role : undefined);
}

function resolves(ctx: Context, role: string): boolean {
	try {
		return ctx.models.resolve(role) !== undefined;
	} catch {
		return false;
	}
}

async function discover(pi: Pi, ctx: Context): Promise<Facts["agents"]> {
	try {
		return (await pi.pi.discoverAgents(ctx.cwd)).agents;
	} catch {
		return undefined;
	}
}
