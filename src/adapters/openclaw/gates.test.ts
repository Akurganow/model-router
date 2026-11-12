import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ROLE, NO_DESCRIPTION, roleText } from "../../core/brief.ts";
import {
	agentDiscoveryFailed,
	agentUnknown,
	KEY_UNSET,
	outsideCoreScope,
	setsOwnModel,
	UNREADABLE,
} from "../../core/settings.ts";
import {
	agents,
	effort,
	extended,
	gate,
	known,
	OTHER,
	REQUESTER,
	routed,
	SETTINGS,
	skipped,
	withParams,
} from "./gate-fakes.ts";
import type { OpenClawConfig } from "./types.ts";

test("a plain spawn of the requesting agent itself is routed", () => {
	assert.deepEqual(gate(), {
		outcome: "route",
		target: REQUESTER,
		role: DEFAULT_ROLE,
		effort: { kind: "set" },
		config: {},
		task: "do the work",
		description: "",
	});
});

test("the route carries the live config it was checked against", () => {
	const config = { agents: { entries: { [REQUESTER]: {} } } };
	assert.equal(routed(gate({ config })).config, config);
});

test("the route describes the spawn by its label, else its task name", () => {
	assert.equal(
		routed(withParams({ label: " docs ", taskName: "write" })).description,
		"docs",
	);
	assert.equal(routed(withParams({ taskName: "write" })).description, "write");
});

// Silent pass: no line, as Claude Code passes such calls through.
const SILENT: readonly [string, Record<string, unknown>][] = [
	["a model that names one", { model: "openai/gpt-5" }],
	["the acp runtime", { runtime: "acp" }],
	["a runtime other than subagent", { runtime: "other" }],
	["a visible spawn", { visible: true }],
	["a forked context", { context: "fork" }],
	["a session mode", { mode: "session" }],
	["a thread spawn", { thread: true }],
	["an agent id that is not a string", { agentId: 4 }],
	["a snake-case agent id that is not a string", { agent_id: 4 }],
	[
		"an agentId that is not text beside an agent_id",
		{ agentId: 4, agent_id: "writer" },
	],
];
for (const [name, params] of SILENT)
	test(`${name} passes silently`, () => {
		assert.deepEqual(withParams(params), { outcome: "pass" });
	});

test("a missing task passes silently", () => {
	assert.deepEqual(gate({ params: {} }), { outcome: "pass" });
});

test("a task that is not a string passes silently", () => {
	assert.deepEqual(gate({ params: { task: 5 } }), { outcome: "pass" });
});

test("the model value default does not pass silently", () => {
	routed(withParams({ model: "default" }));
});

test("an empty or absent model does not pass silently", () => {
	for (const model of ["", "  ", null, undefined])
		routed(withParams({ model }));
});

test("a spawn flag that is not exactly set does not pass silently", () => {
	routed(
		withParams({
			visible: false,
			thread: false,
			context: "isolated",
			mode: "run",
			runtime: "subagent",
		}),
	);
});

test("a spawn naming the requester is the requesting agent itself", () => {
	assert.equal(routed(withParams({ agentId: REQUESTER })).target, REQUESTER);
});

test("an empty agent id is the requesting agent itself", () => {
	assert.equal(routed(withParams({ agentId: "" })).target, REQUESTER);
});

test("without a requester id the requesting agent itself has no target", () => {
	assert.equal(routed(gate({ requester: undefined })).target, undefined);
});

test("a named agent without a requester id counts as another agent", () => {
	const result = withParams({ agentId: OTHER });
	assert.equal(
		skipped(
			gate({ params: { task: "t", agentId: OTHER }, requester: undefined }),
		),
		outsideCoreScope(OTHER),
	);
	assert.equal(skipped(result), outsideCoreScope(OTHER));
});

test("under core another agent is outside the scope even when unknown", () => {
	assert.equal(
		skipped(withParams({ agentId: OTHER })),
		outsideCoreScope(OTHER),
	);
});

const other = (
	config: OpenClawConfig | undefined,
	params: Record<string, unknown> = {},
) =>
	gate({
		params: { task: "t", agentId: OTHER, ...params },
		config,
		settings: extended,
	});

test("an unreadable config gives agent discovery failed", () => {
	assert.equal(skipped(other(undefined)), agentDiscoveryFailed(OTHER));
});

test("an agent that is not configured is unknown", () => {
	assert.equal(skipped(other({})), agentUnknown(OTHER));
	assert.equal(skipped(other(agents({ entries: {} }))), agentUnknown(OTHER));
});

test("an inherited property name is not a configured agent", () => {
	const result = gate({
		params: { task: "t", agentId: "constructor" },
		config: agents({ entries: {} }),
		settings: extended,
	});
	assert.equal(skipped(result), agentUnknown("constructor"));
});

test("an agent that sets its own model is skipped", () => {
	assert.equal(skipped(other(known({ model: "x/y" }))), setsOwnModel(OTHER));
	assert.equal(
		skipped(other(known({ model: { primary: "x/y" } }))),
		setsOwnModel(OTHER),
	);
});

test("an agent with an empty model is routed", () => {
	for (const model of ["", "  ", undefined, null])
		routed(other(known({ model })));
});

test("another agent under extended is routed with its own id", () => {
	assert.equal(routed(other(known({}))).target, OTHER);
});

test("the target's subagent model skips the spawn", () => {
	const requesterConfig = agents({
		entries: { [REQUESTER]: { subagents: { model: "a/b" } } },
	});
	assert.equal(
		skipped(gate({ config: requesterConfig })),
		"subagent model set",
	);
	const cfg = known({ subagents: { model: "a/b" } });
	assert.equal(skipped(other(cfg)), "subagent model set");
});

test("the default subagent model skips the spawn", () => {
	const config = agents({ defaults: { subagents: { model: "a/b" } } });
	assert.equal(skipped(gate({ config })), "subagent model set");
	assert.equal(
		skipped(gate({ config, requester: undefined })),
		"subagent model set",
	);
});

test("a subagent model object counts as set, an empty one does not", () => {
	const set = agents({
		defaults: { subagents: { model: { primary: "a/b" } } },
	});
	assert.equal(skipped(gate({ config: set })), "subagent model set");
	for (const model of ["", "  ", null])
		routed(gate({ config: agents({ defaults: { subagents: { model } } }) }));
});

test("another agent's subagent model does not skip the requester", () => {
	const config = agents({
		entries: { [OTHER]: { subagents: { model: "a/b" } } },
	});
	routed(gate({ config }));
});

test("no key for any allowed provider skips with key unset", () => {
	assert.equal(skipped(gate({ hasKey: false })), KEY_UNSET);
});

test("neither model slot set skips with no small or large model", () => {
	const settings = {
		...SETTINGS,
		smallModel: undefined,
		largeModel: undefined,
	};
	assert.equal(skipped(gate({ settings })), "no small or large model");
});

test("one slot set is enough", () => {
	routed(gate({ settings: { ...SETTINGS, smallModel: undefined } }));
	routed(gate({ settings: { ...SETTINGS, largeModel: undefined } }));
});

test("key unset comes before no small or large model", () => {
	const settings = {
		...SETTINGS,
		smallModel: undefined,
		largeModel: undefined,
	};
	assert.equal(skipped(gate({ hasKey: false, settings })), KEY_UNSET);
});

test("key unset comes before every other skip, as in omp", () => {
	const config = agents({ defaults: { subagents: { model: "a/b" } } });
	assert.equal(skipped(gate({ config, hasKey: false })), KEY_UNSET);
	assert.equal(
		skipped(
			gate({ params: { task: "t", agentId: OTHER }, config, hasKey: false }),
		),
		KEY_UNSET,
	);
});

test("the core scope comes before subagent model set", () => {
	const config = agents({ defaults: { subagents: { model: "a/b" } } });
	assert.equal(
		skipped(gate({ params: { task: "t", agentId: OTHER }, config })),
		outsideCoreScope(OTHER),
	);
});

test("subagent model set comes before the agent checks, as in omp", () => {
	const config = agents({ defaults: { subagents: { model: "a/b" } } });
	assert.equal(
		skipped(
			gate({
				params: { task: "t", agentId: OTHER },
				config,
				settings: extended,
			}),
		),
		"subagent model set",
	);
});

test("a silent pass comes before every skip", () => {
	assert.deepEqual(
		gate({
			params: { task: "t", model: "a/b" },
			hasKey: false,
			settings: { ...SETTINGS, smallModel: undefined, largeModel: undefined },
		}),
		{ outcome: "pass" },
	);
});

const describe = (description: unknown) =>
	agents({
		entries: { [REQUESTER]: { description }, [OTHER]: { description } },
	});

test("the requesting agent itself with a requester description sends roleText of it", () => {
	const role = routed(gate({ config: describe("Plans the release.") })).role;
	assert.equal(role, roleText("Plans the release."));
	assert.notEqual(role, DEFAULT_ROLE);
});

test("the requesting agent itself without a description sends the default role", () => {
	for (const description of [undefined, "", "   ", 3, null])
		assert.equal(
			routed(gate({ config: describe(description) })).role,
			DEFAULT_ROLE,
		);
	assert.equal(routed(gate({ config: {} })).role, DEFAULT_ROLE);
});

test("the requesting agent itself without a requester id sends the default role", () => {
	const config = describe("Plans the release.");
	assert.equal(
		routed(gate({ requester: undefined, config })).role,
		DEFAULT_ROLE,
	);
});

test("another agent with a description sends roleText of it", () => {
	assert.equal(
		routed(other(describe("Writes docs."))).role,
		roleText("Writes docs."),
	);
});

test("another agent without a description sends the neutral text", () => {
	assert.equal(routed(other(known({}))).role, NO_DESCRIPTION);
});

const thinking = (defaults?: unknown, requester?: unknown, target?: unknown) =>
	agents({
		defaults: { subagents: { thinking: defaults } },
		entries: {
			[REQUESTER]: { subagents: { thinking: requester } },
			[OTHER]: { subagents: { thinking: target } },
		},
	});

test("effort step 1: a thinking param is kept as caller effort", () => {
	assert.deepEqual(effort(withParams({ thinking: "low" })), {
		kind: "keep",
		label: "caller effort",
	});
});

test("effort step 1 decides over every configured value", () => {
	const config = thinking("high", "high", "high");
	assert.deepEqual(
		effort(
			gate({
				params: { task: "t", thinking: "low" },
				config,
				settings: extended,
			}),
		),
		{
			kind: "keep",
			label: "caller effort",
		},
	);
});

test("an empty thinking param is not step 1", () => {
	for (const value of ["", "  ", null])
		assert.deepEqual(effort(withParams({ thinking: value })), { kind: "set" });
});

test("effort step 2: a default subagent thinking is kept as config effort", () => {
	assert.deepEqual(effort(gate({ config: thinking("high") })), {
		kind: "keep",
		label: "config effort",
	});
});

test("effort step 3: under core the requester's thinking is kept", () => {
	assert.deepEqual(effort(gate({ config: thinking(undefined, "high") })), {
		kind: "keep",
		label: "config effort",
	});
});

test("effort step 4: under extended the requester's thinking is replaced", () => {
	assert.deepEqual(
		effort(gate({ config: thinking(undefined, "high"), settings: extended })),
		{ kind: "set" },
	);
});

test("effort step 4: under extended the target's thinking is replaced", () => {
	assert.deepEqual(effort(other(thinking(undefined, undefined, "high"))), {
		kind: "set",
	});
});

test("effort step 5: otherwise the ladder effort is set", () => {
	assert.deepEqual(effort(gate({ config: thinking(undefined, "", "") })), {
		kind: "set",
	});
	assert.deepEqual(effort(gate({ config: {} })), { kind: "set" });
});

test("an unreadable config skips the route with settings unreadable", () => {
	assert.equal(skipped(gate({ config: undefined })), UNREADABLE);
});

test("settings unreadable comes after every other skip of the spawn of the requesting agent itself", () => {
	assert.equal(skipped(gate({ config: undefined, hasKey: false })), KEY_UNSET);
	const noModels = {
		...SETTINGS,
		smallModel: undefined,
		largeModel: undefined,
	};
	assert.equal(
		skipped(gate({ config: undefined, settings: noModels })),
		"no small or large model",
	);
});

test("the first match decides: under extended a global default beats a per-agent value", () => {
	const result = gate({ config: thinking("low", "high"), settings: extended });
	assert.deepEqual(effort(result), { kind: "keep", label: "config effort" });
});

// OpenClaw reads the older `agents.list: [{ id }]` roster when `agents.entries` is absent, and matches ids after normalising them.
const listed = (...entries: object[]) => agents({ list: entries });

test("an agent in the list roster is known, and its own model skips the spawn", () => {
	routed(other(listed({ id: OTHER })));
	assert.equal(
		skipped(other(listed({ id: OTHER, model: "x/y" }))),
		setsOwnModel(OTHER),
	);
	assert.equal(skipped(other(listed({ id: "else" }))), agentUnknown(OTHER));
});

test("an agent in the list roster sends its description as the role", () => {
	const config = listed({ id: OTHER, description: "Writes docs." });
	assert.equal(routed(other(config)).role, roleText("Writes docs."));
});

test("the list roster is read only when entries is absent", () => {
	const config = agents({ entries: {}, list: [{ id: OTHER }] });
	assert.equal(skipped(other(config)), agentUnknown(OTHER));
});

test("an agent id matches its entry key in any case", () => {
	routed(other(agents({ entries: { Writer: {} } }), { agentId: "WRITER" }));
	routed(other(listed({ id: "Writer" }), { agentId: "writer" }));
	assert.equal(
		skipped(
			other(agents({ entries: { Writer: { model: "x/y" } } }), {
				agentId: "writer",
			}),
		),
		setsOwnModel("writer"),
	);
});

test("the named agent and the requester are the same agent in any case or padding", () => {
	for (const agentId of ["MAIN", " Main "])
		assert.equal(routed(withParams({ agentId })).target, REQUESTER);
	assert.equal(
		routed(gate({ requester: "Main", params: { task: "t", agentId: "main" } }))
			.target,
		"Main",
	);
});

const ROSTERS: [string, (id: string, subagents: object) => OpenClawConfig][] = [
	["entries", (id, subagents) => agents({ entries: { [id]: { subagents } } })],
	["list", (id, subagents) => listed({ id, subagents })],
];
for (const [kind, build] of ROSTERS)
	test(`the subagent model and thinking in ${kind} are found in another case`, () => {
		const model = { model: "a/b" };
		assert.equal(
			skipped(gate({ config: build("MAIN", model) })),
			"subagent model set",
		);
		assert.equal(skipped(other(build("WRITER", model))), "subagent model set");
		const thinking = { thinking: "high" };
		assert.deepEqual(effort(gate({ config: build("MAIN", thinking) })), {
			kind: "keep",
			label: "config effort",
		});
		assert.deepEqual(effort(other(build("WRITER", thinking))), {
			kind: "set",
		});
	});
