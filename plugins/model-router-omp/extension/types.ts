// The parts of omp's extension API this extension uses. omp declares them in
// packages/coding-agent/src/extensibility/extensions/types.ts at v18.2.8.
export type TaskInput = {
	tasks?: unknown;
	context?: unknown;
	[field: string]: unknown;
};

export type ToolCallEvent = {
	type: "tool_call";
	toolName: string;
	toolCallId: string;
	input: TaskInput;
};

export type ToolCallResult = {
	block?: boolean;
	reason?: string;
	input?: TaskInput;
};

export type Context = {
	hasUI: boolean;
	cwd: string;
	ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
	modelRegistry: {
		getApiKeyForProvider(provider: string): Promise<string | undefined>;
	};
};

export type ToolCallHandler = (
	event: ToolCallEvent,
	ctx: Context,
) => Promise<ToolCallResult | undefined>;

export type Pi = { on(event: "tool_call", handler: ToolCallHandler): void };
