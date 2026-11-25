import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Schema, validate } from "./build/schema.ts";
import { loadSchema, loadSource } from "./build/source.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const schema = loadSchema(ROOT);
// JSON.parse is untyped, so each test can break a copy at any depth.
const source = () => JSON.parse(JSON.stringify(loadSource(ROOT)));

test("the real source passes its schema", () => {
	assert.deepEqual(validate(schema, source()), []);
});

test("an unknown key fails and names its path", () => {
	const broken = source();
	broken.options.provider.colour = "red";
	assert.deepEqual(validate(schema, broken), [
		"$.options.provider.colour: unknown key",
	]);
});

test("a missing required key fails and names its path", () => {
	const broken = source();
	delete broken.claude.userConfig.keys.typesafe.title;
	assert.deepEqual(validate(schema, broken), [
		"$.claude.userConfig.keys.typesafe.title: required key is missing",
	]);
});

test("a wrong type fails and names its path", () => {
	const broken = source();
	broken.version = 16;
	broken.keywords[1] = false;
	assert.deepEqual(validate(schema, broken), [
		"$.version: expected string, got number",
		"$.keywords[1]: expected string, got boolean",
	]);
});

test("an empty text fails the length rule", () => {
	const broken = source();
	broken.descriptions.omp.manifest = "";
	assert.match(
		validate(schema, broken).join("\n"),
		/\$\.descriptions\.omp\.manifest/,
	);
});

test("a schema keyword the validator does not implement is refused", () => {
	const odd = { type: "string", format: "uri" } as Schema;
	assert.deepEqual(validate(odd, "x"), [
		"$: schema keyword format is not supported",
	]);
});

test("a reference to a missing definition is refused", () => {
	const odd: Schema = { $ref: "#/$defs/nope" };
	assert.deepEqual(validate(odd, "x"), [
		"$: schema reference #/$defs/nope is not defined",
	]);
});

test("a harness without install data fails and names its path", () => {
	const broken = source();
	delete broken.omp.install;
	assert.deepEqual(validate(schema, broken), [
		"$.omp.install: required key is missing",
	]);
});

test("a keyword next to a reference is a schema error, not a data problem", () => {
	const odd = {
		$defs: { text: { type: "string" } },
		$ref: "#/$defs/text",
		minLength: 3,
	} as Schema;
	assert.throws(() => validate(odd, "x"), /minLength.*\$ref/);
});

test("an annotation next to a reference is allowed", () => {
	const fine = {
		$defs: { text: { type: "string" } },
		$ref: "#/$defs/text",
		description: "a note",
	} as Schema;
	assert.deepEqual(validate(fine, "x"), []);
});

test("an additionalProperties that is not a boolean is a schema error", () => {
	const odd = {
		type: "object",
		additionalProperties: "no",
	} as unknown as Schema;
	assert.throws(() => validate(odd, {}), /additionalProperties.*boolean/);
});

test("an enum lists the allowed values and a value outside it fails", () => {
	const schema = { type: "string", enum: ["a", "b"] } as Schema;
	assert.deepEqual(validate(schema, "a"), []);
	assert.deepEqual(validate(schema, "c"), ["$: not one of a, b"]);
});

test("a default is an annotation and does not constrain the value", () => {
	const schema = { type: "string", default: "a" } as Schema;
	assert.deepEqual(validate(schema, "z"), []);
});

test("an additionalProperties schema checks each unnamed member and names its path", () => {
	const schema = {
		type: "object",
		properties: { named: { type: "number" } },
		additionalProperties: { type: "string" },
	} as unknown as Schema;
	assert.deepEqual(validate(schema, { named: 1, a: "x" }), []);
	assert.deepEqual(validate(schema, { named: 1, a: "x", b: 2 }), [
		"$.b: expected string, got number",
	]);
});

test("a type may list several kinds, and a value of another kind names them", () => {
	const schema = { type: ["string", "object"] } as unknown as Schema;
	assert.deepEqual(validate(schema, "a"), []);
	assert.deepEqual(validate(schema, {}), []);
	assert.deepEqual(validate(schema, 1), [
		"$: expected string or object, got number",
	]);
});

test("the models record is required, and so are its four harness texts", () => {
	const missing = source();
	delete missing.models;
	assert.deepEqual(validate(schema, missing), [
		"$.models: required key is missing",
	]);
	const partial = source();
	delete partial.models.descriptions.hermes;
	assert.deepEqual(validate(schema, partial), [
		"$.models.descriptions.hermes: required key is missing",
	]);
});

test("the removed Claude Code model option is required", () => {
	const broken = source();
	delete broken.claude.userConfig.model;
	assert.deepEqual(validate(schema, broken), [
		"$.claude.userConfig.model: required key is missing",
	]);
});

test("the models record holds the shared title and one identical text for each harness", () => {
	const { models } = loadSource(ROOT);
	const text =
		"The scoring model of each provider as provider:model entries, such as {typesafe:jev-latest, openai:gpt-6-luna}; a provider without an entry uses its default model.";
	assert.deepEqual(models, {
		title: "Scoring models",
		descriptions: { claude: text, omp: text, openclaw: text, hermes: text },
	});
});
