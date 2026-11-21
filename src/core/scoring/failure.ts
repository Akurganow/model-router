import {
	BAD_REPLY,
	FAILED,
	httpStatus,
	NETWORK_ERROR,
	TIMEOUT,
} from "#core/output/reasons.ts";

// A failure holds a tag and, for a status, the number. Never a cause, a body, a task or a key.
export type Failure =
	| { readonly failure: "aborted" }
	| { readonly failure: "timed out" }
	| { readonly failure: "network" }
	| { readonly failure: "status"; readonly status: number }
	| { readonly failure: "malformed" }
	| { readonly failure: "unknown" };

export const ABORTED: Failure = { failure: "aborted" };
export const TIMED_OUT: Failure = { failure: "timed out" };
export const NETWORK: Failure = { failure: "network" };
export const MALFORMED: Failure = { failure: "malformed" };
export const UNKNOWN: Failure = { failure: "unknown" };

const FALLBACK_STATUSES: ReadonlySet<number> = new Set([
	401, 402, 403, 404, 408, 429,
]);
const SERVER_ERRORS = { min: 500, max: 599 };
const OK = { min: 200, max: 299 };

export const isSuccess = (status: number): boolean =>
	status >= OK.min && status <= OK.max;

export const isServerError = (status: number): boolean =>
	status >= SERVER_ERRORS.min && status <= SERVER_ERRORS.max;

export const isFailure = (value: object): value is Failure =>
	Object.hasOwn(value, "failure");

export function skipText(failure: Failure, aborted: string): string {
	switch (failure.failure) {
		case "aborted":
			return aborted;
		case "timed out":
			return TIMEOUT;
		case "network":
			return NETWORK_ERROR;
		case "status":
			return httpStatus(failure.status);
		case "malformed":
			return BAD_REPLY;
		case "unknown":
			return FAILED;
	}
}

export function fallsBack(failure: Failure): boolean {
	switch (failure.failure) {
		case "timed out":
		case "network":
			return true;
		case "status":
			return (
				FALLBACK_STATUSES.has(failure.status) || isServerError(failure.status)
			);
		case "aborted":
		case "malformed":
		case "unknown":
			return false;
	}
}
