import { deadlineFor, MIN_DEADLINE_MS } from "../../core/handler-deadline.ts";
import { isPositiveNumber } from "../../utils/guards.ts";

// omp gives every tool_call handler this long when its setting is unusable.
const DEFAULT_TIMEOUT_MS = 30000;

type Budget = { readonly deadline: number } | { readonly closed: string };

/**
 * Returns the scoring deadline that omp's tool call timeout leaves, from the
 * raw `extensionHandlers.toolCallTimeoutMs` value. Like omp, it keeps a finite
 * number above 0 and takes 30000 for any other value. Returns a closed reason
 * when the deadline is under the floor. Never throws.
 * Source: docs/clients.md#omp-tool_call-cost-and-timeout.
 */
export function budgetFor(value: unknown): Budget {
	const timeout = isPositiveNumber(value) ? value : DEFAULT_TIMEOUT_MS;
	const deadline = deadlineFor(timeout);
	if (deadline >= MIN_DEADLINE_MS) return { deadline };
	return {
		closed: `tool call timeout ${timeout} ms leaves ${Math.max(0, deadline)} ms to route`,
	};
}
