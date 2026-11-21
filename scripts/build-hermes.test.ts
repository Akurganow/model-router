import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	ESCALATION_SKILL,
	HERMES_TEXTS,
	taskParameterTexts,
} from "#adapters/hermes/texts.ts";
import { EFFORTS, effortFor } from "#core/decision/ladder.ts";
import { LEVELS } from "#core/parts/part.ts";
import { KEY_VARIABLES } from "#core/providers/provider.ts";
import { ROUTING_LIMIT_MS } from "#core/scoring/limit.ts";
import { renderHermes } from "./build/hermes.ts";
import { formatJson } from "./build/json.ts";
import { HERMES_OUTPUTS } from "./build/outputs.ts";
import { loadSource } from "./build/source.ts";
import { TOOL_NAME } from "./build/values.ts";
import { buildBundle, MAX_BUNDLE_BYTES } from "./build.ts";
import { useTempRoot } from "./temp-root.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const source = loadSource(ROOT);
const files = renderHermes(source);
const text = (path: string) => files.find((f) => f.path === path)?.text ?? "";
const manifest = JSON.parse(text(HERMES_OUTPUTS.manifest));
const constants = JSON.parse(text(HERMES_OUTPUTS.constants));
const schema = manifest.config_schema;
// Hermes validates the effort a delegation backend returns against this set.
const HERMES_EFFORTS = [
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
	"ultra",
];

test("the Hermes renderer writes the manifest and the constants", () => {
	assert.deepEqual(
		files.map(({ path }) => path),
		[HERMES_OUTPUTS.manifest, HERMES_OUTPUTS.constants],
	);
});

test("plugin.yaml is JSON with spaces only, so a YAML parser reads it", () => {
	const raw = text(HERMES_OUTPUTS.manifest);
	assert.equal(raw.includes("\t"), false);
	assert.ok(raw.endsWith("}\n"));
});

test("the manifest names the plugin, its version and its backend kind", () => {
	assert.equal(manifest.name, source.hermes.pluginName);
	assert.equal(manifest.version, source.version);
	assert.equal(manifest.description, source.descriptions.hermes.manifest);
	assert.equal(manifest.author, source.author.name);
	assert.equal(manifest.kind, "backend");
	assert.equal(manifest.requires_hermes, source.hermes.requiresHermes);
	assert.deepEqual(manifest.provides_tools, [TOOL_NAME]);
});

test("the manifest holds seven settings and no scope", () => {
	assert.deepEqual(Object.keys(schema), [
		"provider",
		"gateway",
		"small_model",
		"middle_model",
		"large_model",
		"typesafe_api_key",
		"openrouter_api_key",
	]);
	assert.equal(JSON.stringify(manifest).includes("scope"), false);
});

test("the provider and gateway settings offer the values the code accepts, with their defaults", () => {
	const shown = (name: string) => ({
		type: schema[name].type,
		choices: schema[name].choices,
		default: schema[name].default,
		label: schema[name].label,
		description: schema[name].description,
	});
	assert.deepEqual(shown("provider"), {
		type: "str",
		choices: ["typesafe"],
		default: "typesafe",
		label: source.options.provider.title,
		description: source.options.provider.descriptions.hermes,
	});
	assert.deepEqual(shown("gateway"), {
		type: "str",
		choices: ["direct", "auto", "openrouter-first", "openrouter"],
		default: "direct",
		label: source.options.gateway.title,
		description: source.options.gateway.descriptions.hermes,
	});
});

test("the models are dict settings and each key is a secret stored under its variable", () => {
	for (const name of ["small_model", "middle_model", "large_model"]) {
		assert.equal(schema[name].type, "dict", name);
		assert.equal(
			schema[name].label,
			source.hermes.settings[name as "small_model"].label,
		);
		assert.match(schema[name].description, /provider/);
		assert.match(schema[name].description, /model/);
	}
	const secret = (name: string) => [schema[name]?.type, schema[name]?.env];
	assert.deepEqual(secret("typesafe_api_key"), ["secret", "TYPESAFE_API_KEY"]);
	assert.deepEqual(secret("openrouter_api_key"), [
		"secret",
		"OPENROUTER_API_KEY",
	]);
});

test("the constants hold only the keys the Python shim reads", () => {
	assert.deepEqual(Object.keys(constants), [
		"routingLimitMs",
		"graceMs",
		"blank",
		"keyVariables",
		"settings",
		"choices",
		"efforts",
		"skips",
		"slots",
		"levels",
		"levelSlots",
		"taskParameters",
		"delegationAddendum",
		"backend",
		"texts",
	]);
	assert.equal(constants.texts.slots, undefined);
});

test("the constants hold the values src/ gives", () => {
	assert.equal(constants.routingLimitMs, ROUTING_LIMIT_MS);
	assert.equal(constants.graceMs, HERMES_TEXTS.graceMs);
	assert.equal(constants.backend, source.hermes.backendName);
	assert.deepEqual(constants.keyVariables, KEY_VARIABLES);
	assert.deepEqual(constants.skips, {
		keyUnset: "model-router skipped, key unset",
		subagentModelSet: "model-router skipped, subagent model set",
		nodeNotFound: "model-router skipped, node not found",
		timeout: "model-router skipped, timeout",
		failed: "model-router skipped, failed",
	});
	assert.deepEqual(constants.slots, {
		small: {
			setting: "small_model",
			pinned: { unset: "model-router L0 small model unset" },
		},
		middle: {
			setting: "middle_model",
			pinned: { unset: "model-router L1 middle model unset" },
		},
		large: {
			setting: "large_model",
			pinned: { unset: "model-router L2 large model unset" },
		},
	});
	assert.deepEqual(constants.levels, [...LEVELS]);
	assert.deepEqual(constants.levelSlots, ["small", "middle", "large"]);
});

test("the settings table lists provider then gateway, each with its texts", () => {
	assert.deepEqual(constants.settings, [
		{
			name: "provider",
			values: ["typesafe"],
			default: "typesafe",
			skip: "model-router skipped, provider not valid: run setup",
			notValid: "provider: {stored} (not valid: use one of typesafe)",
			valueLines: { typesafe: "provider: typesafe" },
			useOneOf: "provider: use one of typesafe",
			already: { typesafe: "provider unchanged: already typesafe" },
			unchanged: "provider unchanged: ",
			refused: "provider unchanged: only a local session can change it",
			command: {
				name: "model-router-provider",
				description:
					"Shows or changes whose model scores subagent calls: typesafe.",
				argsHint: "<typesafe>",
			},
		},
		{
			name: "gateway",
			values: ["direct", "auto", "openrouter-first", "openrouter"],
			default: "direct",
			skip: "model-router skipped, gateway not valid: run setup",
			notValid:
				"gateway: {stored} (not valid: use one of direct, auto, openrouter-first, openrouter)",
			valueLines: {
				direct: "gateway: direct",
				auto: "gateway: auto",
				"openrouter-first": "gateway: openrouter-first",
				openrouter: "gateway: openrouter",
			},
			useOneOf:
				"gateway: use one of direct, auto, openrouter-first, openrouter",
			already: {
				direct: "gateway unchanged: already direct",
				auto: "gateway unchanged: already auto",
				"openrouter-first": "gateway unchanged: already openrouter-first",
				openrouter: "gateway unchanged: already openrouter",
			},
			unchanged: "gateway unchanged: ",
			refused: "gateway unchanged: only a local session can change it",
			command: {
				name: "model-router-gateway",
				description:
					"Shows or changes how OpenRouter is used for the provider: direct, auto, openrouter-first, openrouter.",
				argsHint: "<direct|auto|openrouter-first|openrouter>",
			},
		},
	]);
});

test("the choices table holds the key holders and the lines of each provider and gateway", () => {
	const leaf = (holders: string[], gateway: string) => ({
		holders,
		lines: ["provider: typesafe", gateway],
	});
	assert.deepEqual(constants.choices, {
		typesafe: {
			direct: leaf(["typesafe"], "gateway: direct (typesafe)"),
			auto: leaf(
				["typesafe", "openrouter"],
				"gateway: auto (typesafe, then openrouter)",
			),
			"openrouter-first": leaf(
				["openrouter", "typesafe"],
				"gateway: openrouter-first (openrouter, then typesafe)",
			),
			openrouter: leaf(["openrouter"], "gateway: openrouter (openrouter)"),
		},
	});
});

test("the task parameters are the texts src/ gives, with the ladder and the levels as enums", () => {
	const texts = taskParameterTexts(source.hermes.pluginName);
	assert.deepEqual(constants.taskParameters, texts.taskParameters);
	assert.equal(constants.delegationAddendum, texts.delegationAddendum);
	const { description, reasoning_effort, level } = constants.taskParameters;
	assert.equal(description.type, "string");
	assert.deepEqual(reasoning_effort.enum, [...EFFORTS]);
	assert.deepEqual(level, { ...level, type: "integer", enum: [0, 1, 2] });
	assert.equal(
		level.description,
		"Leave it unset unless you re-dispatch a failed task. 0 runs the child on the user's small model, 1 on the user's middle model, 2 on the large model, and model-router asks Jev nothing. A level whose model is not set runs on the model Hermes gives it. A routed task's label shows its level as L0, L1 or L2. A model in the user's delegation config wins.",
	);
	assert.ok(
		constants.delegationAddendum.includes(
			`${source.hermes.pluginName}:${ESCALATION_SKILL}`,
		),
	);
});

test("the ladder's effort list holds every effort the ladder gives, weakest first", () => {
	const given = new Set(
		LEVELS.flatMap((t) => LEVELS.map((w) => effortFor(t, w))),
	);
	assert.deepEqual([...EFFORTS].sort(), [...given].sort());
	assert.deepEqual([...EFFORTS], ["low", "medium", "high", "xhigh"]);
	assert.deepEqual(constants.efforts, [...EFFORTS]);
});

test("the escalation skill the addendum names is a folder of the plugin", () => {
	assert.ok(
		existsSync(
			join(
				ROOT,
				"plugins",
				source.hermes.pluginName,
				"skills",
				ESCALATION_SKILL,
				"SKILL.md",
			),
		),
	);
});

test("the efforts are every value the ladder returns, all valid in Hermes, none of max or ultra", () => {
	const ladder = new Set(
		LEVELS.flatMap((t) => LEVELS.map((w) => effortFor(t, w))),
	);
	assert.deepEqual([...constants.efforts].sort(), [...ladder].sort());
	for (const effort of constants.efforts) {
		assert.ok(HERMES_EFFORTS.includes(effort), effort);
		assert.ok(!["max", "ultra"].includes(effort), effort);
	}
});

test("the rendered files equal the committed files", () => {
	assert.equal(text(HERMES_OUTPUTS.manifest), read(HERMES_OUTPUTS.manifest));
	assert.equal(
		formatJson(HERMES_OUTPUTS.constants, text(HERMES_OUTPUTS.constants), ROOT),
		read(HERMES_OUTPUTS.constants),
	);
});

test("no rendered file holds an absolute path", () => {
	for (const { text: body } of files)
		assert.doesNotMatch(body, /(^|[\s"])\/(Users|home|private|tmp)\//);
});

const box = useTempRoot("build-hermes-");

test("the bundle builds under the cap and equals the committed bundle", async () => {
	const out = join(box.root, "route.mjs");
	assert.deepEqual(
		await buildBundle("hermes", "src/adapters/hermes/index.ts", out),
		[],
	);
	const code = readFileSync(out, "utf8");
	assert.ok(Buffer.byteLength(code) < MAX_BUNDLE_BYTES);
	assert.equal(code, read(HERMES_OUTPUTS.bundle));
});

test("two builds of the bundle give identical bytes", async () => {
	const first = join(box.root, "first.mjs");
	const second = join(box.root, "second.mjs");
	await buildBundle("hermes", "src/adapters/hermes/index.ts", first);
	await buildBundle("hermes", "src/adapters/hermes/index.ts", second);
	assert.equal(readFileSync(first, "utf8"), readFileSync(second, "utf8"));
});

test("the bundle imports nothing outside the node: built-ins and holds no absolute path", () => {
	const bundle = read(HERMES_OUTPUTS.bundle);
	for (const [, specifier = ""] of bundle.matchAll(/\bfrom\s+"([^"]+)"/g))
		assert.match(specifier, /^node:/, specifier);
	assert.doesNotMatch(bundle, /(^|[\s"'`(])\/(Users|home|private|tmp)\//);
});

test("the committed bundle answers a request on stdin with one JSON line", () => {
	const request = {
		task: "t",
		context: "",
		provider: "typesafe",
		keys: {},
		budgetMs: 1000,
		models: { small: null, large: null },
		keptEffort: null,
	};
	const run = spawnSync(process.execPath, [join(ROOT, HERMES_OUTPUTS.bundle)], {
		input: JSON.stringify(request),
		encoding: "utf8",
	});
	assert.equal(run.status, 0);
	assert.equal(
		run.stdout,
		`${JSON.stringify({ outcome: "skip", line: "model-router skipped, key unset" })}\n`,
	);
});

test("the manifest and the middle setting say the effort is set unless the user sets one", () => {
	assert.ok(
		manifest.description.includes(
			"It scores a task even when you set no model, and sets the effort unless you set one.",
		),
	);
	assert.equal(
		schema.middle_model.description,
		"The model a delegated task gets when Jev rates its task middle, given as a dict that names a provider and a model. Unset: such a task keeps the model Hermes would give it, and the plugin still sets its effort unless you set one.",
	);
});
