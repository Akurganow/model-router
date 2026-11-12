import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { posix, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
// Static imports, re-exports and dynamic imports with a relative specifier.
const SPEC =
	/(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s*)?["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/gs;
const files = readdirSync(SRC, { recursive: true, encoding: "utf8" })
	.map((name) => name.split(sep).join("/"))
	.filter((name) => name.endsWith(".ts"));

type Layer = "core" | "utils" | "adapters" | `adapter ${string}`;

// Only tests may sit at the top of adapters/: they drive two adapters at once, so they may import any of them.
function layerOf(path: string): Layer | undefined {
	const [top, second, third] = path.split("/");
	if ((top === "core" || top === "utils") && second !== undefined) return top;
	if (top !== "adapters" || second === undefined) return undefined;
	if (third !== undefined) return `adapter ${second}`;
	return second.endsWith(".test.ts") ? "adapters" : undefined;
}

const allowed = (from: Layer, to: Layer): boolean => {
	if (from === "utils") return to === "utils";
	if (from === "core") return to === "core" || to === "utils";
	if (from === "adapters") return true;
	return to === from || to === "core" || to === "utils";
};

test("every source file sits in core/, utils/ or one adapter folder", () => {
	assert.deepEqual(
		files.filter((name) => layerOf(name) === undefined),
		[],
	);
});

test("utils imports neither layer, core imports no adapter, and no adapter imports another", () => {
	const crossings: string[] = [];
	for (const name of files) {
		const from = layerOf(name);
		if (from === undefined) continue;
		const code = readFileSync(`${SRC}${name}`, "utf8");
		for (const match of code.matchAll(SPEC)) {
			const spec = match[1] ?? match[2] ?? "";
			const target = posix.normalize(posix.join(posix.dirname(name), spec));
			const to = layerOf(target);
			if (to === undefined || !allowed(from, to))
				crossings.push(`${name} imports ${spec}`);
		}
	}
	assert.deepEqual(crossings, []);
});

test("utils/ holds no barrel and no catch-all file", () => {
	const banned = ["index.ts", "helpers.ts", "common.ts", "misc.ts"];
	assert.deepEqual(
		files.filter(
			(name) =>
				name.startsWith("utils/") && banned.includes(posix.basename(name)),
		),
		[],
	);
});
