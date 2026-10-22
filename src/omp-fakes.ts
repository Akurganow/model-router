import { afterEach, beforeEach, mock } from "node:test";
import { oneChunk } from "./omp-score.ts";
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

type Sent = { url: string; body: unknown; authorization: string };
type Answer = (
	sent: Sent,
	count: number,
	signal: AbortSignal,
) => Promise<Response>;

// The fake settings hold the three values the gates read. Setting a key to undefined makes it unreadable.
type Config = {
	modelRoles: unknown;
	"task.agentModelOverrides": unknown;
	"task.disabledAgents": unknown;
};

export function streamed(
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
): Response {
	const bytes = new TextEncoder().encode(
		typeof body === "string" ? body : JSON.stringify(body),
	);
	return new Response(oneChunk(bytes), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
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
const answerByTask: Answer = async ({ body }) => {
	const { task } = (body as { state: { task: string } }).state;
	return streamed(200, jevAnswer(Number(/level([012])/.exec(task)?.[1] ?? 1)));
};

const newState = () => ({
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
});
type State = ReturnType<typeof newState>;

const freshConfig = (): Config => ({
	modelRoles: {},
	"task.agentModelOverrides": {},
	"task.disabledAgents": [],
});

function reset(state: State): void {
	Object.assign(state, newState(), {
		config: freshConfig(),
		agents: [{ name: "task", source: "bundled" }],
		resolvable: new Set(["@smol", "@slow"]),
	});
}

const fakeFetch = (state: State) => async (url: string, init: RequestInit) => {
	// Like the real fetch, an aborted signal fails before anything is sent.
	init.signal?.throwIfAborted();
	const sent: Sent = {
		url,
		body: JSON.parse(String(init.body)),
		authorization: new Headers(init.headers).get("authorization") ?? "",
	};
	state.sent.push(sent);
	return state.answer(sent, state.sent.length, init.signal as AbortSignal);
};

const buildLookup =
	(state: State): Lookup =>
	(id) => {
		const value = (state.config as Record<string, unknown>)[id];
		return value === undefined ? undefined : { get: () => value };
	};

const buildPi = (state: State): Pi => ({
	on: (event, handler) => {
		state.handlers[event] = handler as never;
	},
	pi: {
		settings: {},
		discoverAgents: async () => ({ agents: state.agents }),
	},
});

const buildCtx = (state: State) => (): Context => ({
	cwd: "/work",
	hasUI: state.hasUI,
	ui: { notify: (message) => void state.notes.push(message) },
	modelRegistry: { getApiKeyForProvider: () => state.credential() },
	models: {
		resolve: (spec) => (state.resolvable.has(spec) ? {} : undefined),
	},
});

const buildEvents = (state: State) => {
	const ctx = buildCtx(state);
	const call = <T>(name: string, ...args: unknown[]) =>
		(state.handlers[name] as (...a: unknown[]) => T)(...args);
	return {
		// The handler as omp would call it, with whatever arguments the test hands it.
		handler:
			(name: string) =>
			(...args: unknown[]) =>
				call<Promise<unknown>>(name, ...args),
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
	};
};

export function useWorld() {
	const state = newState();
	let savedKey: string | undefined;
	beforeEach(() => {
		savedKey = process.env[KEY_VARIABLE];
		setEnv(KEY_VARIABLE, undefined);
		reset(state);
		mock.method(process.stderr, "write", (text: string) => {
			state.stderr.push(text);
			return true;
		});
		mock.method(globalThis, "fetch", fakeFetch(state));
	});
	afterEach(() => {
		mock.restoreAll();
		setEnv(KEY_VARIABLE, savedKey);
	});

	return Object.assign(state, buildEvents(state), {
		lookup: buildLookup(state),
		pi: buildPi(state),
	});
}
