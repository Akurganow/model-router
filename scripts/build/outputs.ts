// Every file the builder writes, each path named once. The renderers and the
// bundle list take their paths from here. This module imports nothing, so the
// owner-setup scan reads the list without loading esbuild or a renderer.
export const CLAUDE_OUTPUTS = {
	manifest: "plugins/model-router/.claude-plugin/plugin.json",
	catalogue: ".claude-plugin/marketplace.json",
	bundle: "plugins/model-router/hooks/register.js",
} as const;

export const OMP_OUTPUTS = {
	manifest: "plugins/model-router-omp/package.json",
	catalogue: ".omp-plugin/marketplace.json",
	bundle: "plugins/model-router-omp/extension/index.js",
} as const;

export const README_OUTPUT = "README.md";

export const GENERATED_PATHS: readonly string[] = [
	...Object.values(CLAUDE_OUTPUTS),
	...Object.values(OMP_OUTPUTS),
	README_OUTPUT,
];
