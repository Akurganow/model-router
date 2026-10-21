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

// Only the fields omp's effort mapping reads (packages/catalog/src/model-thinking.ts).
export type ModelLike = {
	reasoning?: boolean;
	thinking?: { efforts?: readonly string[] };
};

export type Context = {
	hasUI: boolean;
	ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
	modelRegistry: {
		getApiKeyForProvider(provider: string): Promise<string | undefined>;
	};
	models?: { resolve(spec: string): ModelLike | undefined };
};

export type ToolCallHandler = (
	event: ToolCallEvent,
	ctx: Context,
) => Promise<ToolCallResult | undefined>;

// Tool metadata from omp's getAllTools: the schema is an omptype schema or plain JSON Schema.
export type ToolInfo = {
	name: string;
	description: string;
	parameters: unknown;
};

export type Pi = {
	on(event: "tool_call", handler: ToolCallHandler): void;
	getAllTools?(): ToolInfo[];
};
