import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Case, check, validateCases } from "./evals/cases.ts";
import { claude } from "./evals/claude.ts";
import { omp } from "./evals/omp.ts";
import { missingKeys, runCase } from "./evals/run.ts";
import { clientEnv, normalisePaths, scrub } from "./evals/scrub.ts";

const LINE = "L1 sonnet · medium · p=0.80/0.55 · jev jev-1.14.0 · 800/9 tok";
const jsonl = (...events: object[]) =>
	events.map((e) => JSON.stringify(e)).join("\n");
const spawn = { type: "tool_use", name: "Agent", input: { prompt: "x" } };
const ompTask = {
	type: "tool_execution_start",
	toolName: "task",
	args: { tasks: [{ agent: "task", task: "read it" }] },
};
const OMP_LINE = "task 1: L0 @smol · p=0.91 · jev jev-1.14.0 · 812/9 tok";

test("claude: a ui_log decision line after an Agent call is routed evidence", () => {
	const stdout = jsonl(
		{ type: "assistant", message: { content: [spawn] } },
		{ type: "system", subtype: "ui_log", plugin: "model-router", text: LINE },
	);
	assert.deepEqual(claude.parse({ stdout, stderr: "" }), {
		spawns: 1,
		routed: true,
		line: LINE,
		tier: 1,
		effort: "medium",
		target: "sonnet",
		reply: null,
	});
});

test("claude: the result event is the reply", () => {
	const stdout = jsonl({ type: "result", result: "eval-subject" });
	assert.equal(claude.parse({ stdout, stderr: "" }).reply, "eval-subject");
});

test("claude: no ui_log line means a spawn that was not routed", () => {
	const stdout = jsonl({ type: "assistant", message: { content: [spawn] } });
	const evidence = claude.parse({ stdout, stderr: "" });
	assert.equal(evidence.spawns, 1);
	assert.equal(evidence.routed, false);
	assert.equal(evidence.line, null);
	assert.equal(evidence.tier, null);
});

test("claude: a skipped line is not a decision line, and caller effort is read", () => {
	const skipped = {
		type: "system",
		subtype: "ui_log",
		text: "skipped, HTTP 401",
	};
	for (const reason of ["key unset", "bad reply", "timeout", "HTTP 401"]) {
		const stdout = jsonl({ ...skipped, text: `skipped, ${reason}` });
		const evidence = claude.parse({ stdout, stderr: "" });
		assert.equal(evidence.line, null);
		assert.equal(evidence.routed, false);
	}
	const kept = { ...skipped, text: "L2 opus · caller effort · p=0.9/0.6" };
	assert.equal(
		claude.parse({ stdout: jsonl(kept), stderr: "" }).effort,
		"caller effort",
	);
});

test("claude: the command asks for stream-json with Agent allowed", () => {
	const argv = claude.command("do it", "sonnet");
	assert.equal(argv[0], "claude");
	assert.ok(argv.includes("stream-json"));
	assert.ok(argv.includes("Agent"));
});

test("omp: the decision line on stderr is the routing evidence", () => {
	const evidence = omp.parse({
		stdout: jsonl(ompTask),
		stderr: `model-router ${OMP_LINE}\n`,
	});
	assert.deepEqual(evidence, {
		spawns: 1,
		routed: true,
		line: OMP_LINE,
		tier: 0,
		effort: null,
		target: "@smol",
		reply: null,
	});
});

test("omp: a batch line gives the first decision entry, and no change has no target", () => {
	const stderr = `model-router task 1: skipped, HTTP 401 | task 2: L1 no change · p=0.80 | task 3: L2 @slow · p=0.90\n`;
	const evidence = omp.parse({ stdout: jsonl(ompTask), stderr });
	assert.equal(evidence.line, "task 2: L1 no change · p=0.80");
	assert.equal(evidence.tier, 1);
	assert.equal(evidence.target, null);
	assert.equal(evidence.routed, true);
});

test("omp: a spawn with no decision line was not routed", () => {
	const evidence = omp.parse({ stdout: jsonl(ompTask), stderr: "" });
	assert.equal(evidence.spawns, 1);
	assert.equal(evidence.routed, false);
	assert.equal(evidence.line, null);
	assert.equal(evidence.target, null);
});

test("omp: a skipped entry is no decision line, whatever the reason", () => {
	for (const reason of ["key unset", "bad reply", "no @smol or @slow model"]) {
		const stderr = `model-router task 1: skipped, ${reason}\n`;
		const evidence = omp.parse({ stdout: "", stderr });
		assert.equal(evidence.spawns, 0);
		assert.equal(evidence.routed, false);
		assert.equal(evidence.line, null);
	}
});

test("omp: the agent name is no evidence of routing", () => {
	const stdout = jsonl({
		...ompTask,
		args: { tasks: [{ agent: "router_light", task: "x" }] },
	});
	assert.equal(omp.parse({ stdout, stderr: "" }).routed, false);
});

test("omp: the last assistant text is the reply", () => {
	const said = (...texts: string[]) => ({
		type: "message_end",
		message: {
			role: "assistant",
			content: texts.map((text) => ({ type: "text", text })),
		},
	});
	const stdout = jsonl(said("Spawning."), said(" ", "eval-subject"), said());
	assert.equal(omp.parse({ stdout, stderr: "" }).reply, "eval-subject");
});

test("omp: the command loads an overlay that turns background tasks off", () => {
	const argv = omp.command("do it", "prov/model");
	const overlay = argv[argv.indexOf("--config") + 1] ?? "";
	assert.match(omp.files?.[overlay] ?? "", /^async:\n {2}enabled: false\n$/);
});

test("omp: the command runs print mode with json output and the case model", () => {
	const argv = omp.command("do it", "prov/model");
	assert.equal(argv[0], "omp");
	assert.ok(argv.includes("json"));
	assert.ok(argv.includes("prov/model"));
	assert.equal(argv.at(-1), "do it");
});

test("env filter keeps the client's key and the TypeSafe key, drops every other secret", () => {
	const source = {
		PATH: "/bin",
		HOME: "/h",
		ANTHROPIC_API_KEY: "a",
		OPENROUTER_API_KEY: "o",
		TYPESAFE_API_KEY: "t",
		GITHUB_TOKEN: "g",
		SOME_PASSWORD: "p",
	};
	assert.deepEqual(clientEnv(source, ["ANTHROPIC_API_KEY"]), {
		PATH: "/bin",
		HOME: "/h",
		ANTHROPIC_API_KEY: "a",
		TYPESAFE_API_KEY: "t",
	});
});

test("scrub masks exact secret values and leaves short and public values", () => {
	const env = {
		MODEL_KEY: "sk-live-abcdef123456",
		OTHER_TOKEN: "1",
		HOME: "/h",
	};
	const text = "key sk-live-abcdef123456 twice sk-live-abcdef123456, 1, /h";
	assert.equal(scrub(text, env), "key *** twice ***, 1, /h");
});

test("normalisePaths swaps roots for placeholders, longest root first", () => {
	const roots: [string, string][] = [
		["/w", "<work>"],
		["/w/sub", "<sub>"],
	];
	assert.equal(normalisePaths("a /w/sub/x /w/y", roots), "a <sub>/x <work>/y");
});

const base: Case = {
	id: "c",
	client: "claude",
	model: "m",
	keyEnv: "ANTHROPIC_API_KEY",
	prompt: "p",
	files: { "package.json": { name: "n" } },
	assert: ["spawned", "routed", "line"],
};

test("validateCases accepts a good case and names each defect", () => {
	assert.deepEqual(validateCases({ cases: [base] }), []);
	assert.deepEqual(validateCases({ cases: [] }), [
		"cases: expected a non-empty list",
	]);
	const bad = { ...base, client: "nope", assert: ["spawned", "magic"] };
	const problems = validateCases({ cases: [bad, base, base] });
	assert.ok(problems.some((p) => p.includes("unknown client nope")));
	assert.ok(problems.some((p) => p.includes("unknown assertion magic")));
	assert.ok(problems.some((p) => p.includes("duplicate id c")));
});

test("check lists one failure per broken assertion", () => {
	const evidence = {
		spawns: 0,
		routed: false,
		line: null,
		tier: null,
		effort: null,
		target: null,
		reply: null,
	};
	assert.equal(check(base, evidence).length, 3);
	assert.deepEqual(
		check({ ...base, assert: ["spawned"] }, { ...evidence, spawns: 1 }),
		[],
	);
});

test("answered needs the case's answer in the reply", () => {
	const answered: Case = {
		...base,
		assert: ["answered"],
		answer: "eval-subject",
	};
	assert.deepEqual(validateCases({ cases: [answered] }), []);
	assert.ok(
		validateCases({ cases: [{ ...answered, answer: undefined }] }).some((p) =>
			p.includes("answered needs a non-empty answer"),
		),
	);
	const evidence = {
		spawns: 1,
		routed: true,
		line: "x",
		tier: null,
		effort: null,
		target: null,
		reply: "The name is eval-subject.",
	};
	assert.deepEqual(check(answered, evidence), []);
	assert.deepEqual(check(answered, { ...evidence, reply: null }), [
		"the reply lacks the subagent's answer",
	]);
});

test("the committed cases are valid", () => {
	const raw = JSON.parse(
		readFileSync(new URL("../evals/cases.json", import.meta.url), "utf8"),
	);
	assert.deepEqual(validateCases(raw), []);
});

const PATH_VAR = "PATH";
test("a client binary that is missing is a recorded failure, not a crash", () => {
	const path = process.env[PATH_VAR];
	process.env[PATH_VAR] = mkdtempSync(join(tmpdir(), "evals-empty-path-"));
	try {
		const result = runCase(base);
		assert.equal(result.passed, false);
		assert.ok(
			result.failures.some((f) => f.startsWith("client failed to run")),
		);
		assert.equal(result.clientVersion, "");
	} finally {
		process.env[PATH_VAR] = path;
	}
});

test("missingKeys names the client key and the TypeSafe key that are unset", () => {
	assert.deepEqual(missingKeys(base, {}), [
		"ANTHROPIC_API_KEY",
		"TYPESAFE_API_KEY",
	]);
	assert.deepEqual(
		missingKeys(base, { ANTHROPIC_API_KEY: "a", TYPESAFE_API_KEY: "t" }),
		[],
	);
});
