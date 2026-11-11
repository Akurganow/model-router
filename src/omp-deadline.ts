// omp gives every tool_call handler this long when its setting is unusable.
export const DEFAULT_TIMEOUT_MS = 30000;

// omp's own rule for extensionHandlers.toolCallTimeoutMs: a finite number above 0, else the default.
// Source: docs/clients.md#omp-tool_call-cost-and-timeout.
export const usableTimeout = (value: unknown): number =>
	typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: DEFAULT_TIMEOUT_MS;

export const timeoutTooShort = (timeout: number, deadline: number): string =>
	`tool call timeout ${timeout} ms leaves ${Math.max(0, deadline)} ms to route`;
