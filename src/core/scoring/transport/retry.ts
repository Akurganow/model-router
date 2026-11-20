import { type Failure, isFailure, SERVER_ERRORS } from "../failure.ts";

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
			(outcome.status >= SERVER_ERRORS.min &&
				outcome.status <= SERVER_ERRORS.max)
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

function serverDelayMs(headers: HeaderReader): number | undefined {
	const rawMs = headers.get("retry-after-ms");
	const ms = rawMs === null ? Number.NaN : Number(rawMs);
	if (Number.isFinite(ms) && ms >= 0) return ms;
	const raw = headers.get("retry-after");
	if (raw === null) return undefined;
	const seconds = Number(raw);
	if (Number.isFinite(seconds)) {
		return seconds >= 0 ? seconds * 1000 : undefined;
	}
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
