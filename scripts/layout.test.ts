import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const src = readdirSync(join(ROOT, "src"), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile())
	.map((entry) =>
		relative(ROOT, join(entry.parentPath, entry.name)).split(sep).join("/"),
	)
	.filter((name) => name !== "src/tsconfig.json");

test("every source file sits in core/, utils/ or one adapter folder", () => {
	assert.deepEqual(
		src.filter((name) => {
			const [, top, second] = name.split("/");
			return !["core", "utils", "adapters"].includes(top ?? "") || !second;
		}),
		[],
	);
});

// Tests at the top of adapters/ drive several adapters, so they belong to none.
test("only a test sits directly in adapters/", () => {
	assert.deepEqual(
		src.filter((name) => {
			const [, top, second, third] = name.split("/");
			return top === "adapters" && !third && !second?.endsWith(".test.ts");
		}),
		[],
	);
});

test("every adapter folder holds an index.ts", () => {
	const folders = new Set(
		src
			.map((name) => name.split("/"))
			.flatMap(([, top, folder, file]) =>
				top === "adapters" && file !== undefined ? [folder] : [],
			),
	);
	assert.deepEqual(
		[...folders].filter(
			(folder) => !src.includes(`src/adapters/${folder}/index.ts`),
		),
		[],
	);
});
