import { contextText } from "./brief.ts";
import { isRecord, nonEmpty } from "./part.ts";
import { type Keys, PROVIDERS } from "./provider.ts";
import { type EndSlot, SLOTS } from "./reasons.ts";

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
	readonly configEffort: boolean;
	// The delegating model set the task's effort; an effort in the delegation section still wins.
	readonly callerEffort: boolean;
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
 * the effort flags off. Never throws.
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
		configEffort,
		callerEffort,
		description,
	} = raw;
	return {
		task: typeof task === "string" ? task : "",
		context: contextText(context),
		provider,
		keys: readKeys(keys),
		budgetMs: readBudget(budgetMs),
		models: readModels(models),
		configEffort: configEffort === true,
		callerEffort: callerEffort === true,
		description: typeof description === "string" ? description : "",
	};
}
