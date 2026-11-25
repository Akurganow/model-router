/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	formatModels,
	isSilentModels,
	readModels,
} from "#core/options/models.ts";

test("a silent value names no model", () => {
	for (const stored of [undefined, null, "", "   "])
		assert.deepEqual(readModels(stored), { models: {} }, String(stored));
});

test("empty braces name no model", () => {
	for (const stored of ["{}", "{ }", " {  } "])
		assert.deepEqual(readModels(stored), { models: {} }, stored);
});

test("the owner's form reads with and without braces", () => {
	for (const stored of [
		"{typesafe:jev-preview, openai:gpt-6-luna}",
		"typesafe:jev-preview, openai:gpt-6-luna",
	])
		assert.deepEqual(
			readModels(stored),
			{ models: { typesafe: "jev-preview", openai: "gpt-6-luna" } },
			stored,
		);
});

test("the owner's form allows spaces around entries and one trailing comma", () => {
	assert.deepEqual(
		readModels("  { typesafe : jev-preview ,  google:gemini-decision-1 , } "),
		{
			models: { typesafe: "jev-preview", google: "gemini-decision-1" },
		},
	);
	assert.deepEqual(readModels("openai:gpt-6-luna,"), {
		models: { openai: "gpt-6-luna" },
	});
});

test("an entry splits at its first colon", () => {
	assert.deepEqual(readModels("openai:gpt:6"), { models: { openai: "gpt:6" } });
});

test("a JSON text reads as a map of strings", () => {
	assert.deepEqual(
		readModels('{"typesafe": "jev-preview", "google": " gemini-decision-1 "}'),
		{ models: { typesafe: "jev-preview", google: "gemini-decision-1" } },
	);
});

test("a native object reads entry by entry", () => {
	assert.deepEqual(readModels({ openai: "gpt-6-luna" }), {
		models: { openai: "gpt-6-luna" },
	});
	assert.deepEqual(readModels({}), { models: {} });
});

test("a provider outside the makers is not valid, an inherited name included", () => {
	assert.deepEqual(readModels("{acme:x}"), { invalid: "acme:x" });
	assert.deepEqual(readModels("toString:x"), { invalid: "toString:x" });
	assert.deepEqual(readModels('{"constructor": "x"}'), {
		invalid: "constructor:x",
	});
	assert.deepEqual(readModels({ acme: "x" }), { invalid: "acme:x" });
});

test("an empty model is not valid", () => {
	assert.deepEqual(readModels("{openai: }"), { invalid: "openai:" });
	assert.deepEqual(readModels("typesafe:jev-latest, openai:"), {
		invalid: "openai:",
	});
	assert.deepEqual(readModels('{"openai": "  "}'), { invalid: "openai:" });
});

test("an entry with no colon is not valid", () => {
	assert.deepEqual(readModels("{openai}"), { invalid: "openai" });
	assert.deepEqual(readModels("typesafe:jev-latest, gpt-6-luna"), {
		invalid: "gpt-6-luna",
	});
});

test("a provider named twice is not valid, in every form", () => {
	assert.deepEqual(readModels("{openai:a, openai:b}"), { invalid: "openai:b" });
	assert.deepEqual(readModels('{"openai": "a", "openai": "b"}'), {
		invalid: "openai",
	});
	assert.deepEqual(readModels('{"openai": "a", "\\u006fpenai": "b"}'), {
		invalid: "openai",
	});
	assert.deepEqual(readModels({ openai: "a", " openai": "b" }), {
		invalid: "openai:b",
	});
});

test("a provider named twice is not valid when an earlier value is not text", () => {
	assert.deepEqual(readModels('{"openai": 5, "openai": "b"}'), {
		invalid: "openai",
	});
});

test("an empty entry between two commas is not valid and names the text", () => {
	assert.deepEqual(readModels("{openai:a,,google:b}"), {
		invalid: "{openai:a,,google:b}",
	});
});

test("a short-form name that holds a quote or a brace is neither form", () => {
	assert.deepEqual(readModels('{typesafe: "jev-preview"}'), {
		invalid: 'typesafe: "jev-preview"',
	});
	assert.deepEqual(readModels("typesafe:a{b"), { invalid: "typesafe:a{b" });
	assert.deepEqual(readModels("{typesafe:a}}"), { invalid: "typesafe:a}" });
});

test("a model that holds a slash is not valid", () => {
	assert.deepEqual(readModels("{openai:openai/gpt-6-luna}"), {
		invalid: "openai:openai/gpt-6-luna",
	});
	assert.deepEqual(readModels('{"google": "google/x"}'), {
		invalid: "google:google/x",
	});
});

test("a JSON value that is not a string is not valid and names its provider", () => {
	assert.deepEqual(readModels('{"openai": 5}'), { invalid: "openai" });
	assert.deepEqual(readModels('{"google": ["a"]}'), { invalid: "google" });
	assert.deepEqual(readModels({ typesafe: null }), { invalid: "typesafe" });
});

test("a brace without its pair is neither form", () => {
	assert.deepEqual(readModels("{openai:gpt-6-luna"), {
		invalid: "{openai:gpt-6-luna",
	});
	assert.deepEqual(readModels("openai:gpt-6-luna}"), {
		invalid: "openai:gpt-6-luna}",
	});
});

test("a value that is not text or an object is neither form", () => {
	assert.deepEqual(readModels(5), { invalid: "5" });
	assert.deepEqual(readModels(true), { invalid: "true" });
	assert.deepEqual(readModels(["openai:a"]), { invalid: '["openai:a"]' });
});

test("formatModels writes the owner's form in the order of the makers", () => {
	assert.equal(
		formatModels({
			google: "g",
			openai: "gpt-6-luna",
			typesafe: "jev-preview",
		}),
		"{typesafe:jev-preview, openai:gpt-6-luna, google:g}",
	);
	assert.equal(formatModels({ openai: "gpt-6-luna" }), "{openai:gpt-6-luna}");
	assert.equal(formatModels({}), "{}");
});

test("isSilentModels is true for unset, null, a blank text and spaces, and false for any other value", () => {
	for (const stored of [undefined, null, "", "   "])
		assert.equal(isSilentModels(stored), true, String(stored));
	for (const stored of ["{}", "a", 0, false, {}, []])
		assert.equal(isSilentModels(stored), false, String(stored));
});
