import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ADAPTERS } from "./adapters.ts";
import { type Case, check, validateCases } from "./cases.ts";
import { hygieneProblems } from "./hygiene.ts";
import { get, jsonLines } from "./stream.ts";
import type { Captured } from "./types.ts";

// The first change that lands recorded fixtures sets this to false, so a synthetic one fails from then on.
export const SYNTHETIC_ALLOWED = true;

// Any decision line of either client: the Claude one inside a ui_log event, the omp one on stderr.
const DECISION_SHAPE = /L[012] \S+ · [^·]+ · p=\d/;
const RECORDED_FIELDS = ["client_version", "run", "date"];

export type SelftestOptions = {
	casesPath: string;
	fixturesDir: string;
	allowSynthetic?: boolean;
};

const without = (text: string): string =>
	text
		.split("\n")
		.filter((line) => !DECISION_SHAPE.test(line))
		.join("\n");

function readFixture(
	dir: string,
	client: string,
): { text: Captured; files: [string, string][] } {
	const stdoutName = `${client}.jsonl`;
	const stderrName = `${client}.stderr.txt`;
	const read = (name: string) =>
		existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "";
	const stdout = read(stdoutName);
	const stderr = read(stderrName);
	return {
		text: { stdout, stderr },
		files: [
			[stdoutName, stdout],
			[stderrName, stderr],
		],
	};
}

function markerProblems(
	client: string,
	stdout: string,
	allowSynthetic: boolean,
): string[] {
	const marker = jsonLines(stdout)[0];
	if (!marker || get(marker, "type") !== "fixture")
		return [`${client}: the first fixture line is no fixture marker`];
	if (get(marker, "synthetic") === true) {
		return allowSynthetic
			? []
			: [
					`${client}: fixture is marked synthetic, recorded streams are required`,
				];
	}
	return RECORDED_FIELDS.filter((f) => typeof get(marker, f) !== "string").map(
		(f) => `${client}: recorded fixture marker lacks ${f}`,
	);
}

function caseProblems(c: Case, text: Captured): string[] {
	const adapter = ADAPTERS[c.client];
	if (!adapter) return [];
	const problems = check(c, adapter.parse(text)).map(
		(f) => `${c.id}: fixture fails: ${f}`,
	);
	const stripped = {
		stdout: without(text.stdout),
		stderr: without(text.stderr),
	};
	if (check(c, adapter.parse(stripped)).length === 0)
		problems.push(`${c.id}: the case still passes without the decision line`);
	return problems;
}

export function selftest(options: SelftestOptions): string[] {
	const {
		casesPath,
		fixturesDir,
		allowSynthetic = SYNTHETIC_ALLOWED,
	} = options;
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(casesPath, "utf8"));
	} catch (error) {
		return [`cases: ${error instanceof Error ? error.message : String(error)}`];
	}
	const invalid = validateCases(raw);
	if (invalid.length > 0) return invalid;
	const cases = (raw as { cases: Case[] }).cases;
	const problems: string[] = [];
	for (const client of new Set(cases.map((c) => c.client))) {
		const { text, files } = readFixture(fixturesDir, client);
		if (text.stdout === "") {
			problems.push(`${client}: fixture ${client}.jsonl is missing or empty`);
			continue;
		}
		problems.push(...markerProblems(client, text.stdout, allowSynthetic));
		for (const [name, content] of files)
			problems.push(...hygieneProblems(name, content));
		for (const c of cases.filter((x) => x.client === client))
			problems.push(...caseProblems(c, text));
	}
	return problems;
}
