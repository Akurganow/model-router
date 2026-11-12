import { ROUTING_LIMIT_MS } from "../../core/compose.ts";
import { HANDLER_MARGIN_MS } from "../../core/handler-deadline.ts";

export {
	deadlineFor,
	MIN_DEADLINE_MS,
	MIN_TIMEOUT_MS,
} from "../../core/handler-deadline.ts";

// The timeout the plugin registers its hook with: the routing limit plus the margin.
export const HOOK_TIMEOUT_MS = ROUTING_LIMIT_MS + HANDLER_MARGIN_MS;
