import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, mock } from "node:test";
import extension from "../extension/index.ts";
import type {
	Context,
	ModelLike,
	ToolCallEvent,
	ToolCallResult,
} from "../extension/types.ts";

export const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const REGISTRY_KEY = "registry-key-0001";
export const ENV_KEY = "env-key-0002";

const ENV_NAMES = ["HOME", "TYPESAFE_API_KEY", "TYPESAFE_BASE_URL"] as const;

type Reply = { ok: boolean; status: number; text(): Promise<string> };
export type Call = {
	url: string;
	init: {
		headers: { Authorization: string };
		body: string;
		signal: AbortSignal;
	};
	body: {
		model: string;
		state: { role: string; description: string; task: string };
	};
};
export type Responder = (call: Call, n: number) => Promise<Reply> | Reply;
export type KeyLookup = () => Promise<string | undefined>;

export const reply = (text: string, status = 200): Reply => ({
	ok: status >= 200 && status < 300,
	status,
	text: async () => text,
});

const spread = (chosen: number, high: number, low: number) => ({
	0: chosen === 0 ? high : low,
	1: chosen === 1 ? high : low,
	2: chosen === 2 ? high : low,
});

// A tier and a work index for Jev to pick, with the answering model and usage.
export const jevAnswer = (tier: number, work: number): string =>
	JSON.stringify({
		model: "jev-1.14.0",
		usage: { input_tokens: 812, output_tokens: 9 },
		answers: {
			tier: { type: "score", probabilities: spread(tier, 0.9, 0.05) },
			work: { type: "score", probabilities: spread(work, 0.8, 0.1) },
		},
	});

export const fixtureEvents = (): ToolCallEvent[] =>
	JSON.parse(
		readFileSync(
			join(import.meta.dirname, "fixtures", "tool-call-task.json"),
			"utf8",
		),
	).events;

export const taskEvent = (input: Record<string, unknown>): ToolCallEvent => ({
	type: "tool_call",
	toolName: "task",
	toolCallId: "<tool-call-id>",
	input,
});

export type World = {
	root: string;
	home: string;
	project: string;
	notes: string[];
	stderr: string[];
	calls: Call[];
	// What omp's task tool shows: whether its schema offers `effort`, and the `task` agent's description.
	taskTool: { effortEnabled: boolean; taskDescription: string };
	put(path: string, text: string): void;
	fetchWith(responder: Responder): void;
	makeCtx(options?: {
		hasUI?: boolean;
		cwd?: string;
		key?: KeyLookup;
		notify?: (message: string) => void;
		models?: Record<string, ModelLike>;
	}): Context;
	run(
		input: Record<string, unknown>,
		options?: Parameters<World["makeCtx"]>[0],
	): Promise<ToolCallResult | undefined>;
};

export function useWorld(): World {
	const saved = new Map<string, string | undefined>();
	const realFetch = globalThis.fetch;
	const world = {} as World;

	beforeEach(() => {
		for (const name of ENV_NAMES) saved.set(name, process.env[name]);
		world.root = mkdtempSync(join(tmpdir(), "omp-ext-"));
		world.home = join(world.root, "home");
		world.project = join(world.root, "project");
		mkdirSync(world.home);
		mkdirSync(world.project);
		for (const name of ENV_NAMES) setEnv(name, undefined);
		setEnv("HOME", world.home);
		world.notes = [];
		world.stderr = [];
		world.calls = [];
		world.taskTool = {
			effortEnabled: true,
			taskDescription: BUNDLED_TASK_DESCRIPTION,
		};
		mock.method(process.stderr, "write", (text: string) => {
			world.stderr.push(text);
			return true;
		});
		world.fetchWith((_call) => reply(jevAnswer(0, 0)));
	});

	afterEach(() => {
		mock.restoreAll();
		globalThis.fetch = realFetch;
		for (const [name, value] of saved) setEnv(name, value);
		rmSync(world.root, { recursive: true, force: true });
	});

	world.put = (path, text) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, text);
	};
	world.fetchWith = (responder) => {
		globalThis.fetch = (async (
			url: string,
			init: Call["init"],
		): Promise<Reply> => {
			const call: Call = { url, init, body: JSON.parse(init.body) };
			world.calls.push(call);
			return responder(call, world.calls.length - 1);
		}) as unknown as typeof fetch;
	};
	world.makeCtx = ({ hasUI = true, cwd, key, notify, models } = {}) => ({
		hasUI,
		...(models ? { models: { resolve: (spec: string) => models[spec] } } : {}),
		cwd: cwd ?? world.project,
		ui: { notify: notify ?? ((message) => void world.notes.push(message)) },
		modelRegistry: {
			getApiKeyForProvider: key ?? (async () => REGISTRY_KEY),
		},
	});
	world.run = (input, options) => {
		const handlers: Parameters<Parameters<typeof extension>[0]["on"]>[1][] = [];
		extension({
			on: (_event, handler) => void handlers.push(handler),
			getAllTools: () => [taskToolInfo(world.taskTool)],
		});
		return handlers[0]?.(taskEvent(input), world.makeCtx(options)) as Promise<
			ToolCallResult | undefined
		>;
	};
	return world;
}

export const BUNDLED_TASK_DESCRIPTION =
	"General-purpose subagent with full capabilities for delegated multi-step tasks";

// Shaped like omp's task tool: an omptype schema with toJsonSchema() and the rendered agent list.
export const taskToolInfo = ({
	effortEnabled,
	taskDescription,
}: World["taskTool"]) => {
	const item = {
		agent: { type: "string" },
		task: { type: "string" },
		...(effortEnabled ? { effort: { enum: ["lo", "med", "hi"] } } : {}),
	};
	const json = {
		type: "object",
		properties: {
			context: { type: "string" },
			tasks: { type: "array", items: { type: "object", properties: item } },
		},
	};
	return {
		name: "task",
		description: `Run subagents.\n### task\n${taskDescription}\n### scout (READ-ONLY)\nFast read-only scout.`,
		parameters: Object.assign(() => true, { toJsonSchema: () => json }),
	};
};

export const setEnv = (name: string, value: string | undefined): void => {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
};

export const tasksOf = (result: ToolCallResult | undefined): unknown[] => {
	const tasks = result?.input?.tasks;
	return Array.isArray(tasks) ? tasks : [];
};
