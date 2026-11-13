import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { plan } from "../../core/provider.ts";
import {
	agentDiscoveryFailed,
	agentUnknown,
	KEY_UNSET,
	outsideCoreScope,
	setsOwnModel,
	UNREADABLE,
} from "../../core/reasons.ts";
import { AGENTS, extend } from "./fake-agents.ts";
import {
	KEY,
	KEY_VARIABLE,
	lockfileWith,
	OR_KEY,
	OR_VARIABLE,
	setEnv,
	throws,
	unreadable,
	useWorld,
} from "./fakes.ts";
import { checkGates, slotModel } from "./gates.ts";

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

const ctx = world.ctx;
// The routing alone: the facts are the batch's, which other tests check.
const routing = (result: Awaited<ReturnType<typeof checkGates>>) =>
	"closed" in result
		? result
		: { attempts: result.attempts, keys: result.keys };
const gates = async () =>
	routing(await checkGates(world.imports, world.pi, ctx()));

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

test("a whitespace-only credential or variable counts as unset", async () => {
	setEnv(KEY_VARIABLE, ENV_KEY);
	world.credential = async () => " \n";
	assert.deepEqual(await gates(), open(ENV_KEY));
	world.credential = async () => undefined;
	setEnv(KEY_VARIABLE, "   ");
	assert.deepEqual(await gates(), { closed: KEY_UNSET });
});

test("a key is used trimmed, from omp's credential and from the variable", async () => {
	world.credential = async () => ` ${KEY}\n`;
	assert.deepEqual(await gates(), open());
	world.credential = async () => undefined;
	setEnv(KEY_VARIABLE, `\t${ENV_KEY} `);
	assert.deepEqual(await gates(), open(ENV_KEY));
});

test("no credential and no variable close the gate", async () => {
	world.credential = async () => undefined;
	assert.deepEqual(await gates(), { closed: KEY_UNSET });
	setEnv(KEY_VARIABLE, "");
	assert.deepEqual(await gates(), { closed: KEY_UNSET });
	world.lockfile = lockfileWith("openrouter");
	setEnv(KEY_VARIABLE, ENV_KEY);
	assert.deepEqual(await gates(), { closed: KEY_UNSET });
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
	for (const imports of unreadable(world.imports))
		assert.deepEqual(await checkGates(imports, world.pi, ctx()), {
			closed: UNREADABLE,
		});
	world.lockfile = "{ not json";
	assert.deepEqual(await gates(), { closed: UNREADABLE });
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
		"a model role value of the wrong type",
		UNREADABLE,
		() => (world.config.modelRoles = "x"),
	],
	[
		"an unknown settings id",
		UNREADABLE,
		() => (world.config["task.agentModelOverrides"] = undefined),
	],
	[
		"a disabled list of the wrong type",
		UNREADABLE,
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

test("no model in any slot leaves the gate open", async () => {
	world.config.modelRoles = {};
	world.resolvable.clear();
	assert.deepEqual(await gates(), open());
	world.config.modelRoles = { smol: "a/small", slow: "a/large" };
	assert.deepEqual(await gates(), open());
});

test("a throwing lookup or discovery closes the gate", async () => {
	const lookup = () => ({ get: throws });
	assert.deepEqual(
		await checkGates({ ...world.imports, lookup }, world.pi, ctx()),
		{ closed: UNREADABLE },
	);
	const pi = { ...world.pi, pi: { ...world.pi.pi, discoverAgents: throws } };
	assert.deepEqual(await checkGates(world.imports, pi, ctx()), {
		closed: "custom task agent",
	});
});

test("the batch reads each slot from modelRoles and the resolver", async () => {
	world.config.modelRoles = { smol: "a/small", middle: "a/mid", slow: "" };
	world.resolvable = new Set(["@smol", "@slow"]);
	const batch = await checkGates(world.imports, world.pi, ctx());
	assert.ok(!("closed" in batch));
	assert.deepEqual(batch.facts.models, {
		small: { state: "set", model: "@smol" },
		middle: { state: "unresolved" },
		large: { state: "unset" },
	});
});

test("a throwing resolver leaves the gate open and each named slot unresolved", async () => {
	world.config.modelRoles = { smol: "a/small", slow: "a/large" };
	const broken = { ...ctx(), models: { ...ctx().models, resolve: throws } };
	const batch = await checkGates(world.imports, world.pi, broken);
	assert.ok(!("closed" in batch));
	assert.deepEqual(batch.facts.models, {
		small: { state: "unresolved" },
		middle: { state: "unset" },
		large: { state: "unresolved" },
	});
});

const ROLE_OF = { small: "smol", middle: "middle", large: "slow" } as const;
// patternsOf reads these values as no pattern, so the role is unset whatever omp resolves.
const NO_PATTERN: readonly [string, unknown][] = [
	["undefined", undefined],
	["null", null],
	["an empty string", ""],
	["a string of spaces", "   "],
	["an empty list", []],
];
const SOME_PATTERN: readonly [string, unknown][] = [
	["a list with a blank entry", ["x", ""]],
	["a comma list", "a, b"],
];
for (const slot of ["small", "middle", "large"] as const) {
	const name = ROLE_OF[slot];
	for (const [label, value] of NO_PATTERN)
		for (const resolving of [true, false])
			test(`${name} as ${label} is unset, ${resolving ? "resolving" : "not resolving"}`, () => {
				world.resolvable = new Set(resolving ? [`@${name}`] : []);
				assert.deepEqual(slotModel(ctx(), { [name]: value }, slot), {
					state: "unset",
				});
			});
	for (const [label, value] of SOME_PATTERN) {
		test(`${name} as ${label} is set when omp resolves it`, () => {
			world.resolvable = new Set([`@${name}`]);
			assert.deepEqual(slotModel(ctx(), { [name]: value }, slot), {
				state: "set",
				model: `@${name}`,
			});
		});
		test(`${name} as ${label} is unresolved when omp does not resolve it`, () => {
			world.resolvable = new Set();
			assert.deepEqual(slotModel(ctx(), { [name]: value }, slot), {
				state: "unresolved",
			});
		});
	}
}

test("a role that only the prototype holds is unset", () => {
	world.resolvable = new Set(["@smol", "@middle", "@slow"]);
	const roles = Object.create({
		smol: "prov/small",
		middle: "prov/mid",
		slow: "prov/large",
	}) as Record<string, unknown>;
	for (const slot of ["small", "middle", "large"] as const)
		assert.deepEqual(slotModel(ctx(), roles, slot), { state: "unset" });
});

test("a role that modelRoles does not name is unset, even when omp resolves it", () => {
	world.resolvable = new Set(["@smol", "@middle", "@slow"]);
	for (const slot of ["small", "middle", "large"] as const)
		assert.deepEqual(slotModel(ctx(), {}, slot), { state: "unset" });
});

const forAgent = async (agent: string, modelRole?: string) =>
	routing(
		await checkGates(world.imports, world.pi, ctx(), { agent, modelRole }),
	);

for (const name of [
	"task",
	"scout",
	"sonic",
	"reviewer",
	"security-reviewer",
	"helper",
	"constructor",
])
	test(`extended: ${name} passes the item check`, async () => {
		extend(world);
		assert.deepEqual(await forAgent(name), open());
	});

const skips: [string, string, () => void][] = [
	["pinned", setsOwnModel("pinned"), () => undefined],
	[
		"scout",
		"scout model override set",
		() => (world.config["task.agentModelOverrides"] = { scout: "m" }),
	],
	[
		"constructor",
		"constructor model override set",
		() => (world.config["task.agentModelOverrides"] = { constructor: "m" }),
	],
	[
		"task",
		"task model role set",
		() => (world.config.modelRoles = { task: "m" }),
	],
	[
		"sonic",
		"sonic agent disabled",
		() => (world.config["task.disabledAgents"] = ["sonic"]),
	],
	["ghost", agentUnknown("ghost"), () => undefined],
];
for (const [name, reason, close] of skips)
	test(`extended: ${name} is skipped with "${reason}"`, async () => {
		extend(world);
		close();
		assert.deepEqual(await forAgent(name), { closed: reason });
	});

test("extended: a failed discovery skips with its own reason", async () => {
	extend(world);
	const pi = { ...world.pi, pi: { ...world.pi.pi, discoverAgents: throws } };
	const result = await checkGates(world.imports, pi, ctx(), { agent: "scout" });
	assert.deepEqual(result, { closed: agentDiscoveryFailed("scout") });
});

test("extended: a user's model for one agent leaves the others routed", async () => {
	extend(world);
	world.config.modelRoles = { task: "m" };
	world.config["task.agentModelOverrides"] = { sonic: "m" };
	assert.deepEqual(await forAgent("scout"), open());
	assert.deepEqual(await forAgent("constructor"), open());
});

test("an agent outside the core scope is skipped", async () => {
	world.agents = [...AGENTS];
	assert.deepEqual(await forAgent("scout"), {
		closed: outsideCoreScope("scout"),
	});
});

test("a spawn keeps the agent's own model role or nothing", async () => {
	extend(world);
	assert.deepEqual(await forAgent("scout", "smol"), open());
	assert.deepEqual(await forAgent("seance", "slow"), {
		closed:
			"seance spawns without the hook omp gives plugins, so its model cannot change",
	});
	assert.deepEqual(await forAgent("scout"), open());
	assert.deepEqual(await forAgent("scout", "slow"), {
		closed: "scout spawns with another model role",
	});
	for (const name of ["task", "helper"])
		assert.deepEqual(await forAgent(name, "smol"), {
			closed: `${name} spawns with another model role`,
		});
});

// isSet counts any value but undefined, null and blank text as set. These rows feed the values no other gate test feeds: undefined, blank text and null are unset; zero and an empty object are set.
const SET_VALUES: readonly [string, unknown, boolean][] = [
	["undefined", undefined, false],
	["an empty string", "", false],
	["a string of spaces", "  ", false],
	["null", null, false],
	["zero", 0, true],
	["an empty object", {}, true],
];

for (const [name, value, set] of SET_VALUES) {
	const closed = (reason: string) => (set ? { closed: reason } : open());

	test(`${name} as the task model role ${set ? "is" : "is not"} a user choice`, async () => {
		world.config.modelRoles = { task: value };
		assert.deepEqual(await forAgent("task"), closed("task model role set"));
	});

	test(`${name} as the task model override ${set ? "is" : "is not"} a user choice`, async () => {
		world.config["task.agentModelOverrides"] = { task: value };
		assert.deepEqual(await forAgent("task"), closed("task model override set"));
	});

	test(`${name} as another agent's model override ${set ? "is" : "is not"} a user choice`, async () => {
		extend(world);
		world.config["task.agentModelOverrides"] = { scout: value };
		assert.deepEqual(
			await forAgent("scout"),
			closed("scout model override set"),
		);
	});
}
