// The mods API and hook types this adapter uses. The bundle must not depend on the generated declarations.
export type Timer = { cancel(): void };
export type HttpInit = {
	method?: string | undefined;
	headers?: Record<string, string> | undefined;
	body?: string | undefined;
};
export type HttpReply = {
	status: number;
	ok: boolean;
	headers: Record<string, string>;
	text: string;
};
export type Engine = {
	clock: {
		after(ms: number, fn: () => void): Timer;
		sleep(ms: number, options: { signal: AbortSignal }): Promise<void>;
	};
	env: { get(name: string): Promise<string | undefined> };
	config: {
		set(row: { key: string; value: string }): Promise<{ deny?: string }>;
	};
	http: { fetch(url: string, init?: HttpInit): Promise<HttpReply> };
	tool: {
		check(call: {
			tool: string;
			input: Record<string, unknown>;
		}): Promise<{ decision: string }>;
		register(spec: {
			name: string;
			description: string;
			inputSchema: Record<string, unknown>;
		}): Promise<unknown>;
	};
	ui: {
		log(text: string, options?: { to: "debug" }): Promise<unknown>;
		ask(
			question: string,
			options: { options?: readonly string[]; header: string },
		): Promise<string>;
	};
};
export type Outcome = { readonly deny?: string };
export type Next = {
	(e: unknown): Promise<Outcome>;
	readonly signal: AbortSignal;
};
export type Hook<E, R = Outcome> = ($: Engine, e: E, next: Next) => Promise<R>;
export type CommandRun = {
	command: string;
	args: string;
	origin: { kind: string };
};
export type CommandOutput = { text: string };
export type SessionStart = { cwd: string };
// A tool the plugin registered answers with its result, or refuses the call.
export type ToolAnswer = { result: string } | { deny: string };
export type ConfigCall = ReservedKeys & { setting?: unknown };
export type AgentOffer = { agent: string; source: string; description: string };
// The keys every tool.call carries beside the tool's own arguments.
export type ReservedKeys = {
	tool: string;
	tool_use_id?: string;
	agentId?: string;
	requestMeta?: unknown;
};
export type AgentCall = ReservedKeys & {
	tool: "Agent";
	prompt: string;
	description: string;
	subagent_type?: string;
	name?: string;
	model?: string;
	effort?: string;
};
export type On = {
	(
		event: "session.start",
		hook: Hook<SessionStart>,
	): { catch(handler: Hook<unknown>): unknown };
	(
		event: "agent.offer",
		hook: Hook<AgentOffer>,
	): { catch(handler: Hook<unknown>): unknown };
	(
		event: "tool.call",
		matcher: { tool: "Agent" },
		hook: Hook<AgentCall>,
	): { catch(handler: Hook<unknown>): unknown };
	(
		event: "tool.call",
		matcher: { tool: `mcp__${string}` },
		hook: Hook<ConfigCall, ToolAnswer>,
	): { catch(handler: Hook<unknown>): unknown };
	(
		event: "command.run",
		matcher: { command: string },
		hook: Hook<CommandRun, CommandOutput>,
	): { catch(handler: Hook<unknown>): unknown };
};
export type Options = {
	readonly api_key?: unknown;
	readonly openrouter_api_key?: unknown;
	readonly provider?: unknown;
	readonly scope?: unknown;
};

export function passOn(_: Engine, e: unknown, next: Next): Promise<Outcome> {
	return next(e);
}

// A call the user's rules deny as Claude made it never leaves the machine. The check opens no dialog.
export async function denied($: Engine, call: ReservedKeys): Promise<boolean> {
	const {
		tool,
		tool_use_id: _id,
		agentId: _agentId,
		requestMeta: _meta,
		...input
	} = call;
	return (await $.tool.check({ tool, input })).decision === "deny";
}
