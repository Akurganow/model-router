import assert from "node:assert/strict";
import {
	chmodSync,
	cpSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type Case, check, validateCases } from "./evals/cases.ts";
import { claude } from "./evals/claude.ts";
import { bodyOf, recordDrift, sameBody } from "./evals/drift.ts";
import { hygieneProblems } from "./evals/hygiene.ts";
import { omp } from "./evals/omp.ts";
import { missingKeys, runCase } from "./evals/run.ts";
import { clientEnv, normalisePaths, scrub } from "./evals/scrub.ts";
import { selftest } from "./evals/selftest.ts";

const LINE = "L1 sonnet · medium · p=0.80/0.55 · jev jev-1.14.0 · 800/9 tok";
const jsonl = (...events: object[]) =>
	events.map((e) => JSON.stringify(e)).join("\n");
const spawn = { type: "tool_use", name: "Agent", input: { prompt: "x" } };
const ompTask = (agent: string) => ({
	type: "tool_execution_start",
	toolName: "task",
	args: { tasks: [{ agent, task: "read it" }] },
});

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
	assert.equal(claude.parse({ stdout: jsonl(skipped), stderr: "" }).line, null);
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

test("omp: a router agent in the task args and the stderr line are evidence", () => {
	const stderr = `model-router task 1: L0 router_light · med · p=0.91/0.62 · jev jev-1.14.0 · 812/9 tok\n`;
	const evidence = omp.parse({
		stdout: jsonl(ompTask("router_light")),
		stderr,
	});
	assert.equal(evidence.spawns, 1);
	assert.equal(evidence.routed, true);
	assert.equal(evidence.tier, 0);
	assert.equal(evidence.effort, "med");
	assert.equal(evidence.target, "router_light");
	assert.match(evidence.line ?? "", /^task 1: L0 router_light/);
});

test("omp: the plain task agent is a spawn that was not routed", () => {
	const evidence = omp.parse({ stdout: jsonl(ompTask("task")), stderr: "" });
	assert.equal(evidence.spawns, 1);
	assert.equal(evidence.routed, false);
	assert.equal(evidence.line, null);
});

test("omp: a skipped entry is no decision line, and no spawn means no routing", () => {
	const stderr = "model-router task 1: skipped, api_key unset\n";
	const evidence = omp.parse({ stdout: "", stderr });
	assert.equal(evidence.spawns, 0);
	assert.equal(evidence.routed, false);
	assert.equal(evidence.line, null);
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
	record: ["tier", "effort"],
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

test("validateCases allows the drift record for omp only", () => {
	const withDrift = { ...base, record: ["drift"] };
	assert.ok(
		validateCases({ cases: [withDrift] }).some((p) => p.includes("drift")),
	);
	const ompCase = { ...withDrift, client: "omp", keyEnv: "OPENROUTER_API_KEY" };
	assert.deepEqual(validateCases({ cases: [ompCase] }), []);
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

test("drift compares bodies after the front matter, ignoring edge blank lines", () => {
	const bundled = "---\nname: task\n---\n\nWorker.\nDo it.\n";
	const copy = "---\n# note\nname: router_light\n---\nWorker.\nDo it.\n\n";
	assert.equal(bodyOf(bundled), "Worker.\nDo it.");
	assert.equal(sameBody(bundled, copy), true);
	assert.equal(sameBody(bundled, copy.replace("Do it", "Do that")), false);
});

test("hygiene flags key-shaped strings and un-normalised paths", () => {
	assert.deepEqual(
		hygieneProblems("f", "<work>/package.json p=0.9 Bearer ***"),
		[],
	);
	const dirty = [
		"key sk-abcdefghij1234",
		"Bearer abcdefgh12345678",
		'"api_key": "plain-value"',
		["", "Users", "someone"].join("/"),
		"/home/runner/work",
		"/private/var/x",
		"/tmp/x",
		"C:\\Users\\a",
	];
	for (const line of dirty)
		assert.ok(hygieneProblems("f", line).length > 0, line);
});

const here = new URL("../evals/", import.meta.url).pathname;

test("selftest passes on the committed cases and fixtures", () => {
	assert.deepEqual(
		selftest({
			casesPath: `${here}cases.json`,
			fixturesDir: `${here}fixtures`,
		}),
		[],
	);
});

test("selftest fails when a fixture loses its decision line", () => {
	const dir = mkdtempSync(join(tmpdir(), "evals-fx-"));
	try {
		cpSync(`${here}fixtures`, dir, { recursive: true });
		const path = join(dir, "claude.jsonl");
		const kept = readFileSync(path, "utf8")
			.split("\n")
			.filter((l) => !l.includes("ui_log"));
		writeFileSync(path, kept.join("\n"));
		const problems = selftest({
			casesPath: `${here}cases.json`,
			fixturesDir: dir,
		});
		assert.ok(problems.some((p) => p.includes("claude")));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("selftest rejects a synthetic fixture once synthetic ones are disallowed", () => {
	const problems = selftest({
		casesPath: `${here}cases.json`,
		fixturesDir: `${here}fixtures`,
		allowSynthetic: false,
	});
	assert.ok(problems.some((p) => p.includes("synthetic")));
});

const PATH_VAR = "PATH";
test("a client binary that is missing is a recorded failure, not a crash", () => {
	const path = process.env[PATH_VAR];
	process.env[PATH_VAR] = mkdtempSync(join(tmpdir(), "evals-empty-path-"));
	try {
		const result = runCase(base, tmpdir());
		assert.equal(result.passed, false);
		assert.ok(
			result.failures.some((f) => f.startsWith("client failed to run")),
		);
		assert.equal(result.clientVersion, "");
	} finally {
		process.env[PATH_VAR] = path;
	}
});

const AGENT_BODY = "---\nname: task\n---\nWorker agent.\n";

// A stand-in omp whose `agents unpack --dir <dir>` writes one bundled task agent.
function fakeOmpPath(): string {
	const bin = mkdtempSync(join(tmpdir(), "evals-fake-omp-"));
	writeFileSync(
		join(bin, "omp"),
		`#!/bin/sh\ncat > "$4/task.md" <<'BODY'\n${AGENT_BODY}BODY\n`,
	);
	chmodSync(join(bin, "omp"), 0o755);
	return bin;
}

function copiesWith(body: string): string {
	const dir = mkdtempSync(join(tmpdir(), "evals-copies-"));
	for (const name of ["router_light", "router_mid", "router_heavy"])
		writeFileSync(join(dir, `${name}.md`), `---\nname: ${name}\n---\n${body}`);
	return dir;
}

test("drift: copies with the bundled body read as the same", () => {
	const drift = recordDrift(
		{ PATH: `${fakeOmpPath()}:/bin:/usr/bin` },
		copiesWith("Worker agent.\n"),
	);
	assert.deepEqual(drift, {
		agents: { router_light: "same", router_mid: "same", router_heavy: "same" },
	});
});

test("drift: a changed copy reads as drifted", () => {
	const drift = recordDrift(
		{ PATH: `${fakeOmpPath()}:/bin:/usr/bin` },
		copiesWith("Another body.\n"),
	);
	assert.deepEqual(drift, {
		agents: {
			router_light: "drifted",
			router_mid: "drifted",
			router_heavy: "drifted",
		},
	});
});

test("drift: an omp that cannot run is an error, not a throw", () => {
	const empty = mkdtempSync(join(tmpdir(), "evals-empty-path-"));
	const drift = recordDrift({ PATH: empty }, copiesWith("Worker agent.\n"));
	assert.ok("error" in drift);
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
