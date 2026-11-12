import { ROUTING_LIMIT_MS } from "./compose.ts";

// A handler keeps this much of its host's timeout back for the work around scoring.
export const HANDLER_MARGIN_MS = 2000;
// Below this the deadline leaves too little time for one Jev request.
export const MIN_DEADLINE_MS = 1000;
// The shortest handler timeout that still leaves the minimum deadline.
export const MIN_TIMEOUT_MS = MIN_DEADLINE_MS + HANDLER_MARGIN_MS;

// Tells whether a deadline is under the floor, so the handler routes nothing.
export const tooShort = (deadline: number): boolean =>
	deadline < MIN_DEADLINE_MS;

// The scoring time left once the handler's margin is kept back, capped at the routing limit.
export const deadlineFor = (timeout: number): number =>
	Math.min(ROUTING_LIMIT_MS, timeout - HANDLER_MARGIN_MS);
