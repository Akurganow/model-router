// The parts of OpenClaw's plugin API this adapter uses. Every source path below is a file of OpenClaw 2026.10.10.
// Nothing here imports OpenClaw. Every field OpenClaw may omit or vary is optional or `unknown`, so the adapter checks it.

// src/plugins/plugin-registration.types.ts.
export type RegistrationMode =
	| "full"
	| "discovery"
	| "tool-discovery"
	| "setup-only"
	| "setup-runtime"
	| "cli-metadata";

// src/plugins/logger-types.ts.
export type Logger = {
	debug?: (message: string) => void;
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
};

// src/config/zod-schema.agent-runtime.ts: the subagent settings of an agent or of the defaults.
export type SubagentSettings = {
	model?: unknown;
	thinking?: unknown;
};

// src/config/zod-schema.agent-entry-base.ts: the fields of an agent entry the adapter reads, from `agents.entries.<id>` or an `agents.list` item.
export type AgentEntry = {
	id?: unknown;
	description?: unknown;
	model?: unknown;
	subagents?: SubagentSettings;
};

// docs/plugins/hooks/reference.md: `plugins.entries.<id>.hooks`, in ms.
export type HookTimeoutSettings = {
	timeoutMs?: unknown;
	timeouts?: { before_tool_call?: unknown };
};

// src/config/types.openclaw.ts: the config paths the adapter reads.
export type OpenClawConfig = {
	agents?: {
		defaults?: { subagents?: SubagentSettings };
		entries?: Record<string, AgentEntry>;
		// The older roster, src/agents/agent-roster.ts: read when `entries` is absent.
		list?: AgentEntry[];
	};
	plugins?: {
		entries?: Record<
			string,
			{ hooks?: HookTimeoutSettings; config?: Record<string, unknown> }
		>;
	};
};

// src/agents/model-ref-shared.ts.
export type ModelRef = { provider: string; model: string };

// src/agents/model-selection-resolve.ts: a rejected model string comes back as `error`.
export type ResolvedModelRef =
	| { ref: ModelRef; key: string }
	| { error: string };

// src/plugins/runtime/types-core.ts: `RuntimeMutateConfigFileParams`, reduced; `afterWrite` is required there.
export type ConfigMutation = {
	afterWrite:
		| { mode: "auto" }
		| { mode: "restart"; reason: string }
		| { mode: "none"; reason: string };
	writeOptions?: { assertCurrent?: () => void };
	mutate: (draft: OpenClawConfig) => unknown;
};

// src/plugins/runtime/types-core.ts: the runtime members the adapter calls.
export type PluginRuntime = {
	config: {
		current: () => OpenClawConfig;
		mutateConfigFile: (params: ConfigMutation) => Promise<unknown>;
	};
	modelConfig: {
		resolveDefaultModelForAgent: (params: {
			cfg: OpenClawConfig;
			agentId?: string;
		}) => ModelRef;
		resolveAllowedModelRef: (params: {
			cfg: OpenClawConfig;
			catalog: readonly unknown[];
			raw: string;
			defaultProvider: string;
			defaultModel?: string;
			agentId?: string;
		}) => ResolvedModelRef;
	};
	modelAuth: {
		isProviderApiKeyConfiguredAsync: (params: {
			provider: string;
			cfg?: OpenClawConfig;
			agentDir?: string;
		}) => Promise<boolean>;
	};
	agent: { resolveAgentDir: (cfg: OpenClawConfig, agentId: string) => string };
};

// src/agents/tools/sessions-spawn-tool.ts: the `sessions_spawn` parameters the adapter reads.
export type SpawnParams = {
	task?: unknown;
	agentId?: unknown;
	model?: unknown;
	thinking?: unknown;
	runtime?: unknown;
	visible?: unknown;
	context?: unknown;
	mode?: unknown;
	thread?: unknown;
	label?: unknown;
	taskName?: unknown;
};

// src/plugins/hook-types.ts: `PluginHookBeforeToolCallEvent`.
export type BeforeToolCallEvent = {
	toolName: string;
	params: Record<string, unknown>;
	toolCallId?: string;
	runId?: string;
};

// src/plugins/hook-types.ts: `PluginHookToolContext`; `agentId` is the requester.
export type ToolContext = {
	toolName: string;
	agentId?: string;
	sessionKey?: string;
	abortSignal?: AbortSignal;
	toolCallId?: string;
	runId?: string;
};

// src/plugins/hook-before-tool-call-result.ts: the adapter returns `params` and nothing else, never `block`.
export type BeforeToolCallResult = { params?: Record<string, unknown> };

// src/plugins/hook-types.ts: the handler type for `before_tool_call`.
export type BeforeToolCallHandler = (
	event: BeforeToolCallEvent,
	ctx: ToolContext,
) => Promise<BeforeToolCallResult | undefined>;

// src/plugins/hook-types.ts: `PluginHookRegistrationOptions` with the tool matcher.
export type HookOptions = {
	matcher?: readonly [string, ...string[]];
	priority?: number;
	timeoutMs?: number;
};

// src/agents/tools/common.ts: the result of a plugin tool.
export type ToolResult = {
	content: { type: "text"; text: string }[];
	details?: unknown;
};

// src/agents/tools/common.ts: `AnyAgentTool` as a plugin registers it.
export type ToolDefinition = {
	name: string;
	label: string;
	description: string;
	parameters: unknown;
	execute: (
		toolCallId: string,
		params: unknown,
		signal?: AbortSignal,
	) => Promise<ToolResult>;
};

// src/plugins/plugin-command.types.ts: `PluginCommandContext`, reduced; the owner flag tells who may write.
export type CommandContext = {
	channel: string;
	isAuthorizedSender: boolean;
	senderIsOwner?: boolean;
	assertOwnerCurrent?: () => void;
	agentId?: string;
	args?: string;
	commandBody: string;
	config: OpenClawConfig;
};

// src/plugins/plugin-command.types.ts: `PluginCommandResult`, reduced to its reply text.
export type CommandResult = { text?: string };

// src/plugins/plugin-command.types.ts: `OpenClawPluginCommandDefinition`.
export type CommandDefinition = {
	name: string;
	description: string;
	acceptsArgs?: boolean;
	requiredScopes?: readonly string[];
	handler: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
};

// src/plugins/plugin-api.types.ts: `OpenClawPluginApi`, reduced to the members the adapter uses.
export type OpenClawApi = {
	id: string;
	registrationMode: RegistrationMode;
	config: OpenClawConfig;
	pluginConfig?: Record<string, unknown>;
	logger: Logger;
	runtime: PluginRuntime;
	on: (
		hookName: "before_tool_call",
		handler: BeforeToolCallHandler,
		options?: HookOptions,
	) => void;
	registerTool: (tool: ToolDefinition) => void;
	registerCommand: (command: CommandDefinition) => void;
};
