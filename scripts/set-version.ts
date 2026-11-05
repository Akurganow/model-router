import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_PATH } from "./build/source.ts";
import { EXIT_USAGE } from "./exit-codes.ts";
import { checkVersions } from "./manifests.ts";

// Only the version line changes, so the file keeps the formatting biome ci checks.
// One tab anchors the match to the top level; nested objects sit deeper.
const line = /^(\t"version": ")\d+\.\d+\.\d+(",?)$/gm;

/**
 * Writes the version into the one top-level version line of
 * metadata/source.json; the builder carries it to every manifest. Throws when
 * the source is missing or holds no single such line.
 */
export function setVersion(root: string, version: string): void {
	const path = join(root, SOURCE_PATH);
	if (!existsSync(path)) throw new Error(`${SOURCE_PATH} is missing`);
	const text = readFileSync(path, "utf8");
	const found = [...text.matchAll(line)].length;
	if (found !== 1)
		throw new Error(
			`${SOURCE_PATH} needs exactly one top-level version line, found ${found}`,
		);
	writeFileSync(path, text.replace(line, `$1${version}$2`));
}

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const VERSION = /^\d+\.\d+\.\d+$/;
const USAGE = "usage: node scripts/set-version.ts X.Y.Z | --check";

export function main(args: string[], root: string): number {
	const [version] = args;
	if (version === "--check") {
		const problems = checkVersions(root);
		for (const problem of problems) console.error(problem);
		return problems.length === 0 ? 0 : 1;
	}
	if (!version || !VERSION.test(version)) {
		console.error(USAGE);
		return EXIT_USAGE;
	}
	try {
		setVersion(root, version);
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		return 1;
	}
}

if (import.meta.main) process.exit(main(process.argv.slice(2), ROOT));
