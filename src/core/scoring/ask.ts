import type { Clock } from "../../utils/clock.ts";
import type { RoutingState } from "../brief/brief.ts";
import type { Part, Probabilities } from "../parts/part.ts";
import type { Attempt } from "../providers/provider.ts";
import { endpointOf } from "./endpoints.ts";
import { type Failure, isFailure, isSuccess, UNKNOWN } from "./failure.ts";
import { cleanModel, type Usage } from "./reply.ts";
import { type Fetch, send } from "./transport/send.ts";

// The builder defines MODEL_ROUTER_VERSION in each bundle from metadata/source.json; code run from source has none.
declare const MODEL_ROUTER_VERSION: string | undefined;
const VERSION =
	typeof MODEL_ROUTER_VERSION === "string" ? MODEL_ROUTER_VERSION : "dev";
const USER_AGENT = `model-router/${VERSION} (+https://github.com/Akurganow/model-router)`;

export type AskInput = {
	readonly parts: readonly Part[];
	readonly state: RoutingState;
	readonly fetchFn: Fetch;
	readonly clock: Clock;
	readonly signal: AbortSignal;
};
export type Reply = {
	readonly answers: readonly (readonly [Part, Probabilities])[];
	readonly model: string;
	readonly usage: Usage | undefined;
};

async function askOnce(
	input: AskInput,
	attempt: Attempt,
): Promise<Reply | Failure> {
	const { parts, state, fetchFn, clock, signal } = input;
	const endpoint = endpointOf(attempt);
	if (!endpoint) return UNKNOWN;
	const { url, format } = endpoint;
	const body = format.body(parts, state, attempt.model);
	const received = await send(
		fetchFn,
		url,
		{
			headers: {
				Authorization: `Bearer ${attempt.key}`,
				Accept: "application/json",
				"Content-Type": "application/json",
				"User-Agent": USER_AGENT,
			},
			body,
		},
		{
			signal,
			clock,
			...(attempt.timeout !== undefined && { timeout: attempt.timeout }),
			...(attempt.retries !== undefined && { retries: attempt.retries }),
		},
	);
	if (isFailure(received)) return received;
	if (!isSuccess(received.status))
		return { failure: "status", status: received.status };
	const read = format.read(parts, received.text);
	if (isFailure(read)) return read;
	return {
		answers: read.answers,
		model: cleanModel(read.model),
		usage: read.usage,
	};
}

/**
 * Asks one provider once, retries included, and returns its answers or the failure that ended the
 * attempt. Never rejects: a body that cannot be serialised, or any other exception, is a failed
 * attempt that sent nothing more.
 */
export async function ask(
	input: AskInput,
	attempt: Attempt,
): Promise<Reply | Failure> {
	try {
		return await askOnce(input, attempt);
	} catch {
		return UNKNOWN;
	}
}
