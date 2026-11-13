// The parts of omp's extension API this adapter uses, from extensibility/extensions/types.ts at omp 18.12.6.
// Nothing here imports omp: only the entry imports omp's modules, and the bundle leaves them external.
// setEntry writes one entry of a record setting into the user's global config.yml.
export type Lookup = (id: string) =>
	| {
			get(scope: unknown): unknown;
			setEntry?(scope: unknown, key: string, value: string): void;
	  }
	| undefined;

// The omp functions the entry imports. Tests hand in fakes.
export type OmpImports = {
	// The name omp installed the plugin under. Undefined makes writes refuse, and reads use the catalogue name.
	readonly plugin: string | undefined;
	lookup: Lookup;
	getPluginsLockfile: () => string;
	getPluginSettings: (
		pluginName: string,
		cwd: string,
	) => Promise<Record<string, unknown>>;
	writeSetting: (
		cwd: string,
		plugin: string,
		key: string,
		value: string,
	) => Promise<void>;
};

// omp's credential rows at 18.12.6: a key saved with source "login" is the kind omp's own login stores.
type Credentials = {
	set(
		provider: string,
		credential: { type: "api_key"; key: string; source: "login" },
	): Promise<void>;
};

export type Context = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string): void;
		select(title: string, options: string[]): Promise<string | undefined>;
		input(title: string, placeholder?: string): Promise<string | undefined>;
	};
	modelRegistry: {
		getApiKeyForProvider(provider: string): Promise<string | undefined>;
		authStorage: { credentials: Credentials };
	};
	// list() returns omp's Model entries: the models whose provider has configured auth.
	models: { resolve(spec: string): unknown; list(): readonly unknown[] };
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
	// Expanded model patterns omp would spawn with. Present at omp 18.12.6 and 18.18.9.
	patterns?: readonly string[];
	spawnKey?: string;
};
export type SpawnResult = { model?: string | string[]; note?: string };

type Handlers = {
	tool_call: (event: ToolCallEvent, ctx: Context) => Promise<undefined>;
	tool_execution_update: (event: ToolProgressEvent) => Promise<void>;
	tool_execution_end: (event: ToolProgressEvent) => Promise<void>;
	before_subagent_spawn: (
		event: SpawnEvent,
		ctx: Context,
	) => Promise<SpawnResult | undefined>;
};

// The fields of an agent that discovery returns at omp 18.12.6. A bundled agent may have no description.
export type DiscoveredAgent = {
	name: string;
	source: string;
	model?: readonly string[];
	description?: string;
};

export type ToolReply = { content: { type: "text"; text: string }[] };

// The tool and command shapes omp's registerTool and registerCommand take, at omp 18.12.6.
export type ToolSpec = {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	loadMode: "essential";
	approval: "write";
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: Context,
	): Promise<ToolReply>;
};

export type CommandSpec = {
	description: string;
	handler(args: string, ctx: Context): Promise<void>;
};

type Schema = { optional(): unknown };
// omp's zod facade keeps a schema optional when describe follows optional.
type Optional = { optional(): { describe(description: string): unknown } };

export type Pi = {
	on<E extends keyof Handlers>(event: E, handler: Handlers[E]): void;
	registerCommand(name: string, command: CommandSpec): void;
	registerTool(tool: ToolSpec): void;
	zod: {
		object(shape: Record<string, unknown>): unknown;
		enum(values: readonly string[]): Schema;
		array(items: unknown): Optional;
		string(): unknown;
	};
	pi: {
		settings: unknown;
		discoverAgents(
			cwd: string,
		): Promise<{ agents: readonly DiscoveredAgent[] }>;
	};
};
