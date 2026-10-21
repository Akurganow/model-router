import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Every harness ships from one release. A missing manifest is skipped here;
// scripts/sync.ts --check fails on it.
export const MANIFESTS: readonly string[] = [
	"plugins/model-router/.claude-plugin/plugin.json",
	"plugins/model-router-omp/package.json",
	".omp-plugin/marketplace.json",
];

// Only the version line changes, so each file keeps the formatting biome ci checks.
// Any tab depth matches: the omp catalog nests its version inside plugins[0].
const line = /^(\t+"version": ")\d+\.\d+\.\d+(",?)$/m;

export function setVersion(
	root: string,
	version: string,
	manifests: readonly string[] = MANIFESTS,
): string[] {
	const written: string[] = [];
	for (const path of manifests) {
		if (!existsSync(join(root, path))) continue;
		const text = readFileSync(join(root, path), "utf8");
		if (!line.test(text)) throw new Error(`no version line in ${path}`);
		writeFileSync(join(root, path), text.replace(line, `$1${version}$2`));
		written.push(path);
	}
	return written;
}

if (import.meta.main) {
	const version = process.argv[2];
	if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
		console.error("usage: node scripts/set-version.ts X.Y.Z");
		process.exit(2);
	}
	try {
		setVersion(fileURLToPath(new URL("../", import.meta.url)), version);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
