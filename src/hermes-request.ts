import { contextText } from "./brief.ts";
import { isRecord, nonEmpty } from "./part.ts";
import { KEY_VARIABLES, type Keys, type Provider } from "./provider.ts";

// What the Python shim sends, once read.
export type HermesRequest = {
	readonly task: string;
	readonly context: string;
	readonly provider: unknown;
	readonly keys: Keys;
	// Undefined unless the budget is a positive finite number.
	readonly budgetMs: number | undefined;
	// A blank or missing model is undefined.
	readonly smallModel: string | undefined;
	readonly largeModel: string | undefined;
	readonly configEffort: boolean;
};

const PROVIDERS = Object.keys(KEY_VARIABLES) as Provider[];

const readKeys = (value: unknown): Keys =>
	Object.fromEntries(
		PROVIDERS.flatMap((provider) => {
			const key = isRecord(value) ? nonEmpty(value[provider]) : undefined;
			return key === undefined ? [] : [[provider, key]];
		}),
	);

const readBudget = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;

/**
 * Reads a parsed request. Returns undefined when it is not an object. A field of
 * the wrong type reads as its empty value: no text, no key, no model, no budget,
 * the effort flag off. Never throws.
 */
export function readRequest(raw: unknown): HermesRequest | undefined {
	if (!isRecord(raw) || Array.isArray(raw)) return undefined;
	const {
		task,
		context,
		provider,
		keys,
		budgetMs,
		smallModel,
		largeModel,
		configEffort,
	} = raw;
	return {
		task: typeof task === "string" ? task : "",
		context: contextText(context),
		provider,
		keys: readKeys(keys),
		budgetMs: readBudget(budgetMs),
		smallModel: nonEmpty(smallModel),
		largeModel: nonEmpty(largeModel),
		configEffort: configEffort === true,
	};
}
