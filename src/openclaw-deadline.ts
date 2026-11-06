import { ROUTING_LIMIT_MS } from "./compose.ts";

// The hook gets this much beyond the routing limit before OpenClaw times it out.
const HOOK_MARGIN_MS = 2000;
// The timeout the plugin registers its hook with: the routing limit plus the margin.
export const HOOK_TIMEOUT_MS = ROUTING_LIMIT_MS + HOOK_MARGIN_MS;
// Below this the deadline leaves too little time for one Jev request.
export const MIN_DEADLINE_MS = 1000;
// The shortest hook timeout that still leaves the minimum deadline.
export const MIN_TIMEOUT_MS = MIN_DEADLINE_MS + HOOK_MARGIN_MS;

// The routing time left once the hook's own margin is kept back, capped at the routing limit.
export const deadlineFor = (timeout: number): number =>
	Math.min(ROUTING_LIMIT_MS, timeout - HOOK_MARGIN_MS);
