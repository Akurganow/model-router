// The files the builder writes. This module imports nothing, so the owner-setup
// scan reads the list without loading esbuild or a renderer; build.test.ts
// checks the list against what the builder writes.
export const README_OUTPUT = "README.md";

export const BUNDLE_OUTPUTS = {
	claude: "plugins/model-router/hooks/register.js",
	omp: "plugins/model-router-omp/extension/index.js",
} as const;

export const GENERATED_PATHS: readonly string[] = [
	".claude-plugin/marketplace.json",
	".omp-plugin/marketplace.json",
	"plugins/model-router-omp/package.json",
	"plugins/model-router/.claude-plugin/plugin.json",
	README_OUTPUT,
	BUNDLE_OUTPUTS.claude,
	BUNDLE_OUTPUTS.omp,
];
