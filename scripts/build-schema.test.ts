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
	delete broken.claude.userConfig.keys.api_key.title;
	assert.deepEqual(validate(schema, broken), [
		"$.claude.userConfig.keys.api_key.title: required key is missing",
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
