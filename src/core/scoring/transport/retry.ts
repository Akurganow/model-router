// The last attempt's defaults: two retries after the first request, and 10 s for each request.
export const RETRIES = 2;
export const TIMEOUT_MS = 10000;

const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 5000;
// Up to a quarter off each backoff at random, so that callers that fail together do not retry together.
const BACKOFF_JITTER = 0.25;
const SERVER_DELAY_MAX_MS = 60000;
const SERVER_ERRORS = { min: 500, max: 599 };

export type HeaderReader = { get(name: string): string | null };

// Retried: 408, 429 and every 5xx status.
export const isRetriedStatus = (status: number): boolean =>
	status === 408 ||
	status === 429 ||
	(status >= SERVER_ERRORS.min && status <= SERVER_ERRORS.max);

// Number("") is 0, so a blank header counts as absent.
const headerText = (
	headers: HeaderReader,
	name: string,
): string | undefined => {
	const raw = headers.get(name);
	return raw === null || raw.trim() === "" ? undefined : raw;
};

function serverDelayMs(headers: HeaderReader): number | undefined {
	const ms = Number(headerText(headers, "retry-after-ms"));
	if (Number.isFinite(ms) && ms >= 0) return ms;
	const raw = headerText(headers, "retry-after");
	if (raw === undefined) return undefined;
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
