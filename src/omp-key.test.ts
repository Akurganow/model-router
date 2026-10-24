import assert from "node:assert/strict";
import { test } from "node:test";
import { KEY, useWorld } from "./omp-fakes.ts";
import { createExtension } from "./omp-router.ts";
import {
	KEY_MAX_LENGTH,
	keyLine,
	keyNotSaved,
	keyQuestion,
} from "./settings.ts";

const world = useWorld();
const TYPED = "typed-secret-0007";
const install = () => createExtension(world.imports)(world.pi);
const typeIn = (answer: string | undefined) => {
	world.input = async () => answer;
};
const everythingSaid = (result: string) =>
	[result, ...world.notes, ...world.stderr, ...world.prompts].join("\n");

test("the dialog names the provider, and says it replaces a key only when one is set", async () => {
	install();
	world.credential = async (provider) =>
		provider === "openrouter" ? KEY : undefined;
	await world.callTool({ setting: "typesafe_key" });
	await world.callTool({ setting: "openrouter_key" });
	assert.deepEqual(world.prompts, [
		keyQuestion("typesafe", false),
		keyQuestion("openrouter", true),
	]);
});

test("without a UI nothing is asked and nothing is stored", async () => {
	install();
	world.hasUI = false;
	typeIn(TYPED);
	assert.equal(
		await world.callTool({ setting: "typesafe_key" }),
		keyNotSaved("typesafe"),
	);
	assert.equal(world.prompts.length, 0);
	assert.equal(world.stored.length, 0);
});

test("an answer that is no key never reaches the store and is never echoed", async () => {
	install();
	const refused = [
		undefined,
		"",
		"   ",
		`${TYPED}\n${TYPED}`,
		`${TYPED}\r`,
		"k".repeat(KEY_MAX_LENGTH + 1),
		"Yes",
		" No ",
	];
	for (const answer of refused) {
		typeIn(answer);
		const text = await world.callTool({ setting: "openrouter_key" });
		assert.equal(text, keyNotSaved("openrouter"), String(answer));
	}
	assert.equal(world.stored.length, 0);
});

test("a failing dialog stores nothing", async () => {
	install();
	world.input = async () => {
		throw new Error(`dialog gone ${TYPED}`);
	};
	const text = await world.callTool({ setting: "typesafe_key" });
	assert.equal(text, keyNotSaved("typesafe"));
	assert.equal(world.stored.length, 0);
});

test("a key is stored as omp's own login stores it, trimmed, and the tool says saved, checking", async () => {
	install();
	typeIn(`  ${TYPED}  `);
	const text = await world.callTool({ setting: "typesafe_key" });
	assert.equal(text, keyLine("typesafe", "saved, checking"));
	assert.equal(everythingSaid(text).includes(TYPED), false);
	assert.deepEqual(world.stored, [
		{
			provider: "typesafe",
			credential: { type: "api_key", key: TYPED, source: "login" },
		},
	]);
	typeIn("k".repeat(KEY_MAX_LENGTH));
	assert.equal(
		await world.callTool({ setting: "openrouter_key" }),
		keyLine("openrouter", "saved, checking"),
	);
	assert.equal(world.stored[1]?.provider, "openrouter");
});

test("a failing store says the key was not saved and leaves no trace of the key", async () => {
	install();
	typeIn(TYPED);
	for (const failure of [
		new Error(`write failed for ${TYPED}`),
		`refused ${TYPED}`,
	]) {
		world.store = async () => {
			throw failure;
		};
		const text = await world.callTool({ setting: "typesafe_key" });
		assert.equal(text, keyNotSaved("typesafe"));
		assert.equal(everythingSaid(text).includes(TYPED), false);
	}
});
