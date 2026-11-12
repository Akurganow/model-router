import assert from "node:assert/strict";
import { test } from "node:test";
import type { Effort } from "./ladder.ts";
import { capped, carriesLevel, planEffort, type Routed } from "./omp-effort.ts";

// omp's parser at 18.12.6 and 18.18.9: full names, `auto`, and unambiguous prefixes of two characters or more.
const LEVELS = [
	"inherit",
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
	"auto",
	"in",
	"of",
	"mi",
	"min",
	"lo",
	"me",
	"med",
	"hi",
	"xh",
	"xhi",
	"ma",
];
const NOT_LEVELS = [
	"",
	"m",
	"x",
	"h",
	"au",
	"free",
	"8b",
	"latest",
	"thinking",
	"High",
	"1",
];

for (const suffix of LEVELS)
	test(`a pattern ending in :${suffix} carries a level`, () => {
		assert.equal(carriesLevel(`prov/model:${suffix}`), true);
	});

for (const suffix of NOT_LEVELS)
	test(`a pattern ending in :${suffix} carries no level`, () => {
		assert.equal(carriesLevel(`prov/model:${suffix}`), false);
	});

test("only the last colon counts, and no colon is no level", () => {
	assert.equal(carriesLevel("prov/model:low:8b"), false);
	assert.equal(carriesLevel("prov/model:8b:low"), true);
	assert.equal(carriesLevel("prov/model"), false);
	assert.equal(carriesLevel("@smol:hi"), true);
});

const CAPS: [unknown, string, string | undefined][] = [
	[undefined, "xhigh", "xhigh"],
	["max", "xhigh", "xhigh"],
	["xhigh", "xhigh", "xhigh"],
	["high", "xhigh", "high"],
	["high", "medium", "medium"],
	["medium", "high", "medium"],
	["low", "xhigh", "low"],
	["low", "low", "low"],
	["minimal", "low", undefined],
	["off", "medium", undefined],
	["turbo", "medium", undefined],
	[3, "medium", undefined],
];

for (const [ceiling, effort, expected] of CAPS)
	test(`a ceiling of ${String(ceiling)} turns ${effort} into ${expected}`, () => {
		assert.equal(capped(effort as "low", ceiling), expected);
	});

const routed = (role: string | undefined): Routed => ({
	level: role === undefined ? 1 : 0,
	role,
	ladder: "high",
	callerEffort: false,
	probabilities: "0.90/0.90",
	suffix: "",
});
const planFor = (roles: Record<string, unknown>) =>
	planEffort(routed("@smol"), { roles, maxEffort: undefined }, ["prov/parent"]);
const KEPT = { kept: "config effort" };
const SET = { set: "high" };

test("a level on any comma-separated pattern of the role counts", () => {
	assert.deepEqual(planFor({ smol: "prov/a, prov/b:low" }), KEPT);
	assert.deepEqual(planFor({ smol: "prov/a, prov/b:8b" }), SET);
});

test("a role given as a list counts each entry", () => {
	assert.deepEqual(planFor({ smol: ["prov/a", "prov/b:low"] }), KEPT);
	assert.deepEqual(planFor({ smol: ["prov/a", 3] }), SET);
});

test("a cycle of roles ends, and a level on a role in the chain counts", () => {
	assert.deepEqual(planFor({ smol: "@other", other: "@smol" }), SET);
	assert.deepEqual(
		planFor({ smol: "@other", other: "@third, @smol", third: "x:hi" }),
		KEPT,
	);
});

test("a role that only the prototype holds is no configured role", () => {
	const roles = Object.create({ smol: "prov/small:low" }) as Record<
		string,
		unknown
	>;
	assert.deepEqual(planFor(roles), SET);
});

test("level 1 keeps a level on a pattern, an end level does not", () => {
	const facts = { roles: {}, maxEffort: undefined };
	assert.deepEqual(planEffort(routed(undefined), facts, ["prov/p:low"]), KEPT);
	assert.deepEqual(planEffort(routed("@smol"), facts, ["prov/p:low"]), SET);
});

const LADDER: readonly Effort[] = ["low", "medium", "high", "xhigh"];
const OMP_CEILINGS = [
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

test("every ceiling caps every ladder effort at a ladder effort no higher than the ceiling", () => {
	for (const ceiling of OMP_CEILINGS)
		for (const effort of LADDER) {
			const result = capped(effort, ceiling);
			if (result === undefined) {
				assert.equal(ceiling, "minimal");
				continue;
			}
			assert.ok(LADDER.includes(result), `${effort} under ${ceiling}`);
			assert.ok(
				OMP_CEILINGS.indexOf(result) <= OMP_CEILINGS.indexOf(ceiling),
				`${effort} under ${ceiling} gave ${result}`,
			);
			assert.ok(LADDER.indexOf(result) <= LADDER.indexOf(effort));
		}
});
