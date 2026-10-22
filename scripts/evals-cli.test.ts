import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { Case } from "./evals/cases.ts";
import type { runCase } from "./evals/run.ts";
import { TYPESAFE_KEY } from "./evals/scrub.ts";
import { main } from "./evals.ts";
import { useTempRoot } from "./temp-root.ts";

const KEY_ENV = "EVALS_CLI_TEST_KEY";
const CASE: Case = {
	id: "one",
	client: "claude",
	model: "sonnet",
	keyEnv: KEY_ENV,
	prompt: "go",
	files: {},
	assert: ["spawned"],
};
const EVIDENCE = {
	spawns: 1,
	routed: true,
	line: null,
	tier: null,
	effort: null,
	target: null,
	reply: null,
};

const box = useTempRoot("evals-cli-", (put) =>
	put("cases.json", JSON.stringify({ cases: [CASE] })),
);

const resultFor = (
	c: Case,
	failures: string[],
): ReturnType<typeof runCase> => ({
	case: c.id,
	client: c.client,
	clientVersion: "1.0.0",
	model: c.model,
	date: "2026-01-01T00:00:00.000Z",
	durationS: 1,
	exitCode: 0,
	evidence: EVIDENCE,
	failures,
	passed: failures.length === 0,
	stdout: "",
	stderr: "",
});

const saved = new Map<string, string | undefined>();
let out: string[] = [];
beforeEach(() => {
	for (const name of [KEY_ENV, TYPESAFE_KEY])
		saved.set(name, process.env[name]);
	delete process.env[KEY_ENV];
	delete process.env[TYPESAFE_KEY];
	out = [];
	mock.method(console, "log", (text: unknown) => void out.push(`${text}`));
	mock.method(console, "error", (text: unknown) => void out.push(`${text}`));
});
afterEach(() => {
	mock.restoreAll();
	for (const [name, value] of saved) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

const run = (...args: string[]) => [
	"run",
	"--cases",
	join(box.root, "cases.json"),
	"--out",
	join(box.root, "results"),
	...args,
];

test("no mode and an unknown mode print the usage and exit 2", () => {
	assert.equal(main([]), 2);
	assert.equal(main(["nope"]), 2);
	assert.match(out.join("\n"), /usage:/);
});

test("a client without a case exits 2", () => {
	assert.equal(main(run("--client", "omp")), 2);
	assert.match(out.join("\n"), /no case for omp/);
});

test("unset keys exit 2 and name each once", () => {
	assert.equal(main(run()), 2);
	assert.match(
		out.join("\n"),
		new RegExp(`unset: ${KEY_ENV}, ${TYPESAFE_KEY}`),
	);
});

test("a passing case writes its result with a two-space indent and exits 0", () => {
	process.env[KEY_ENV] = "k";
	process.env[TYPESAFE_KEY] = "k";
	assert.equal(
		main(run(), (c) => resultFor(c, [])),
		0,
	);
	assert.deepEqual(out, ["one: pass"]);
	const text = readFileSync(join(box.root, "results", "one.json"), "utf8");
	assert.equal(text, `${JSON.stringify(resultFor(CASE, []), null, 2)}\n`);
});

test("a failing case is named and exits 1", () => {
	process.env[KEY_ENV] = "k";
	process.env[TYPESAFE_KEY] = "k";
	assert.equal(
		main(run(), (c) => resultFor(c, ["no decision line"])),
		1,
	);
	assert.deepEqual(out, ["one: FAIL no decision line"]);
});
