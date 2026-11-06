import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SOURCE_PATH } from "./build/source.ts";

type Manifest = {
	path: string;
	versionPath: readonly (string | number)[];
};

// The generated manifests that carry a version; the builder writes each from the source.
// The omp catalog entry declares a version so omp offers upgrades.
// Hermes's plugin.yaml holds JSON text, so the same reader parses it.
// The tree's OpenClaw manifest is a copy; listing it catches a stale copy.
export const MANIFESTS: readonly Manifest[] = [
	{
		path: "plugins/model-router/.claude-plugin/plugin.json",
		versionPath: ["version"],
	},
	{ path: "plugins/model-router-omp/package.json", versionPath: ["version"] },
	{
		path: ".omp-plugin/marketplace.json",
		versionPath: ["plugins", 0, "version"],
	},
	{
		path: "plugins/model-router-openclaw/openclaw.plugin.json",
		versionPath: ["version"],
	},
	{
		path: "plugins/model-router-hermes/plugin.yaml",
		versionPath: ["version"],
	},
	{ path: "packages/model-router/package.json", versionPath: ["version"] },
	{
		path: "packages/model-router/openclaw.plugin.json",
		versionPath: ["version"],
	},
];

function versionOf(json: unknown, versionPath: Manifest["versionPath"]) {
	let node = json;
	for (const key of versionPath)
		node = (node as Record<string | number, unknown> | null | undefined)?.[key];
	return typeof node === "string" ? node : "none";
}

// A source bumped without a build differs from the manifests, and the check names both.
export const SOURCE: Manifest = { path: SOURCE_PATH, versionPath: ["version"] };

/**
 * Returns one problem per missing file, and one more when the source and the
 * manifests do not carry a single version, naming each version and its files.
 */
export function checkVersions(
	root: string,
	manifests: readonly Manifest[] = MANIFESTS,
): string[] {
	const problems: string[] = [];
	const versions = new Map<string, string[]>();
	for (const { path, versionPath } of [SOURCE, ...manifests]) {
		if (!existsSync(join(root, path))) {
			problems.push(`${path} is missing`);
			continue;
		}
		const json = JSON.parse(readFileSync(join(root, path), "utf8"));
		const version = versionOf(json, versionPath);
		versions.set(version, [...(versions.get(version) ?? []), path]);
	}
	if (versions.size > 1 || versions.has("none"))
		problems.push(
			`plugin versions are not one: ${[...versions].map(([v, paths]) => `${v} (${paths.join(", ")})`).join("; ")}`,
		);
	return problems;
}
