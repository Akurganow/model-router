import {
	APIConnectionError,
	APIError,
	APITimeoutError,
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
import { type Attempt, fallsBack, type Provider } from "./provider.ts";

export const ROUTING_LIMIT_MS = 8000;
// Adapters abort their signal with this reason when the limit runs out, so a timeout differs from a cancel.
export const LIMIT_REACHED = Symbol("routing limit reached");

const MODEL_CHARS_MAX = 40;

type RoutingState = {
	readonly role: string;
	readonly description: string;
	readonly task: string;
};
type Failure = { readonly provider: Provider; readonly reason: string };
export type Via = {
	readonly provider: Provider;
	readonly first: Provider;
	readonly reason: string;
};
export type Decision = {
	readonly parts: Readonly<
		Record<string, { level: Level; probabilities: Probabilities }>
	>;
	readonly model: string;
	readonly usage: Usage | undefined;
	readonly via?: Via;
};
export type Skipped = { readonly skipped: string };
export type RouteInput = {
	readonly parts: readonly Part[];
	readonly state: RoutingState;
	readonly attempts: readonly Attempt[];
	readonly keys: Readonly<Partial<Record<Provider, string>>>;
	readonly fetchFn: Fetch;
	readonly signal: AbortSignal;
	readonly onFallback?: (provider: Provider) => void;
};

const isCount = (v: unknown): v is number =>
	typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

// The category comes from the error class or status, never from its message: messages can echo the key or the body.
function skipCategory(err: unknown, signal: AbortSignal): string {
	if (err instanceof APIUserAbortError)
		return signal.reason === LIMIT_REACHED ? "timeout" : "cancelled";
	if (err instanceof APIError) return `HTTP ${err.status}`;
	if (err instanceof APITimeoutError) return "timeout";
	if (err instanceof APIConnectionError) return "network error";
	if (err instanceof TypeSafeError) return "rejected request";
	return "failed";
}

// One signal covers every attempt, so the routing limit also ends a fallback.
export async function route(input: RouteInput): Promise<Decision | Skipped> {
	const { parts, attempts, signal } = input;
	if (attempts.length === 0) return { skipped: "key unset" };
	const failed: Failure[] = [];
	for (const [i, attempt] of attempts.entries()) {
		let result: unknown;
		try {
			result = await ask(input, attempt);
		} catch (err) {
			failed.push({
				provider: attempt.provider,
				reason: skipCategory(err, signal),
			});
			if (!fallsBack(err)) break;
			if (i < attempts.length - 1) input.onFallback?.(attempt.provider);
			continue;
		}
		const decision = decide(parts, result);
		if ("skipped" in decision) {
			failed.push({ provider: attempt.provider, reason: decision.skipped });
			break;
		}
		const [first] = failed;
		if (!first) return decision;
		const via = {
			provider: attempt.provider,
			first: first.provider,
			reason: first.reason,
		};
		return { ...decision, via };
	}
	return skip(failed);
}

function ask(input: RouteInput, attempt: Attempt): Promise<unknown> {
	const { parts, state, keys, fetchFn, signal } = input;
	const { provider, model, ...overrides } = attempt;
	return createClient(provider, keys[provider], model, fetchFn).systemOne(
		{
			state,
			model,
			questions: Object.fromEntries(parts.map((p) => [p.key, p.question])),
		},
		{ ...overrides, signal },
	);
}

// A one-attempt skip keeps the bare reason; two attempts name each provider in order.
function skip(failed: readonly Failure[]): Skipped {
	const [first, ...rest] = failed;
	if (!first || rest.length === 0)
		return { skipped: first?.reason ?? "failed" };
	return {
		skipped: failed.map((f) => `${f.provider} ${f.reason}`).join(", "),
	};
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
				? model.replace(/[^A-Za-z0-9._/-]/g, "").slice(0, MODEL_CHARS_MAX)
				: "",
		usage: isRecord(usage) ? (usage as unknown as Usage) : undefined,
	};
}

// Fields the reply lacks are left out, never guessed.
export function decisionSuffix({
	model,
	usage,
	via,
}: Pick<Decision, "model" | "usage" | "via">): string {
	const input = usage?.input_tokens;
	const output = usage?.output_tokens;
	return (
		(model ? ` · jev ${model}` : "") +
		(isCount(input) && isCount(output) ? ` · ${input}/${output} tok` : "") +
		(via ? ` · via ${via.provider} (${via.first} ${via.reason})` : "")
	);
}
