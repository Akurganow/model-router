import { contextText } from "../../core/brief.ts";
import { type Keys, PROVIDERS } from "../../core/provider.ts";
import { type EndSlot, SLOTS } from "../../core/slots.ts";
import { isRecord } from "../../utils/guards.ts";
import { nonEmpty } from "../../utils/text.ts";

// Whose effort replaces the ladder's. Python ranks the delegation section above the caller.
const KEPT_EFFORTS = ["config", "caller"] as const;
export type KeptEffort = (typeof KEPT_EFFORTS)[number];

// What the Python shim sends, once read.
export type HermesRequest = {
	readonly task: string;
	readonly context: string;
	readonly provider: unknown;
	readonly keys: Keys;
	// Undefined unless the budget is a positive finite number.
	readonly budgetMs: number | undefined;
	// A blank or missing model is undefined.
	readonly models: Readonly<Record<EndSlot, string | undefined>>;
	// Undefined when the ladder's effort applies.
	readonly keptEffort: KeptEffort | undefined;
	// The task's description parameter, or empty text.
	readonly description: string;
};

const readKeys = (value: unknown): Keys =>
	Object.fromEntries(
		PROVIDERS.flatMap((provider) => {
			const key = isRecord(value) ? nonEmpty(value[provider]) : undefined;
			return key === undefined ? [] : [[provider, key]];
		}),
	);

const readModels = (value: unknown): HermesRequest["models"] =>
	Object.fromEntries(
		SLOTS.map((slot) => [
			slot,
			isRecord(value) ? nonEmpty(value[slot]) : undefined,
		]),
	) as HermesRequest["models"];

const readBudget = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;

/**
 * Reads a parsed request. Returns undefined when it is not an object. A field of
 * the wrong type reads as its empty value: no text, no key, no model, no budget,
 * no kept effort. Never throws.
 */
export function readRequest(raw: unknown): HermesRequest | undefined {
	if (!isRecord(raw) || Array.isArray(raw)) return undefined;
	const {
		task,
		context,
		provider,
		keys,
		budgetMs,
		models,
		keptEffort,
		description,
	} = raw;
	return {
		task: typeof task === "string" ? task : "",
		context: contextText(context),
		provider,
		keys: readKeys(keys),
		budgetMs: readBudget(budgetMs),
		models: readModels(models),
		keptEffort: KEPT_EFFORTS.find((source) => source === keptEffort),
		description: typeof description === "string" ? description : "",
	};
}
