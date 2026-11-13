import assert from "node:assert/strict";
import { test } from "node:test";
import {
	CANDIDATES_DESCRIPTION,
	isModelSetting,
	type Listed,
	listing,
	type ModelPort,
	modelToolSentences,
	runModels,
	type Writer,
} from "./models.ts";
import type { Slot } from "./slots.ts";

const LISTED: readonly Listed[] = [
	{ id: "a/small", input: 1, output: 5, context: 200000 },
	{ id: "a/middle", context: 1000000 },
	{ id: "a/large" },
];

type Calls = {
	listed: number;
	current: Slot[];
	asked: { slot: Slot; question: string; options: string[] }[];
	written: { slot: Slot; id: string }[];
};

function fakePort(
	over: {
		list?: () => Promise<readonly Listed[]>;
		writer?: Partial<Writer> | null;
		answers?: (string | undefined)[];
	} = {},
): { port: ModelPort; calls: Calls } {
	const calls: Calls = { listed: 0, current: [], asked: [], written: [] };
	const answers = [...(over.answers ?? [])];
	const writer: Writer = {
		authorize: () => undefined,
		name: (slot) => `${slot}_model (${slot} role)`,
		current: async (slot) => {
			calls.current.push(slot);
			return undefined;
		},
		select: async (slot, question, options) => {
			calls.asked.push({ slot, question, options });
			return answers.shift();
		},
		write: async (slot, id) => {
			calls.written.push({ slot, id });
			return id;
		},
		...over.writer,
	};
	const port: ModelPort = {
		list: async () => {
			calls.listed += 1;
			return over.list === undefined ? LISTED : over.list();
		},
		help: (slot) => `help for ${slot}`,
		writer: over.writer === null ? null : writer,
	};
	return { port, calls };
}

test("listing words the three shapes of a model's detail", () => {
	assert.equal(
		listing(LISTED),
		[
			"models the person can run: 3",
			"- a/small ($1 in, $5 out per 1M tokens, 200K context)",
			"- a/middle (1M context)",
			"- a/large",
		].join("\n"),
	);
});

test("listing words one price alone, fractions and a free model", () => {
	assert.equal(
		listing([
			{ id: "p/in", input: 0.0434 },
			{ id: "p/out", output: 14, context: 1048576 },
			{ id: "p/free", input: 0, output: 0, context: 131072 },
		]),
		[
			"models the person can run: 3",
			"- p/in ($0.0434 in per 1M tokens)",
			"- p/out ($14 out per 1M tokens, 1.05M context)",
			"- p/free ($0 in, $0 out per 1M tokens, 131K context)",
		].join("\n"),
	);
});

test("listing drops a number that is not finite or is negative and keeps the id", () => {
	const bad: unknown[] = [Number.NaN, Number.POSITIVE_INFINITY, -1, "1", null];
	for (const value of bad) {
		const model = {
			id: "p/m",
			input: value,
			output: value,
			context: value,
		} as unknown as Listed;
		assert.equal(
			listing([model]),
			"models the person can run: 1\n- p/m",
			String(value),
		);
	}
	assert.equal(
		listing([{ id: "p/m", input: -1, output: 2, context: Number.NaN }]),
		"models the person can run: 1\n- p/m ($2 out per 1M tokens)",
	);
});

test("listing drops a model whose id fails the pattern", () => {
	const long = `a${"b".repeat(99)}`;
	assert.equal(long.length, 100);
	const ids = [
		"a/b\nc",
		`${long}c`,
		"",
		" a/b",
		"-a",
		"a b",
		"a/b(c)",
		long,
		"Az0._:@/+-",
	];
	const listed = ids.map((id) => ({ id }));
	listed.push({ id: 7 } as unknown as { id: string });
	assert.equal(
		listing(listed),
		[`models the person can run: 2`, `- ${long}`, "- Az0._:@/+-"].join("\n"),
	);
});

test("listing an empty list gives the header alone", () => {
	assert.equal(listing([]), "models the person can run: 0");
});

test("isModelSetting knows models and the three slot settings only", () => {
	for (const name of ["models", "small_model", "middle_model", "large_model"])
		assert.equal(isModelSetting(name), true, name);
	for (const other of [
		"provider",
		"model",
		"models ",
		"middle",
		"",
		"   ",
		null,
		undefined,
		1,
	])
		assert.equal(isModelSetting(other), false, String(other));
});

test("runModels returns undefined for any other setting and reads nothing", async () => {
	const { port, calls } = fakePort();
	for (const setting of ["provider", "", "   ", null, undefined, "models "])
		assert.equal(await runModels(port, { setting }), undefined);
	assert.equal(calls.listed, 0);
});

test("runModels lists the models for the models setting", async () => {
	const { port } = fakePort();
	assert.equal(await runModels(port, { setting: "models" }), listing(LISTED));
	const { port: empty } = fakePort({ list: async () => [] });
	assert.equal(
		await runModels(empty, { setting: "models" }),
		"models the person can run: 0",
	);
});

test("runModels reports a list that rejects or throws", async () => {
	const { port } = fakePort({
		list: () => Promise.reject(new Error("registry gone")),
	});
	assert.equal(
		await runModels(port, { setting: "models" }),
		"models unavailable: registry gone",
	);
	const { port: thrower } = fakePort({
		list: () => {
			throw "no list";
		},
	});
	assert.equal(
		await runModels(thrower, { setting: "models" }),
		"models unavailable: no list",
	);
});

test("a slot setting with no writer returns the user path and reads nothing", async () => {
	const { port, calls } = fakePort({ writer: null });
	assert.equal(
		await runModels(port, { setting: "small_model", candidates: ["a/small"] }),
		"help for small",
	);
	assert.equal(
		await runModels(port, { setting: "middle_model" }),
		"help for middle",
	);
	assert.equal(
		await runModels(port, { setting: "large_model" }),
		"help for large",
	);
	assert.equal(calls.listed, 0);
});

test("a refusal by authorize ends the flow before the list is read", async () => {
	const { port, calls } = fakePort({
		writer: { authorize: () => "not the owner" },
	});
	assert.equal(
		await runModels(port, { setting: "middle_model", candidates: ["a/small"] }),
		"middle_model unchanged: not the owner",
	);
	assert.equal(calls.listed, 0);
	assert.deepEqual(calls.current, []);
	assert.deepEqual(calls.asked, []);
	assert.deepEqual(calls.written, []);
});

test("the question names an unset slot", async () => {
	const { port, calls } = fakePort();
	await runModels(port, { setting: "middle_model" });
	assert.deepEqual(calls.current, ["middle"]);
	assert.deepEqual(calls.asked, [
		{
			slot: "middle",
			question:
				"Which model should the middle level run? middle_model is unset now.",
			options: ["Show the whole list"],
		},
	]);
});

test("the question names the configured value of a set slot", async () => {
	const { port, calls } = fakePort({
		writer: { current: async () => "a/large" },
	});
	await runModels(port, { setting: "large_model" });
	assert.equal(
		calls.asked[0]?.question,
		"Which model should the large level run? large_model is a/large now.",
	);
});

test("candidates that are not a list of ids offer only the whole list", async () => {
	for (const candidates of [
		undefined,
		null,
		"",
		"   ",
		"a/small",
		{ 0: "a/small" },
		[],
		[null, 1, "", "   "],
	]) {
		const { port, calls } = fakePort();
		await runModels(port, { setting: "small_model", candidates });
		assert.deepEqual(
			calls.asked[0]?.options,
			["Show the whole list"],
			JSON.stringify(candidates),
		);
	}
});

test("candidates keep listed ids in the agent's order, once, at most four, labelled from the list", async () => {
	const many: Listed[] = ["m/1", "m/2", "m/3", "m/4", "m/5"].map((id) => ({
		id,
		context: 8000,
	}));
	const { port, calls } = fakePort({ list: async () => many });
	await runModels(port, {
		setting: "small_model",
		candidates: [
			"m/5",
			"m/5",
			"x/unlisted",
			"m/1 - cheap and fast",
			" m/1",
			"m/1",
			"m/3",
			"m/2",
			"m/4",
		],
	});
	assert.deepEqual(calls.asked[0]?.options, [
		"m/5 - 8K context",
		"m/1 - 8K context",
		"m/3 - 8K context",
		"m/2 - 8K context",
		"Show the whole list",
	]);
});

test("a picked candidate is written and the line shows the configured value", async () => {
	const { port, calls } = fakePort({
		answers: ["a/small - $1 in, $5 out per 1M tokens, 200K context"],
	});
	assert.equal(
		await runModels(port, { setting: "small_model", candidates: ["a/small"] }),
		"small_model (small role): a/small",
	);
	assert.deepEqual(calls.written, [{ slot: "small", id: "a/small" }]);
});

test("the line after a write shows what the writer reads back", async () => {
	const { port } = fakePort({
		answers: ["a/large"],
		writer: { write: async () => undefined },
	});
	assert.equal(
		await runModels(port, { setting: "large_model", candidates: ["a/large"] }),
		"large_model (large role): unset",
	);
});

test("the whole list opens a second dialog over every listed model", async () => {
	const { port, calls } = fakePort({
		answers: ["Show the whole list", "a/middle - 1M context"],
	});
	assert.equal(
		await runModels(port, { setting: "middle_model", candidates: ["a/large"] }),
		"middle_model (middle role): a/middle",
	);
	assert.deepEqual(
		calls.asked.map((asked) => asked.options),
		[
			["a/large", "Show the whole list"],
			[
				"a/small - $1 in, $5 out per 1M tokens, 200K context",
				"a/middle - 1M context",
				"a/large",
			],
		],
	);
	assert.equal(
		calls.asked[1]?.question,
		"Which model should the middle level run? middle_model is unset now.",
	);
	assert.deepEqual(calls.written, [{ slot: "middle", id: "a/middle" }]);
});

test("no answer from either dialog writes nothing", async () => {
	for (const answers of [[undefined], ["Show the whole list", undefined]]) {
		const { port, calls } = fakePort({ answers });
		assert.equal(
			await runModels(port, { setting: "middle_model" }),
			"middle_model unchanged: no answer from the dialog",
		);
		assert.deepEqual(calls.written, []);
	}
});

test("a dialog that rejects or throws gave no answer", async () => {
	const failures: Writer["select"][] = [
		() => Promise.reject(new Error("dialog gone")),
		() => {
			throw new Error("no UI");
		},
	];
	for (const select of failures) {
		const { port, calls } = fakePort({ writer: { select } });
		assert.equal(
			await runModels(port, { setting: "small_model" }),
			"small_model unchanged: no answer from the dialog",
		);
		assert.deepEqual(calls.written, []);
	}
});

test("an answer outside the options writes nothing and is never echoed", async () => {
	for (const answers of [
		["a/small"],
		["secret-text"],
		["Show the whole list", "x/unlisted"],
		["Show the whole list", "Show the whole list"],
	]) {
		const { port, calls } = fakePort({ answers });
		const text = await runModels(port, {
			setting: "large_model",
			candidates: ["a/large"],
		});
		assert.equal(
			text,
			"large_model unchanged: the answer was not one of the offered values",
			JSON.stringify(answers),
		);
		assert.equal(text?.includes("secret-text"), false);
		assert.deepEqual(calls.written, []);
	}
});

test("a write that rejects leaves the setting unchanged with its error", async () => {
	const { port } = fakePort({
		answers: ["a/large"],
		writer: { write: () => Promise.reject(new Error("config.yml is locked")) },
	});
	assert.equal(
		await runModels(port, { setting: "large_model", candidates: ["a/large"] }),
		"large_model unchanged: config.yml is locked",
	);
});

test("a current value that cannot be read ends the flow before the dialog", async () => {
	const { port, calls } = fakePort({
		writer: { current: () => Promise.reject(new Error("settings unreadable")) },
	});
	assert.equal(
		await runModels(port, { setting: "small_model" }),
		"small_model unchanged: settings unreadable",
	);
	assert.deepEqual(calls.asked, []);
});

test("a list that fails or holds nothing ends the writer path before the dialog", async () => {
	const { port, calls } = fakePort({
		list: () => Promise.reject(new Error("registry gone")),
	});
	assert.equal(
		await runModels(port, { setting: "middle_model" }),
		"middle_model unchanged: models unavailable: registry gone",
	);
	const { port: empty, calls: emptyCalls } = fakePort({
		list: async () => [{ id: "bad id" }],
	});
	assert.equal(
		await runModels(empty, { setting: "middle_model" }),
		"middle_model unchanged: models the person can run: 0",
	);
	assert.deepEqual([...calls.asked, ...emptyCalls.asked], []);
});

test("the tool sentences add the candidates sentence only with a writer", () => {
	assert.equal(
		modelToolSentences(false),
		"With models it returns the models the person can run.",
	);
	assert.equal(
		modelToolSentences(true),
		"With models it returns the models the person can run. For a model setting, pass up to four ids from models as candidates: the dialog offers them and an entry that shows the whole list.",
	);
	assert.equal(
		CANDIDATES_DESCRIPTION,
		"Up to four model ids from the models list. The person picks in the plugin's dialog. Never a value to write.",
	);
});
