import assert from "node:assert/strict";
import { test } from "node:test";
import { capped, carriesLevel } from "./omp-effort.ts";

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
