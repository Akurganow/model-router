import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
	KEY,
	KEY_VARIABLE,
	lockfileWith,
	OR_KEY,
	OR_VARIABLE,
	setEnv,
	useWorld,
} from "./omp-fakes.ts";
import { checkGates } from "./omp-gates.ts";
import { plan } from "./provider.ts";

const world = useWorld();
const ENV_KEY = "env-key-0002";
const OR_ENV_KEY = "env-or-key-0004";
const TS_ONLY = { typesafe: true, openrouter: false };
const OR_ONLY = { typesafe: false, openrouter: true };
const open = (key = KEY) => ({
	attempts: plan("typesafe", TS_ONLY),
	keys: { typesafe: key },
});
const openOr = (key = OR_KEY) => ({
	attempts: plan("openrouter", OR_ONLY),
	keys: { openrouter: key },
});

const ctx = () =>
	({
		cwd: "/work",
		hasUI: true,
		ui: { notify: () => undefined },
		modelRegistry: {
			getApiKeyForProvider: (provider: string) => {
				world.asked.push(provider);
				return world.credential(provider);
			},
		},
		models: {
			resolve: (spec: string) => (world.resolvable.has(spec) ? {} : undefined),
		},
	}) as const;
const gates = () => checkGates(world.imports, world.pi, ctx());
const throws = () => {
	throw new Error("boom");
};

test("with every gate open the attempts and their key come back", async () => {
	assert.deepEqual(await gates(), open());
});

test("omp's credential wins over the variable", async () => {
	setEnv(KEY_VARIABLE, ENV_KEY);
	assert.deepEqual(await gates(), open());
});

test("omp's OpenRouter credential wins over its variable", async () => {
	world.lockfile = lockfileWith("openrouter");
	setEnv(OR_VARIABLE, OR_ENV_KEY);
	assert.deepEqual(await gates(), openOr());
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
	test(`each variable stands in when omp's credential ${name}`, async () => {
		setEnv(KEY_VARIABLE, ENV_KEY);
		setEnv(OR_VARIABLE, OR_ENV_KEY);
		world.credential = credential;
		assert.deepEqual(await gates(), open(ENV_KEY));
		world.lockfile = lockfileWith("openrouter");
		assert.deepEqual(await gates(), openOr(OR_ENV_KEY));
	});

test("no credential and no variable close the gate", async () => {
	world.credential = async () => undefined;
	assert.deepEqual(await gates(), { closed: "key unset" });
	setEnv(KEY_VARIABLE, "");
	assert.deepEqual(await gates(), { closed: "key unset" });
	world.lockfile = lockfileWith("openrouter");
	setEnv(KEY_VARIABLE, ENV_KEY);
	assert.deepEqual(await gates(), { closed: "key unset" });
});

test("the default reads no OpenRouter credential and no OpenRouter variable", async () => {
	const read: (string | symbol)[] = [];
	const env = new Proxy(process.env, {
		get: (target, name) => {
			read.push(name);
			return Reflect.get(target, name);
		},
	});
	mock.property(process, "env", env);
	world.credential = async () => undefined;
	setEnv(KEY_VARIABLE, ENV_KEY);
	assert.deepEqual(await gates(), open(ENV_KEY));
	assert.deepEqual(world.asked, ["typesafe"]);
	assert.ok(read.includes(KEY_VARIABLE));
	assert.ok(!read.includes(OR_VARIABLE));
});

test("both providers in order, each with its own key", async () => {
	world.lockfile = lockfileWith("openrouter-first");
	const both = { typesafe: true, openrouter: true };
	assert.deepEqual(await gates(), {
		attempts: plan("openrouter-first", both),
		keys: { openrouter: OR_KEY, typesafe: KEY },
	});
	assert.deepEqual(world.asked, ["openrouter", "typesafe"]);
});

test("a two-provider value with one key present plans that provider alone", async () => {
	world.lockfile = lockfileWith("auto");
	world.credential = async (provider) =>
		provider === "openrouter" ? OR_KEY : undefined;
	assert.deepEqual(await gates(), openOr());
});

// The full table lives with narrow(); these pairs show the reads reach it.
const narrowing: [string, unknown, unknown, string[]][] = [
	["global auto alone", "auto", undefined, ["typesafe", "openrouter"]],
	["a project narrowing auto", "auto", "openrouter", ["openrouter"]],
	[
		"a project narrowing openrouter-first",
		"openrouter-first",
		"typesafe",
		["typesafe"],
	],
	["a project swapping providers", "typesafe", "openrouter", ["typesafe"]],
	[
		"a project reordering",
		"auto",
		"openrouter-first",
		["typesafe", "openrouter"],
	],
	["a project value with no global", undefined, "openrouter", ["typesafe"]],
	["an unknown global", "everything", undefined, ["typesafe"]],
];
for (const [name, global, project, providers] of narrowing)
	test(`settings: ${name}`, async () => {
		world.lockfile = lockfileWith(global);
		if (project !== undefined) world.project = { provider: project };
		const result = await gates();
		assert.ok("attempts" in result);
		assert.deepEqual(
			result.attempts.map((a) => a.provider),
			providers,
		);
		assert.deepEqual(world.asked, providers);
	});

test("a missing lockfile or a value stored under another name means typesafe", async () => {
	world.lockfile = undefined;
	assert.deepEqual(await gates(), open());
	world.lockfile = lockfileWith("openrouter", "model-router");
	assert.deepEqual(await gates(), open());
});

test("a settings read that throws closes the gate and reads no key", async () => {
	for (const imports of [
		{ ...world.imports, getPluginSettings: async () => throws() },
		{ ...world.imports, getPluginsLockfile: throws },
	])
		assert.deepEqual(await checkGates(imports, world.pi, ctx()), {
			closed: "settings unreadable",
		});
	world.lockfile = "{ not json";
	assert.deepEqual(await gates(), { closed: "settings unreadable" });
	assert.deepEqual(world.asked, []);
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
		assert.deepEqual(await gates(), open());
	}
});

test("one resolving role is enough", async () => {
	world.resolvable = new Set(["@slow"]);
	assert.deepEqual(await gates(), open());
});

test("a throwing lookup, discovery or resolver closes the gate", async () => {
	const lookup = () => ({ get: throws });
	assert.deepEqual(
		await checkGates({ ...world.imports, lookup }, world.pi, ctx()),
		{ closed: "settings unreadable" },
	);
	const pi = { ...world.pi, pi: { ...world.pi.pi, discoverAgents: throws } };
	assert.deepEqual(await checkGates(world.imports, pi, ctx()), {
		closed: "custom task agent",
	});
	const broken = { ...ctx(), models: { resolve: throws } };
	assert.deepEqual(await checkGates(world.imports, world.pi, broken), {
		closed: "no @smol or @slow model",
	});
});
