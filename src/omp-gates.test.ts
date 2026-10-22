import assert from "node:assert/strict";
import { test } from "node:test";
import { KEY, KEY_VARIABLE, setEnv, useWorld } from "./omp-fakes.ts";
import { checkGates } from "./omp-gates.ts";

const world = useWorld();
const ENV_KEY = "env-key-0002";

const ctx = () =>
	({
		cwd: "/work",
		hasUI: true,
		ui: { notify: () => undefined },
		modelRegistry: { getApiKeyForProvider: () => world.credential() },
		models: {
			resolve: (spec: string) => (world.resolvable.has(spec) ? {} : undefined),
		},
	}) as const;
const gates = () => checkGates(world.lookup, world.pi, ctx());

test("with every gate open the key comes back", async () => {
	assert.deepEqual(await gates(), { key: KEY });
});

test("omp's credential wins over the variable", async () => {
	setEnv(KEY_VARIABLE, ENV_KEY);
	assert.deepEqual(await gates(), { key: KEY });
});

for (const [name, credential] of [
	["is missing", async () => undefined],
	["is empty", async () => ""],
	[
		"throws",
		async () => {
			throw new Error("store locked");
		},
	],
] as const)
	test(`the variable stands in when omp's credential ${name}`, async () => {
		setEnv(KEY_VARIABLE, ENV_KEY);
		world.credential = credential;
		assert.deepEqual(await gates(), { key: ENV_KEY });
	});

test("no credential and no variable close the gate", async () => {
	world.credential = async () => undefined;
	assert.deepEqual(await gates(), { closed: "key unset" });
	setEnv(KEY_VARIABLE, "");
	assert.deepEqual(await gates(), { closed: "key unset" });
});

const closers: [string, string, () => void][] = [
	[
		"a task model role",
		"task model role set",
		() => (world.config.modelRoles = { task: "anthropic/claude-x" }),
	],
	[
		"a task model override",
		"task model override set",
		() => (world.config["task.agentModelOverrides"] = { task: "m" }),
	],
	[
		"task among the disabled agents",
		"task agent disabled",
		() => (world.config["task.disabledAgents"] = ["scout", "task"]),
	],
	["no task agent", "custom task agent", () => (world.agents = [])],
	[
		"a project task agent",
		"custom task agent",
		() => (world.agents = [{ name: "task", source: "project" }]),
	],
	[
		"neither role resolving",
		"no @smol or @slow model",
		() => world.resolvable.clear(),
	],
	[
		"a model role value of the wrong type",
		"settings unreadable",
		() => (world.config.modelRoles = "x"),
	],
	[
		"an unknown settings id",
		"settings unreadable",
		() => (world.config["task.agentModelOverrides"] = undefined),
	],
	[
		"a disabled list of the wrong type",
		"settings unreadable",
		() => (world.config["task.disabledAgents"] = "task"),
	],
	[
		"a task role of the wrong type",
		"task model role set",
		() => (world.config.modelRoles = { task: 3 }),
	],
];
for (const [name, reason, close] of closers)
	test(`${name} closes the gate`, async () => {
		close();
		assert.deepEqual(await gates(), { closed: reason });
	});

test("an empty or blank task role leaves the gate open", async () => {
	for (const task of ["", "  ", null]) {
		world.config.modelRoles = { task };
		assert.deepEqual(await gates(), { key: KEY });
	}
});

test("one resolving role is enough", async () => {
	world.resolvable = new Set(["@slow"]);
	assert.deepEqual(await gates(), { key: KEY });
});

test("a throwing lookup, discovery or resolver closes the gate", async () => {
	const throws = () => {
		throw new Error("boom");
	};
	const lookup = () => ({ get: throws });
	assert.deepEqual(await checkGates(lookup, world.pi, ctx()), {
		closed: "settings unreadable",
	});
	const pi = { ...world.pi, pi: { ...world.pi.pi, discoverAgents: throws } };
	assert.deepEqual(await checkGates(world.lookup, pi, ctx()), {
		closed: "custom task agent",
	});
	const broken = { ...ctx(), models: { resolve: throws } };
	assert.deepEqual(await checkGates(world.lookup, world.pi, broken), {
		closed: "no @smol or @slow model",
	});
});
