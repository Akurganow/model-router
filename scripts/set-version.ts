import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkVersions, MANIFESTS } from "./manifests.ts";

// Only the version line changes, so each file keeps the formatting biome ci checks.
// Any tab depth matches: the omp catalog nests its version inside plugins[0].
const line = /^(\t+"version": ")\d+\.\d+\.\d+(",?)$/m;

export function setVersion(
	root: string,
	version: string,
	manifests: readonly string[] = MANIFESTS.map(({ path }) => path),
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

if (import.meta.main) {
	const root = fileURLToPath(new URL("../", import.meta.url));
	const version = process.argv[2];
	if (version === "--check") {
		const problems = checkVersions(root);
		for (const problem of problems) console.error(problem);
		process.exit(problems.length === 0 ? 0 : 1);
	}
	if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
		console.error("usage: node scripts/set-version.ts X.Y.Z | --check");
		process.exit(2);
	}
	try {
		setVersion(root, version);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
