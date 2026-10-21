import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Target = { from: string; to: string };

// A plugin folder runs on its own, so each one that uses a shared file carries a byte-identical copy.
export const TARGETS: readonly Target[] = [
	{ from: "shared/core.ts", to: "plugins/model-router/hooks/core.ts" },
	{ from: "shared/core.ts", to: "plugins/model-router-omp/extension/core.ts" },
	{ from: "shared/jev.ts", to: "plugins/model-router-omp/extension/jev.ts" },
];
// Every harness ships from one release, so their manifests must name one version.
export const MANIFESTS: readonly string[] = [
	"plugins/model-router/.claude-plugin/plugin.json",
	"plugins/model-router-omp/package.json",
];

// The omp catalog entry declares a version so omp offers upgrades; it must equal the plugin version.
export const CATALOG = ".omp-plugin/marketplace.json";

export function syncTargets(root: string, targets: readonly Target[]): void {
	for (const { from, to } of targets) {
		mkdirSync(dirname(join(root, to)), { recursive: true });
		copyFileSync(join(root, from), join(root, to));
	}
}

// A target or manifest that does not exist yet is skipped: its package adds it.
export function checkTargets(
	root: string,
	targets: readonly Target[],
	manifests: readonly string[],
	catalog: string = CATALOG,
): string[] {
	const problems: string[] = [];
	for (const { from, to } of targets) {
		if (!existsSync(join(root, to))) continue;
		if (!readFileSync(join(root, from)).equals(readFileSync(join(root, to))))
			problems.push(`${to} differs from ${from}; run npm run sync`);
	}
	const versions = new Map<string, string[]>();
	for (const path of [...manifests, catalog]) {
		if (!existsSync(join(root, path))) continue;
		const json = JSON.parse(readFileSync(join(root, path), "utf8"));
		const version =
			path === catalog ? json.plugins?.[0]?.version : json.version;
		const key = typeof version === "string" ? version : "none";
		versions.set(key, [...(versions.get(key) ?? []), path]);
	}
	if (versions.size > 1 || versions.has("none"))
		problems.push(
			`plugin versions are not one: ${[...versions].map(([v, paths]) => `${v} (${paths.join(", ")})`).join("; ")}`,
		);
	return problems;
}

if (import.meta.main) {
	const root = fileURLToPath(new URL("../", import.meta.url));
	if (process.argv[2] === "--check") {
		const problems = checkTargets(root, TARGETS, MANIFESTS);
		for (const problem of problems) console.error(problem);
		process.exit(problems.length === 0 ? 0 : 1);
	}
	syncTargets(root, TARGETS);
}
