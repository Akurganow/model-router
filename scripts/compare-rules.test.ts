import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Level } from "../src/part.ts";
import {
	crossValidate,
	main,
	type Row,
	readRows,
	score,
} from "./compare-rules.ts";
import { FITTED_ON, fitWarning } from "./jev-fit.ts";
import { OTHER_JEV } from "./jev-fit-fakes.ts";

const P = (a: number, b: number, c: number) => ({ 0: a, 1: b, 2: c });
const row = (expected: Level, contested: string[] = []): Row => ({
	description: "case",
	expected,
	work: 1,
	tier: P(0.1, 0.2, 0.7),
	workProbabilities: P(0.2, 0.6, 0.2),
	contested,
});
const TIER = { key: "tier", label: "expected", probs: "tier" } as const;

test("score counts agreement, direction, recall and the share of each pick", () => {
	const rows = [row(0), row(1), row(2, ["expected"]), row(2)];
	const s = score(rows, [0, 2, 1, 2], TIER);
	assert.equal(s.agreement, 0.5);
	assert.equal(s.uncontested, 2 / 3);
	assert.equal(s.under, 0.25);
	assert.equal(s.over, 0.25);
	assert.deepEqual(s.recall, [1, 0, 0.5]);
	assert.deepEqual(s.share, [0.25, 0.25, 0.5]);
	assert.deepEqual(s.confusion, [
		[1, 0, 0],
		[0, 0, 1],
		[0, 1, 1],
	]);
});

test("crossValidate picks every row with a rule fitted without it", () => {
	const rows = Array.from({ length: 10 }, (_, i) => row((i % 3) as Level));
	const seen: number[] = [];
	const held = crossValidate(
		{
			name: "probe",
			fit: (train) => {
				seen.push(train.length);
				return { tier: () => 1, work: () => 1 };
			},
		},
		rows,
	);
	assert.deepEqual(seen, [8, 8, 8, 8, 8]);
	assert.equal(held.tier.length, 10);
});

test("readRows refuses a record that does not match the calibration set", () => {
	assert.throws(
		() => readRows('{"expected":0}\n', '{"expected":0}\n{"expected":1}\n'),
		/record again/,
	);
});

test("readRows refuses a record whose rows name other cases", () => {
	assert.throws(
		() => readRows('{"description":"a"}\n', '{"description":"b"}\n'),
		/row 1 is "a"/,
	);
});

afterEach(() => mock.restoreAll());

// A record of every calibration case, each row answered by the given models in turn.
async function compareRecordOf(...models: string[]) {
	const out: string[] = [];
	const errors: string[] = [];
	mock.method(console, "log", (text: unknown) => void out.push(`${text}`));
	mock.method(console, "error", (text: unknown) => void errors.push(`${text}`));
	const dir = mkdtempSync(join(tmpdir(), "compare-rules-"));
	const record = join(dir, "record.jsonl");
	const cases = readFileSync(
		new URL("../calibration.jsonl", import.meta.url),
		"utf8",
	)
		.trim()
		.split("\n")
		.map((l) => JSON.parse(l));
	writeFileSync(
		record,
		cases
			.map((c, i) =>
				JSON.stringify({
					description: c.description,
					expected: c.expected,
					work: c.work,
					tier: P(0.1, 0.2, 0.7),
					workProbabilities: P(0.2, 0.6, 0.2),
					model: models[i % models.length],
				}),
			)
			.map((l) => `${l}\n`)
			.join(""),
	);
	const rule = fileURLToPath(new URL("rules/current.ts", import.meta.url));
	try {
		return { code: await main([record, rule]), out, errors };
	} finally {
		rmSync(dir, { recursive: true });
	}
}

test("main warns on stderr once per other model the record's rows name", async () => {
	const { code, out, errors } = await compareRecordOf(
		FITTED_ON,
		OTHER_JEV,
		OTHER_JEV,
	);
	assert.equal(code, 0);
	assert.deepEqual(errors, [fitWarning(OTHER_JEV)]);
	assert.match(out.join("\n"), /^current tier: agreement/m);
});

test("main prints no warning for a record of the fitted model", async () => {
	const { code, out, errors } = await compareRecordOf(FITTED_ON);
	assert.equal(code, 0);
	assert.deepEqual(errors, []);
	assert.match(out.join("\n"), /^current work: agreement/m);
});
