// A skip reason that more than one file spells, or that the core prints for every adapter, lives here.
// A reason that one adapter prints lives in that adapter.
// A new or changed text here also goes into scripts/lint/shared-reason.grit, which bans it elsewhere.
export const CALLER_EFFORT = "caller effort";
export const CONFIG_EFFORT = "config effort";
export const SUBAGENT_MODEL_SET = "subagent model set";
export const UNREADABLE = "settings unreadable";
export const KEY_UNSET = "key unset";
export const BAD_REPLY = "bad reply";
// The skip texts for a run past the routing limit and for a failure of no known kind.
export const TIMEOUT = "timeout";
export const FAILED = "failed";
// The skip text for a request that got no answer because no connection was made.
export const NETWORK_ERROR = "network error";
export const httpStatus = (status: number | undefined): string =>
	`HTTP ${status}`;
// The skip text for work the caller cancelled before the limit ran out.
export const CANCELLED = "cancelled";
export const outsideCoreScope = (id: string): string =>
	`${id} is outside the core scope`;
export const agentDiscoveryFailed = (id: string): string =>
	`${id} agent discovery failed`;
export const agentUnknown = (id: string): string => `${id} agent unknown`;
export const setsOwnModel = (id: string): string => `${id} sets its own model`;
// The skip text for a stored setting that names no value of its setting.
export const notValid = (setting: string): string =>
	`${setting} not valid: run setup`;

// A failed attempt as plain text, so this folder needs no type of the scoring code.
export type PlainFailedAttempt = {
	readonly holder: string;
	readonly reason: string;
};

// Both the skip text and the routing line name a failed attempt this way.
export const failedAttemptText = (f: PlainFailedAttempt): string =>
	`${f.holder} ${f.reason}`;
