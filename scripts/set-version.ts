import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
	console.error("usage: node scripts/set-version.ts X.Y.Z");
	process.exit(2);
}

// Only the version line changes, so the file keeps the formatting biome ci checks.
const path = new URL("../.claude-plugin/plugin.json", import.meta.url);
const manifest = readFileSync(path, "utf8");
const line = /^\t"version": "\d+\.\d+\.\d+",$/m;
if (!line.test(manifest)) {
	console.error("no version line in .claude-plugin/plugin.json");
	process.exit(1);
}
writeFileSync(path, manifest.replace(line, `\t"version": "${version}",`));
