// A skip reason that more than one file spells, or that the core prints for every adapter, lives here.
// A reason that one adapter prints lives in that adapter.
export const CALLER_EFFORT = "caller effort";
export const CONFIG_EFFORT = "config effort";
export const SUBAGENT_MODEL_SET = "subagent model set";
export const UNREADABLE = "settings unreadable";
export const KEY_UNSET = "key unset";
export const BAD_REPLY = "bad reply";
// The skip texts for a run past the routing limit and for a failure of no known kind.
export const TIMEOUT = "timeout";
export const FAILED = "failed";
// The skip texts for a request that got no answer: no connection, or a request the SDK refused itself.
export const NETWORK_ERROR = "network error";
export const REJECTED_REQUEST = "rejected request";
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
