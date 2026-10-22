// The parts of omp's extension API this adapter uses, from extensibility/extensions/types.ts at omp 18.12.6.
// Nothing here imports omp: the bundle leaves only the registry subpath external.
export type Lookup = (
	id: string,
) => { get(scope: unknown): unknown } | undefined;

export type Context = {
	cwd: string;
	hasUI: boolean;
	ui: { notify(message: string): void };
	modelRegistry: {
		getApiKeyForProvider(provider: string): Promise<string | undefined>;
	};
	models: { resolve(spec: string): unknown };
};

export type ToolCallEvent = {
	toolName: string;
	toolCallId: string;
	input: unknown;
};
export type ToolProgressEvent = {
	toolName: string;
	toolCallId: string;
	partialResult?: unknown;
	result?: unknown;
};
export type SpawnEvent = {
	agent: string;
	invocationKind: "task" | "eval";
	modelRole?: string;
	spawnKey?: string;
};
export type SpawnResult = { model?: string; note?: string };

type Handlers = {
	tool_call: (event: ToolCallEvent, ctx: Context) => Promise<undefined>;
	tool_execution_update: (event: ToolProgressEvent) => Promise<void>;
	tool_execution_end: (event: ToolProgressEvent) => Promise<void>;
	before_subagent_spawn: (
		event: SpawnEvent,
		ctx: Context,
	) => Promise<SpawnResult | undefined>;
};

export type Pi = {
	on<E extends keyof Handlers>(event: E, handler: Handlers[E]): void;
	pi: {
		settings: unknown;
		discoverAgents(
			cwd: string,
		): Promise<{ agents: readonly { name: string; source: string }[] }>;
	};
};
