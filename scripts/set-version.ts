import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_PATH } from "./build/source.ts";
import { EXIT_USAGE } from "./exit-codes.ts";
import { checkVersions } from "./manifests.ts";

// Only the version line changes, so each file keeps the formatting biome ci checks.
// Any tab depth matches, so a nested version line would match too.
const line = /^(\t+"version": ")\d+\.\d+\.\d+(",?)$/m;

// The builder carries the source version into every generated manifest.
export function setVersion(
	root: string,
	version: string,
	manifests: readonly string[] = [SOURCE_PATH],
): string[] {
	// Every manifest is checked before any is written, so a failed bump leaves the tree as it was.
	const pending = manifests
		.filter((path) => existsSync(join(root, path)))
		.map((path) => {
			const text = readFileSync(join(root, path), "utf8");
			if (!line.test(text)) throw new Error(`no version line in ${path}`);
			return [path, text.replace(line, `$1${version}$2`)] as const;
		});
	for (const [path, text] of pending) writeFileSync(join(root, path), text);
	return pending.map(([path]) => path);
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
