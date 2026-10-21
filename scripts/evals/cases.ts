import { readFileSync } from "node:fs";
import { ADAPTERS } from "./adapters.ts";
import { get, isRecord } from "./stream.ts";
import type { Evidence } from "./types.ts";

const ASSERTIONS = ["spawned", "routed", "line"] as const;
const RECORDS = ["tier", "effort", "drift"] as const;
const DRIFT_CLIENT = "omp";
export type Assertion = (typeof ASSERTIONS)[number];

export type Case = {
	id: string;
	client: string;
	model: string;
	keyEnv: string;
	prompt: string;
	files: Record<string, unknown>;
	assert: Assertion[];
	record: string[];
};

const FAILURES: Record<Assertion, (e: Evidence) => string | null> = {
	spawned: (e) => (e.spawns >= 1 ? null : "no subagent was spawned"),
	routed: (e) => (e.routed ? null : "the first spawn was not routed"),
	line: (e) => (e.line !== null ? null : "no decision line"),
};

export function check(c: Case, evidence: Evidence): string[] {
	return c.assert.flatMap((name) => FAILURES[name](evidence) ?? []);
}

const isText = (v: unknown): v is string => typeof v === "string" && v !== "";
const isNames = (v: unknown): v is string[] =>
	Array.isArray(v) && v.every(isText);

function caseProblems(c: unknown, at: string): string[] {
	if (!isRecord(c)) return [`${at}: expected an object`];
	const { client, files, assert: asserts, record } = c;
	const problems: string[] = [];
	for (const field of ["id", "client", "model", "keyEnv", "prompt"])
		if (!isText(c[field]))
			problems.push(`${at}: ${field} must be a non-empty string`);
	if (isText(client) && !(client in ADAPTERS))
		problems.push(`${at}: unknown client ${client}`);
	if (!isRecord(files)) problems.push(`${at}: files must be an object`);
	if (!isNames(asserts) || asserts.length === 0) {
		problems.push(`${at}: assert must be a non-empty list`);
	} else {
		for (const name of asserts)
			if (!(ASSERTIONS as readonly string[]).includes(name))
				problems.push(`${at}: unknown assertion ${name}`);
	}
	if (!isNames(record)) return [...problems, `${at}: record must be a list`];
	for (const name of record) {
		if (!(RECORDS as readonly string[]).includes(name))
			problems.push(`${at}: unknown record ${name}`);
		if (name === "drift" && client !== DRIFT_CLIENT)
			problems.push(`${at}: drift is recorded for ${DRIFT_CLIENT} only`);
	}
	return problems;
}

export function validateCases(raw: unknown): string[] {
	const list = isRecord(raw) ? get(raw, "cases") : undefined;
	if (!Array.isArray(list) || list.length === 0)
		return ["cases: expected a non-empty list"];
	const problems = list.flatMap((c, i) => caseProblems(c, `cases[${i}]`));
	const seen = new Set<string>();
	for (const c of list) {
		const id = isRecord(c) ? get(c, "id") : undefined;
		if (!isText(id)) continue;
		if (seen.has(id)) problems.push(`cases: duplicate id ${id}`);
		seen.add(id);
	}
	return problems;
}

export function loadCases(path: string): Case[] {
	const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
	const problems = validateCases(raw);
	if (problems.length > 0)
		throw new Error(`invalid cases:\n${problems.join("\n")}`);
	return (raw as { cases: Case[] }).cases;
}
