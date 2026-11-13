import type { Listed, ModelPort, Writer } from "../../core/models.ts";
import { UNREADABLE } from "../../core/reasons.ts";
import { type Slot, slotSetting } from "../../core/slots.ts";
import { isRecord } from "../../utils/guards.ts";
import { patternsOf } from "./effort.ts";
import { ROLE_NAMES } from "./gates.ts";
import type { Context, OmpImports, Pi } from "./types.ts";

const ROLES = "modelRoles";

const HELP: Readonly<Record<Slot, string>> = {
	small:
		"small_model is omp's smol role (Fast). Set it in /models under Roles, or under modelRoles.smol in config.yml.",
	middle:
		"middle_model is the middle role. Add it in /models under Roles with + New role… and the name middle, or under modelRoles.middle in config.yml.",
	large:
		"large_model is omp's slow role (Thinking). Set it in /models under Roles, or under modelRoles.slow in config.yml.",
};

// omp runs its own agents and workers on smol and slow, so a pick there changes more than routing.
// Source: docs/clients.md#omp-model-setup.
const OTHER_USES: Readonly<Partial<Record<Slot, string>>> = {
	small:
		"omp also uses smol for the scout and sonic agents, commit messages, session titles and the prewalk hand-off.",
	large: "omp also uses slow for the reviewer agent and the advisor.",
};

export const slotName = (slot: Slot): string =>
	`${slotSetting(slot)} (${ROLE_NAMES[slot]} role)`;

/**
 * Returns the slot's role as modelRoles configures it, its patterns joined by
 * commas, or undefined when modelRoles names no pattern for it or cannot be
 * read. Resolves nothing. Never throws.
 */
export function configured(
	omp: OmpImports,
	pi: Pi,
	slot: Slot,
): string | undefined {
	let roles: unknown;
	try {
		roles = omp.lookup(ROLES)?.get(pi.pi.settings);
	} catch {
		return undefined;
	}
	const name = ROLE_NAMES[slot];
	const value =
		isRecord(roles) && Object.hasOwn(roles, name) ? roles[name] : undefined;
	const patterns = patternsOf(value);
	return patterns.length > 0 ? patterns.join(", ") : undefined;
}

const rate = (value: unknown): value is number =>
	typeof value === "number" && value !== 0;

// omp reads any non-zero rate as a fixed price. An all-zero card is a price only
// when omp marks it free: it can also mean included in a plan, variable or unknown.
// Source: docs/clients.md#omp-model-setup.
function prices(model: Record<string, unknown>): Partial<Listed> {
	const { cost, pricingStatus } = model;
	if (!isRecord(cost)) return {};
	const { input, output, cacheRead, cacheWrite } = cost;
	const fixed =
		[input, output, cacheRead, cacheWrite].some(rate) ||
		pricingStatus === "free";
	if (!fixed) return {};
	return {
		...(typeof input === "number" ? { input } : {}),
		...(typeof output === "number" ? { output } : {}),
	};
}

function listed(model: unknown): Listed[] {
	if (!isRecord(model)) return [];
	const { provider, id, contextWindow } = model;
	if (typeof provider !== "string" || typeof id !== "string") return [];
	return [
		{
			id: `${provider}/${id}`,
			...prices(model),
			...(typeof contextWindow === "number" ? { context: contextWindow } : {}),
		},
	];
}

function writer(omp: OmpImports, pi: Pi, ctx: Context): Writer {
	return {
		authorize: () => undefined,
		name: slotName,
		current: async (slot) => configured(omp, pi, slot),
		select: (slot, question, options) => {
			const note = OTHER_USES[slot];
			return ctx.ui.select(
				note === undefined ? question : `${question} ${note}`,
				options,
			);
		},
		// setEntry writes this one role into the user's global config.yml and keeps the others.
		write: async (slot, id) => {
			const roles = omp.lookup(ROLES);
			if (roles?.setEntry === undefined) throw new Error(UNREADABLE);
			roles.setEntry(pi.pi.settings, ROLE_NAMES[slot], id);
			return configured(omp, pi, slot);
		},
	};
}

/**
 * Returns omp's side of the model setup: the models omp lists for this
 * session, the user path for each slot, and a writer while omp gives the tool
 * a dialog.
 */
export const modelPort = (
	omp: OmpImports,
	pi: Pi,
	ctx: Context,
): ModelPort => ({
	list: async () => ctx.models.list().flatMap(listed),
	help: (slot) => HELP[slot],
	writer: ctx.hasUI ? writer(omp, pi, ctx) : null,
});
