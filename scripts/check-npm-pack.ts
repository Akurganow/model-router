import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NPM_ROOT } from "./build/outputs.ts";
import { EXIT_USAGE } from "./exit-codes.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACK_TIMEOUT_MS = 120_000;
// npm never packs these, wherever they sit in the tree.
const NEVER_PACKED = new Set([".DS_Store", ".git", "node_modules"]);
// npm packs a root README or LICENSE/LICENCE file whatever its extension or case.
const ALWAYS_PACKED_ROOT_FILE = /^(readme|licen[cs]e)(\..*)?$/i;

type Manifest = { files?: unknown; main?: unknown };

/**
 * Lists the files an `files` entry packs: the entry itself for a file, or every
 * file under it for a folder, without the entries npm never packs. Throws when
 * the path does not exist.
 */
const filesIn = (root: string, path: string): string[] => {
	if (!statSync(join(root, path)).isDirectory()) return [path];
	return readdirSync(join(root, path))
		.filter((name) => !NEVER_PACKED.has(name))
		.flatMap((name) => filesIn(root, join(path, name)));
};

/**
 * Lists the files npm packs for a tree, worked out from the folder alone: the
 * `files` entries, plus the files npm always packs (package.json, the root
 * README and LICENSE, and `main`). The list is unique and sorted. Throws when
 * package.json has no `files` list of strings or an entry does not exist.
 */
export function expectedPackedFiles(treeRoot: string): string[] {
	const manifest: Manifest = JSON.parse(
		readFileSync(join(treeRoot, "package.json"), "utf8"),
	);
	if (
		!Array.isArray(manifest.files) ||
		!manifest.files.every((entry) => typeof entry === "string")
	)
		throw new Error("package.json needs a files list of strings");
	const listed = manifest.files.flatMap((entry: string) => {
		if (!existsSync(join(treeRoot, entry)))
			throw new Error(`the files entry ${entry} does not exist in the tree`);
		return filesIn(treeRoot, entry);
	});
	const rootFiles = readdirSync(treeRoot).filter((name) =>
		ALWAYS_PACKED_ROOT_FILE.test(name),
	);
	const main = typeof manifest.main === "string" ? [manifest.main] : [];
	return [
		...new Set([...listed, ...rootFiles, ...main, "package.json"]),
	].sort();
}

/**
 * Returns undefined when the expected and the packed files match. Otherwise it
 * returns a two-line text naming the files missing from the tarball and the
 * files it holds beyond the expected ones.
 */
export function comparePackedFiles(
	expected: readonly string[],
	actual: readonly string[],
): string | undefined {
	const missing = expected.filter((file) => !actual.includes(file));
	const extra = actual.filter((file) => !expected.includes(file));
	if (missing.length === 0 && extra.length === 0) return undefined;
	return [
		`missing from the tarball: ${missing.join(", ") || "none"}`,
		`not expected in the tarball: ${extra.join(", ") || "none"}`,
	].join("\n");
}

export type Packed = { tarball: string; files: string[] };
type PackResult = { filename: string; files: { path: string }[] };

/**
 * Tells whether a value has the shape of one npm pack result: a string
 * `filename` and a `files` array. Never throws.
 */
const isPackResult = (value: unknown): value is PackResult =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as { filename?: unknown }).filename === "string" &&
	Array.isArray((value as { files?: unknown }).files);

/**
 * Returns the first npm pack result in the parsed output, or undefined when it
 * holds none. npm 11 prints a list of results, and npm 12 an object keyed by
 * package name. Never throws.
 */
export function packResult(json: unknown): PackResult | undefined {
	if (isPackResult(json)) return json;
	const results = Array.isArray(json)
		? json
		: typeof json === "object" && json !== null
			? Object.values(json)
			: [];
	return results.find(isPackResult);
}

/**
 * Packs the tree into the destination folder and returns the tarball path with
 * the sorted list of packed files. Creates the destination first, because npm
 * pack writes into a folder that exists. Throws when npm fails, times out or
 * prints no result.
 */
export function packTree(treeRoot: string, destination: string): Packed {
	// npm pack writes into a folder that exists and does not create it.
	mkdirSync(destination, { recursive: true });
	const output = execFileSync(
		"npm",
		["pack", "--json", "--ignore-scripts", "--pack-destination", destination],
		{
			cwd: treeRoot,
			encoding: "utf8",
			timeout: PACK_TIMEOUT_MS,
			stdio: ["ignore", "pipe", "inherit"],
		},
	);
	const result = packResult(JSON.parse(output));
	if (result === undefined) throw new Error("npm pack printed no result");
	return {
		tarball: join(destination, result.filename),
		files: result.files.map(({ path }) => path).sort(),
	};
}

/**
 * Packs the tree and returns the result. Throws when npm packed other files
 * than the tree lists, or when packing fails.
 */
export function verifyPack(treeRoot: string, destination: string): Packed {
	const packed = packTree(treeRoot, destination);
	const difference = comparePackedFiles(
		expectedPackedFiles(treeRoot),
		packed.files,
	);
	if (difference !== undefined)
		throw new Error(
			`the packed files differ from the files list\n${difference}`,
		);
	return packed;
}

/**
 * Returns the exit code of the check: 0 when the pack matches the tree, EXIT_USAGE
 * without a destination argument, and 1 when verifying fails. Prints the
 * tarball path on success, so a workflow step can read it. Never throws.
 */
export function main(args: string[], root: string): number {
	const [destination] = args;
	if (destination === undefined) {
		console.error(
			"usage: node scripts/check-npm-pack.ts <folder for the tarball>",
		);
		return EXIT_USAGE;
	}
	try {
		console.log(verifyPack(join(root, NPM_ROOT), destination).tarball);
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		return 1;
	}
}

if (import.meta.main) process.exit(main(process.argv.slice(2), ROOT));
