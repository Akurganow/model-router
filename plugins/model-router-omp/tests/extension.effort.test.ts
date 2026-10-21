import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { chooseEffort, chooseLightEffort } from "../extension/effort.ts";
import { readTaskTool } from "../extension/task-tool.ts";
import {
	BUNDLED_TASK_DESCRIPTION,
	jevAnswer,
	reply,
	tasksOf,
	taskToolInfo,
	useWorld,
} from "./helpers.ts";

const world = useWorld();

const FOUR = {
	reasoning: true,
	thinking: { efforts: ["low", "medium", "high", "xhigh"] },
};
const lastLine = () => world.notes.at(-1) ?? "";
const ROUTED_ONLY = [{ task: "Do it", agent: "router_light" }];

describe("effort mode follows omp's task tool", () => {
	test("when the task tool offers no effort, the router sets the agent and leaves effort to omp", async () => {
		world.taskTool.effortEnabled = false;
		const result = await world.run({ tasks: [{ task: "Do it" }] });
		assert.deepEqual(tasksOf(result), ROUTED_ONLY);
		assert.match(lastLine(), /L0 router_light · auto · p=/);
	});

	test("a caller's effort stays in either mode", async () => {
		world.taskTool.effortEnabled = false;
		const result = await world.run({
			tasks: [{ task: "Do it", effort: "hi" }],
		});
		assert.deepEqual(tasksOf(result), [
			{ task: "Do it", effort: "hi", agent: "router_light" },
		]);
		assert.match(lastLine(), / · caller effort · /);
	});
});

describe("the line shows the level omp applies", () => {
	test("med on a four-level model reads med→medium", async () => {
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_light": FOUR } },
		);
		assert.match(lastLine(), / · med→medium · /);
	});

	test("the agent's next selector stands in for an unset role", async () => {
		world.fetchWith(() => reply(jevAnswer(2, 2)));
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@slow": FOUR } },
		);
		assert.match(lastLine(), /L2 router_heavy · hi→xhigh · /);
	});
});

describe("chooseEffort mirrors omp's mapping", () => {
	const even = {
		reasoning: true,
		thinking: { efforts: ["low", "medium", "high", "xhigh"] },
	};
	const odd = {
		reasoning: true,
		thinking: { efforts: ["low", "medium", "high"] },
	};
	test("lo, med and hi take the lowest, middle and highest level", () => {
		assert.deepEqual(chooseEffort("lo", odd), {
			effort: "lo",
			shown: "lo→low",
			applied: "low",
		});
		assert.deepEqual(chooseEffort("med", odd), {
			effort: "med",
			shown: "med→medium",
			applied: "medium",
		});
		assert.deepEqual(chooseEffort("hi", odd), {
			effort: "hi",
			shown: "hi→high",
			applied: "high",
		});
	});
	test("med on an even range takes the lower middle", () => {
		assert.deepEqual(chooseEffort("med", even), {
			effort: "med",
			shown: "med→medium",
			applied: "medium",
		});
	});
	test("an unknown or non-reasoning model shows the request only", () => {
		assert.deepEqual(chooseEffort("med", undefined), {
			effort: "med",
			shown: "med",
		});
		assert.deepEqual(chooseEffort("med", { reasoning: false }), {
			effort: "med",
			shown: "med",
		});
	});
});

describe("the light tier never runs at the model's lowest level", () => {
	const two = { reasoning: true, thinking: { efforts: ["low", "high"] } };
	const haiku = {
		reasoning: true,
		thinking: { efforts: ["minimal", "low", "medium", "high"] },
	};
	test("med that lands on the lowest level moves up to hi", () => {
		assert.deepEqual(chooseLightEffort("med", two), {
			effort: "hi",
			shown: "hi→high",
			applied: "high",
		});
	});
	test("med above the lowest level stays", () => {
		assert.deepEqual(chooseLightEffort("med", haiku), {
			effort: "med",
			shown: "med→low",
			applied: "low",
		});
	});
	test("the router applies it to router_light only", async () => {
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_light": two } },
		);
		assert.match(lastLine(), /L0 router_light · hi→high · /);
		world.fetchWith(() => reply(jevAnswer(1, 1)));
		await world.run(
			{ tasks: [{ task: "Do it" }] },
			{ models: { "@router_mid": two } },
		);
		assert.match(lastLine(), /L1 router_mid · med→low · /);
	});
});

describe("readTaskTool", () => {
	const piWith = (tools: unknown[]) =>
		({ on() {}, getAllTools: () => tools }) as never;
	test("reads the effort field from an omptype schema", () => {
		const tool = taskToolInfo({
			effortEnabled: true,
			taskDescription: BUNDLED_TASK_DESCRIPTION,
		});
		assert.deepEqual(readTaskTool(piWith([tool])), {
			effortEnabled: true,
			customTaskAgent: false,
		});
	});
	test("reads the effort field from plain JSON Schema", () => {
		const tool = taskToolInfo({
			effortEnabled: true,
			taskDescription: BUNDLED_TASK_DESCRIPTION,
		});
		const plain = {
			...tool,
			parameters: (
				tool.parameters as { toJsonSchema(): unknown }
			).toJsonSchema(),
		};
		assert.equal(readTaskTool(piWith([plain])).effortEnabled, true);
	});
	test("a different description under the task heading marks the user's own agent", () => {
		const tool = taskToolInfo({
			effortEnabled: false,
			taskDescription: "My own task agent.",
		});
		assert.deepEqual(readTaskTool(piWith([tool])), {
			effortEnabled: false,
			customTaskAgent: true,
		});
	});
	test("an agent whose name starts with task- is not the task agent", () => {
		const tool = taskToolInfo({
			effortEnabled: false,
			taskDescription: BUNDLED_TASK_DESCRIPTION,
		});
		const planner = {
			...tool,
			description: `### task-planner\nPlans.\n${tool.description}`,
		};
		assert.equal(readTaskTool(piWith([planner])).customTaskAgent, false);
	});
	test("no task tool, or no tool list at all, reads as neither", () => {
		const neither = { effortEnabled: false, customTaskAgent: false };
		assert.deepEqual(readTaskTool(piWith([])), neither);
		assert.deepEqual(readTaskTool({ on() {} } as never), neither);
	});
	test("a tool list that throws reads as neither", () => {
		const broken = {
			on() {},
			getAllTools: () => {
				throw new Error("x");
			},
		} as never;
		assert.deepEqual(readTaskTool(broken), {
			effortEnabled: false,
			customTaskAgent: false,
		});
	});
});
