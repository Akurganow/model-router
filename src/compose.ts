import {
	APIConnectionError,
	APIError,
	APIUserAbortError,
	type Fetch,
	TypeSafeError,
	type Usage,
} from "@typesafe-ai/sdk";
import { createClient } from "./client.ts";
import {
	isRecord,
	type Level,
	type Part,
	type Probabilities,
	parseProbabilities,
} from "./part.ts";

export const ROUTING_LIMIT_MS = 8000;
// Adapters abort their signal with this reason when the limit runs out, so a timeout differs from a cancel.
export const LIMIT_REACHED = Symbol("routing limit reached");

const MODEL_CHARS_MAX = 40;

type RoutingState = {
	readonly role: string;
	readonly description: string;
	readonly task: string;
};
export type Decision = {
	readonly parts: Readonly<
		Record<string, { level: Level; probabilities: Probabilities }>
	>;
	readonly model: string;
	readonly usage: Usage | undefined;
};
export type Skipped = { readonly skipped: string };
export type RouteInput = {
	readonly parts: readonly Part[];
	readonly state: RoutingState;
	readonly model: string;
	readonly apiKey: string | undefined;
	readonly fetchFn: Fetch;
	readonly signal: AbortSignal;
};

const isCount = (v: unknown): v is number =>
	typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

// The category comes from the error class or status, never from its message: messages can echo the key or the body.
function skipCategory(err: unknown, signal: AbortSignal): string {
	if (err instanceof APIUserAbortError)
		return signal.reason === LIMIT_REACHED ? "timeout" : "cancelled";
	if (err instanceof APIError) return `HTTP ${err.status}`;
	if (err instanceof APIConnectionError) return "network error";
	if (err instanceof TypeSafeError) return "rejected request";
	return "failed";
}

export async function route(input: RouteInput): Promise<Decision | Skipped> {
	const { parts, state, model, apiKey, fetchFn, signal } = input;
	if (!apiKey) return { skipped: "key unset" };
	let result: unknown;
	try {
		result = await createClient(apiKey, model, fetchFn).systemOne(
			{
				state,
				model,
				questions: Object.fromEntries(parts.map((p) => [p.key, p.question])),
			},
			{ signal },
		);
	} catch (err) {
		return { skipped: skipCategory(err, signal) };
	}
	return decide(parts, result);
}

function decide(parts: readonly Part[], result: unknown): Decision | Skipped {
	const { answers, model, usage }: Record<string, unknown> = isRecord(result)
		? result
		: {};
	const decided: Record<
		string,
		{ level: Level; probabilities: Probabilities }
	> = {};
	for (const part of parts) {
		const probabilities = parseProbabilities(answers, part.key);
		if (!probabilities) return { skipped: "bad reply" };
		decided[part.key] = { level: part.pick(probabilities), probabilities };
	}
	return {
		parts: decided,
		model:
			typeof model === "string"
				? model.replace(/[^A-Za-z0-9._-]/g, "").slice(0, MODEL_CHARS_MAX)
				: "",
		usage: isRecord(usage) ? (usage as unknown as Usage) : undefined,
	};
}

// Fields the reply lacks are left out, never guessed.
export function decisionSuffix({
	model,
	usage,
}: Pick<Decision, "model" | "usage">): string {
	const input = usage?.input_tokens;
	const output = usage?.output_tokens;
	return (
		(model ? ` · jev ${model}` : "") +
		(isCount(input) && isCount(output) ? ` · ${input}/${output} tok` : "")
	);
}
