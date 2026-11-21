import {
	type Failure,
	isFailure,
	isServerError,
} from "#core/scoring/failure.ts";
import { nonEmpty } from "#utils/text.ts";

// The defaults when the caller names none: two retries after the first request, and 10 s for each
// request. The routing limit ends a longer wait first.
export const RETRIES = 2;
export const TIMEOUT_MS = 10000;

const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 5000;
// Up to a quarter off each backoff at random, so that callers that fail together do not retry together.
const BACKOFF_JITTER = 0.25;
const SERVER_DELAY_MAX_MS = 60000;

export type HeaderReader = { get(name: string): string | null };

// Retried: a received 408, 429 or 5xx status, a timeout and a connection failure.
export function isRetried(
	outcome: { readonly status: number } | Failure,
): boolean {
	if (!isFailure(outcome))
		return (
			outcome.status === 408 ||
			outcome.status === 429 ||
			isServerError(outcome.status)
		);
	switch (outcome.failure) {
		case "timed out":
		case "network":
			return true;
		case "aborted":
		case "status":
		case "malformed":
		case "unknown":
			return false;
	}
}

// `Number("")` is 0, so a blank header would read as "retry now": `nonEmpty` makes it absent.
function serverDelayMs(headers: HeaderReader): number | undefined {
	const rawMs = nonEmpty(headers.get("retry-after-ms"));
	const ms = rawMs === undefined ? Number.NaN : Number(rawMs);
	if (Number.isFinite(ms) && ms >= 0) return ms;
	const raw = nonEmpty(headers.get("retry-after"));
	if (raw === undefined) return undefined;
	const seconds = Number(raw);
	if (Number.isFinite(seconds)) {
		return seconds >= 0 ? seconds * 1000 : undefined;
	}
	// `Date.parse` alone is lenient: it reads "2, 3", a header sent twice, as a date in 2001.
	// Only a text that ends in GMT, as the date a server sends does, reaches it.
	if (!raw.endsWith("GMT")) return undefined;
	const date = Date.parse(raw);
	return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

// The wait in ms before retry `retry`, counted from zero: the server's delay when it asks for
// one up to 60 s, else the backoff.
export function retryDelayMs(retry: number, headers?: HeaderReader): number {
	const server = headers === undefined ? undefined : serverDelayMs(headers);
	if (server !== undefined && server <= SERVER_DELAY_MAX_MS) return server;
	const backoff = Math.min(BACKOFF_INITIAL_MS * 2 ** retry, BACKOFF_MAX_MS);
	return Math.round(backoff * (1 - Math.random() * BACKOFF_JITTER));
}
