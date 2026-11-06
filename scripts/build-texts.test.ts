import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BUDGET_CHARS, ROLE_CAP } from "../src/brief.ts";
import { PROVIDER_VALUES } from "../src/provider.ts";
import { SCOPE_VALUES } from "../src/scope.ts";
import { VALUE_SETTINGS, type ValueSetting } from "../src/settings.ts";
import { loadSource } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = loadSource(ROOT);

const VALUES: Readonly<Record<ValueSetting, readonly string[]>> = {
	provider: PROVIDER_VALUES,
	scope: SCOPE_VALUES,
};
// The omp provider text explains only the two values that narrow the order.
const UNNAMED: Readonly<
	Partial<Record<ValueSetting, Partial<Record<Harness, string[]>>>>
> = {
	provider: {
		omp: ["typesafe", "openrouter"],
		openclaw: ["typesafe", "openrouter"],
	},
};
const HARNESSES = ["claude", "omp", "openclaw"] as const;
type Harness = (typeof HARNESSES)[number];

// The texts name a value as a lowercase label before a colon: "auto: TypeSafe, then ...".
const labelsOf = (text: string) =>
	[...text.matchAll(/(?:^|\. )([a-z][a-z-]*): /g)].map(([, label]) => label);

test("each option text names the values of its setting, bar the exceptions listed here", () => {
	for (const setting of VALUE_SETTINGS)
		for (const harness of HARNESSES) {
			const unnamed = UNNAMED[setting]?.[harness] ?? [];
			const expected = VALUES[setting].filter((v) => !unnamed.includes(v));
			const labels = labelsOf(source.options[setting].descriptions[harness]);
			assert.deepEqual(
				labels.sort(),
				[...expected].sort(),
				`${setting} option text for ${harness}`,
			);
		}
});

function* stringsOf(node: unknown, path = "$"): Generator<[string, string]> {
	if (typeof node === "string") yield [path, node];
	else if (typeof node === "object" && node !== null)
		for (const [key, member] of Object.entries(node))
			yield* stringsOf(member, `${path}.${key}`);
}

const STATED_LIMIT = /(at most|cut to) ([\d,]+) characters/g;
const LIMITS: Readonly<Record<string, number>> = {
	"at most": BUDGET_CHARS,
	"cut to": ROLE_CAP,
};

test("every character limit in the source states the number src/ enforces", () => {
	const seen = new Set<string>();
	for (const [path, text] of stringsOf(source)) {
		for (const [, phrase = "", stated] of text.matchAll(STATED_LIMIT)) {
			seen.add(phrase);
			assert.equal(stated, (LIMITS[phrase] ?? 0).toLocaleString("en-US"), path);
		}
		const count = (text.match(/\d[\d,]* characters/g) ?? []).length;
		const phrased = (text.match(STATED_LIMIT) ?? []).length;
		assert.equal(count, phrased, `${path} states a limit without its phrase`);
	}
	assert.deepEqual([...seen].sort(), Object.keys(LIMITS).sort());
});

// Every plugin sends a call's one-line description or label as written, so no text may put it under the masking.
const ONE_LINE = /\b(one-line|label|descriptions)\b/;
const UNMASKED = /one-line (description|label) as written, unmasked/;

test("no manifest or catalogue text puts the one-line description or label under masking", () => {
	for (const [path, text] of stringsOf(source.descriptions, "$.descriptions")) {
		for (const sentence of text.split(/(?<=\.)\s+/)) {
			if (!ONE_LINE.test(sentence) || !/\bmasked\b/.test(sentence)) continue;
			assert.match(sentence, UNMASKED, `${path}: ${sentence}`);
		}
	}
});
