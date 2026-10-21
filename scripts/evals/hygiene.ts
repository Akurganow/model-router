// The shared core keeps its redact patterns private, so the fixture check carries its own.
const KEY_SHAPES: readonly (readonly [string, RegExp])[] = [
	["sk- key", /\bsk-[A-Za-z0-9_-]{8,}/],
	["bearer token", /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/i],
	[
		"unmasked secret assignment",
		/\b[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)"?\s*[=:]\s*"?(?!\*\*\*|")[^\s",]+/i,
	],
	["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}/],
	["JWT", /\beyJ[A-Za-z0-9_-]{20,}/],
	["40 or more token characters", /[A-Za-z0-9_-]{40,}/],
];

const PATH_SHAPES: readonly (readonly [string, RegExp])[] = [
	["home path", /\/(?:Users|home)\//],
	["system path", /\/(?:private|var\/folders|tmp|opt\/hostedtoolcache)\//],
	["Windows path", /[A-Za-z]:\\|\\Users\\/],
];

export function hygieneProblems(name: string, text: string): string[] {
	const problems: string[] = [];
	for (const [label, pattern] of [...KEY_SHAPES, ...PATH_SHAPES]) {
		const hit = pattern.exec(text);
		if (hit) problems.push(`${name}: ${label} (${hit[0].slice(0, 12)}…)`);
	}
	return problems;
}
