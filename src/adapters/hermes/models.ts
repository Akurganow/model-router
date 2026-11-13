import { type Listed, listing } from "../../core/models.ts";
import { isRecord } from "../../utils/guards.ts";

// The op Python sends to have the models list worded; a request without it routes.
const MODELS_OP = "models";

const numbers = (fields: Record<string, unknown>): Omit<Listed, "id"> =>
	Object.fromEntries(
		Object.entries(fields).filter(([, value]) => typeof value === "number"),
	);

// Python sends a Hermes provider and one of its model ids. The id the agent reads joins them, so a slot's two fields are the text before and after the first slash.
function toListed(entry: unknown): Listed[] {
	if (!isRecord(entry) || Array.isArray(entry)) return [];
	const { provider, model, input, output, context } = entry;
	if (typeof provider !== "string" || typeof model !== "string") return [];
	return [
		{ id: `${provider}/${model}`, ...numbers({ input, output, context }) },
	];
}

/**
 * Answers a request whose op is models with the worded list of its entries,
 * and returns undefined for any other request, which then routes. The core
 * drops an entry whose id or number it cannot trust. Never throws.
 */
export function answerModels(
	raw: unknown,
): { readonly text: string } | undefined {
	if (!isRecord(raw)) return undefined;
	const { op, listed } = raw;
	if (op !== MODELS_OP) return undefined;
	return {
		text: listing(Array.isArray(listed) ? listed.flatMap(toListed) : []),
	};
}
