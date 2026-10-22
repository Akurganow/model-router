import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Manifest = {
	path: string;
	versionPath: readonly (string | number)[];
};

// Every harness ships from one release, so every manifest here names one version.
// The omp catalog entry declares a version so omp offers upgrades.
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
];

function versionOf(json: unknown, versionPath: Manifest["versionPath"]) {
	let node = json;
	for (const key of versionPath)
		node = (node as Record<string | number, unknown> | null | undefined)?.[key];
	return typeof node === "string" ? node : "none";
}

export function checkVersions(
	root: string,
	manifests: readonly Manifest[] = MANIFESTS,
): string[] {
	const problems: string[] = [];
	const versions = new Map<string, string[]>();
	for (const { path, versionPath } of manifests) {
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
