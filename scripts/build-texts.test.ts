import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BUDGET_CHARS, ROLE_CAP } from "#core/brief/brief.ts";
import { SCOPE_VALUES } from "#core/options/scope.ts";
import type { ValueSetting } from "#core/options/settings.ts";
import { GATEWAYS, KEY_FIELDS, MAKERS } from "#core/providers/provider.ts";
import { renderClaude } from "./build/claude.ts";
import { renderHermes } from "./build/hermes.ts";
import { renderOmp } from "./build/omp.ts";
import { renderOpenclaw } from "./build/openclaw.ts";
import {
	CLAUDE_OUTPUTS,
	HERMES_OUTPUTS,
	OMP_OUTPUTS,
	OPENCLAW_OUTPUTS,
} from "./build/outputs.ts";
import { loadSource } from "./build/source.ts";
import { HARNESS_SETTINGS, HARNESSES, type Harness } from "./build/values.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const source = loadSource(ROOT);

const VALUES: Readonly<Record<ValueSetting, readonly string[]>> = {
	provider: MAKERS,
	gateway: GATEWAYS,
	scope: SCOPE_VALUES,
};

const parse = (files: { path: string; text: string }[], path: string) =>
	JSON.parse(files.find((file) => file.path === path)?.text ?? "{}");
const claude = parse(renderClaude(source), CLAUDE_OUTPUTS.manifest);
const omp = parse(renderOmp(source), OMP_OUTPUTS.manifest);
const openclaw = parse(renderOpenclaw(source), OPENCLAW_OUTPUTS.manifest);
const hermes = parse(renderHermes(source), HERMES_OUTPUTS.manifest);

type Field = {
	readonly title?: string | undefined;
	readonly description: string;
};
type Form = Readonly<Record<string, Field>>;

const renamed = (
	record: Readonly<Record<string, Readonly<Record<string, string>>>>,
	text: "help" | "description",
): Form =>
	Object.fromEntries(
		Object.entries(record).map(([name, hint]) => [
			name,
			{ title: hint["label"], description: hint[text] ?? "" },
		]),
	);

// Each built settings form, by the fields a person reads in it: a title or label, and a text.
const FORMS: Readonly<Record<Harness, Form>> = {
	claude: claude.userConfig,
	omp: omp.omp.settings,
	openclaw: renamed(openclaw.uiHints, "help"),
	hermes: renamed(hermes.config_schema, "description"),
};

const SHARED = [
	"provider",
	"gateway",
	"scope",
	"models",
	...Object.values(KEY_FIELDS),
];

const wholeWord = (text: string, word: string) =>
	new RegExp(`(?<![\\w-])${word}(?![\\w-])`).test(text);

// A value-setting text has the shape "<question>: <v1> (gloss), <v2> or <v3>.", so the values are what stays after the glosses go.
const valuesNamed = (text: string): string[] =>
	text
		.slice(text.indexOf(": ") + 2)
		.replace(/ \([^)]*\)/g, "")
		.replace(/\.$/, "")
		.split(/, | or /);

test("each setting text names exactly the values of its setting, in order", () => {
	for (const harness of HARNESSES)
		for (const setting of HARNESS_SETTINGS[harness]) {
			const field = FORMS[harness][setting];
			assert.ok(field, `the ${harness} form holds ${setting}`);
			assert.deepEqual(
				valuesNamed(field.description),
				[...VALUES[setting]],
				`${setting} text for ${harness}`,
			);
		}
});

test("each models text names every maker as a whole word", () => {
	for (const [harness, form] of Object.entries(FORMS))
		for (const maker of MAKERS)
			assert.ok(
				wholeWord(form["models"]?.description ?? "", maker),
				`models text for ${harness} names ${maker}`,
			);
});

test("in each built form every key field comes after every other field", () => {
	const keys = new Set<string>(Object.values(KEY_FIELDS));
	for (const [harness, form] of Object.entries(FORMS)) {
		const names = Object.keys(form);
		const firstKey = names.findIndex((name) => keys.has(name));
		const afterFirstKey = firstKey < 0 ? [] : names.slice(firstKey);
		assert.ok(
			afterFirstKey.every((name) => keys.has(name)),
			`${harness} puts a key field before another field: ${names.join(", ")}`,
		);
	}
});

test("no text or title of any built form holds a sentence break", () => {
	for (const [harness, form] of Object.entries(FORMS))
		for (const [name, field] of Object.entries(form))
			for (const text of [field.title ?? "", field.description])
				assert.doesNotMatch(text, /\. [A-Z]/, `${harness} ${name}`);
});

test("a setting that two or more built forms hold has the same text in each", () => {
	for (const name of SHARED) {
		const texts = Object.values(FORMS).flatMap((form) =>
			form[name] === undefined ? [] : [form[name].description],
		);
		assert.ok(texts.length >= 2, `${name} is held by two forms`);
		assert.equal(new Set(texts).size, 1, `${name} has one text`);
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
