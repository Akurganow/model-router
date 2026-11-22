import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BUDGET_CHARS, ROLE_CAP } from "#core/brief/brief.ts";
import { SCOPE_VALUES } from "#core/options/scope.ts";
import type { ValueSetting } from "#core/options/settings.ts";
import { GATEWAYS, MAKERS } from "#core/providers/provider.ts";
import { loadSource } from "./build/source.ts";
import { HARNESS_SETTINGS } from "./build/values.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = loadSource(ROOT);

const VALUES: Readonly<Record<ValueSetting, readonly string[]>> = {
	provider: MAKERS,
	gateway: GATEWAYS,
	scope: SCOPE_VALUES,
};

// The texts name a value as a lowercase label before a colon: "auto: TypeSafe, then ...".
const labelsOf = (text: string) =>
	[...text.matchAll(/(?:^|\. )([a-z][a-z-]*): /g)].map(([, label]) => label);

test("each option text names every value of its setting", () => {
	for (const [harness, settings] of Object.entries(HARNESS_SETTINGS))
		for (const setting of settings) {
			const descriptions: Record<string, string | undefined> =
				source.options[setting].descriptions;
			const labels = labelsOf(descriptions[harness] ?? "");
			assert.deepEqual(
				labels.sort(),
				[...VALUES[setting]].sort(),
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

// Every plugin masks a call's one-line description or label like the task text, so no text may call it unmasked.
const ONE_LINE = /\bone-line (description|label)\b/;
const UNMASKED = /\b(unmasked|as written)\b/;

test("no manifest or catalogue text calls the one-line description or label unmasked", () => {
	for (const [path, text] of stringsOf(source.descriptions, "$.descriptions")) {
		for (const sentence of text.split(/(?<=\.)\s+/)) {
			if (!ONE_LINE.test(sentence)) continue;
			assert.doesNotMatch(sentence, UNMASKED, `${path}: ${sentence}`);
		}
	}
});
