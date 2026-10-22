import { afterEach, beforeEach, mock } from "node:test";
import type {
	Context,
	Lookup,
	Pi,
	SpawnEvent,
	SpawnResult,
	ToolCallEvent,
	ToolProgressEvent,
} from "./omp-types.ts";

export const KEY = "omp-key-0001";
export const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export const KEY_VARIABLE = "TYPESAFE_API_KEY";

export function setEnv(name: string, value: string | undefined): void {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

export type Sent = { url: string; body: unknown; authorization: string };
type Answer = (
	sent: Sent,
	count: number,
	signal: AbortSignal,
) => Promise<Response>;

// The fake settings hold the three values the gates read. Setting a key to undefined makes it unreadable.
export type Config = {
	modelRoles: unknown;
	"task.agentModelOverrides": unknown;
	"task.disabledAgents": unknown;
};

export function streamed(status: number, body: unknown): Response {
	const bytes = new TextEncoder().encode(
		typeof body === "string" ? body : JSON.stringify(body),
	);
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(bytes);
				controller.close();
			},
		}),
		{ status, headers: { "content-type": "application/json" } },
	);
}

const spread = (level: number) => ({
	0: level === 0 ? 0.9 : 0.05,
	1: level === 1 ? 0.9 : 0.05,
	2: level === 2 ? 0.9 : 0.05,
});

export const jevAnswer = (level: number) => ({
	model: "jev-1.14.0",
	usage: { input_tokens: 812, output_tokens: 9 },
	answers: { tier: { type: "score", probabilities: spread(level) } },
});

// A task text holding `level0`, `level1` or `level2` gets that level from the fake Jev. Others get level 1.
export const answerByTask: Answer = async ({ body }) => {
	const { task } = (body as { state: { task: string } }).state;
	return streamed(200, jevAnswer(Number(/level([012])/.exec(task)?.[1] ?? 1)));
};

export type World = ReturnType<typeof useWorld>;

export function useWorld() {
	const state = {
		notes: [] as string[],
		stderr: [] as string[],
		sent: [] as Sent[],
		config: {} as Config,
		agents: [] as { name: string; source: string }[],
		resolvable: new Set<string>(),
		credential: (async () => KEY) as () => Promise<string | undefined>,
		answer: answerByTask as Answer,
		hasUI: true,
		handlers: {} as Record<string, (...args: never[]) => unknown>,
	};

	let savedKey: string | undefined;
	beforeEach(() => {
		savedKey = process.env[KEY_VARIABLE];
		setEnv(KEY_VARIABLE, undefined);
		state.notes = [];
		state.stderr = [];
		state.sent = [];
		state.config = {
			modelRoles: {},
			"task.agentModelOverrides": {},
			"task.disabledAgents": [],
		};
		state.agents = [{ name: "task", source: "bundled" }];
		state.resolvable = new Set(["@smol", "@slow"]);
		state.credential = async () => KEY;
		state.answer = answerByTask;
		state.hasUI = true;
		state.handlers = {};
		mock.method(process.stderr, "write", (text: string) => {
			state.stderr.push(text);
			return true;
		});
		mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
			// Like the real fetch, an aborted signal fails before anything is sent.
			init.signal?.throwIfAborted();
			const headers = new Headers(init.headers);
			const sent: Sent = {
				url,
				body: JSON.parse(String(init.body)),
				authorization: headers.get("authorization") ?? "",
			};
			state.sent.push(sent);
			return state.answer(sent, state.sent.length, init.signal as AbortSignal);
		});
	});
	afterEach(() => {
		mock.restoreAll();
		setEnv(KEY_VARIABLE, savedKey);
	});

	const lookup: Lookup = (id) => {
		const value = (state.config as Record<string, unknown>)[id];
		return value === undefined ? undefined : { get: () => value };
	};
	const pi: Pi = {
		on: (event, handler) => {
			state.handlers[event] = handler as never;
		},
		pi: {
			settings: {},
			discoverAgents: async () => ({ agents: state.agents }),
		},
	};
	const ctx = (): Context => ({
		cwd: "/work",
		hasUI: state.hasUI,
		ui: { notify: (message) => void state.notes.push(message) },
		modelRegistry: { getApiKeyForProvider: () => state.credential() },
		models: {
			resolve: (spec) => (state.resolvable.has(spec) ? {} : undefined),
		},
	});
	const call = <T>(name: string, ...args: unknown[]) =>
		(state.handlers[name] as (...a: unknown[]) => T)(...args);
	// The handler as omp would call it, with whatever arguments the test hands it.
	const handler =
		(name: string) =>
		(...args: unknown[]) =>
			call<Promise<unknown>>(name, ...args);

	return Object.assign(state, {
		handler,
		lookup,
		pi,
		toolCall: (id: string, input: unknown, toolName = "task") =>
			call<Promise<undefined>>(
				"tool_call",
				{
					toolName,
					toolCallId: id,
					input,
				} satisfies ToolCallEvent,
				ctx(),
			),
		update: (id: string, progress: unknown[]) =>
			call<Promise<void>>("tool_execution_update", {
				toolName: "task",
				toolCallId: id,
				partialResult: { details: { progress } },
			} satisfies ToolProgressEvent),
		end: (id: string, progress?: unknown[]) =>
			call<Promise<void>>("tool_execution_end", {
				toolName: "task",
				toolCallId: id,
				result: { details: { progress } },
			} satisfies ToolProgressEvent),
		spawn: (spawnKey: string | undefined, extra: Partial<SpawnEvent> = {}) =>
			call<Promise<SpawnResult | undefined>>(
				"before_subagent_spawn",
				{
					agent: "task",
					invocationKind: "task",
					...(spawnKey === undefined ? {} : { spawnKey }),
					...extra,
				} satisfies SpawnEvent,
				ctx(),
			),
	});
}
