import { deadlineFor, tooShort } from "../../core/handler-deadline.ts";

// omp gives every tool_call handler this long when its setting is unusable.
const DEFAULT_TIMEOUT_MS = 30000;

export type Budget =
	| { readonly deadline: number }
	| { readonly closed: string };

/**
 * Returns the scoring deadline that omp's tool call timeout leaves, from the
 * raw `extensionHandlers.toolCallTimeoutMs` value. Like omp, it keeps a finite
 * number above 0 and takes 30000 for any other value. Returns a closed reason
 * when the deadline is under the floor. Never throws.
 * Source: docs/clients.md#omp-tool_call-cost-and-timeout.
 */
export function budgetFor(value: unknown): Budget {
	const timeout =
		typeof value === "number" && Number.isFinite(value) && value > 0
			? value
			: DEFAULT_TIMEOUT_MS;
	const deadline = deadlineFor(timeout);
	if (!tooShort(deadline)) return { deadline };
	return {
		closed: `tool call timeout ${timeout} ms leaves ${Math.max(0, deadline)} ms to route`,
	};
}
