export const TYPESAFE_KEY = "TYPESAFE_API_KEY";
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;
const MIN_SECRET_CHARS = 8;
const MASK = "***";

type Env = Readonly<Record<string, string | undefined>>;

// A client sees the variables that carry no secret, its own model key, and the TypeSafe key.
export function clientEnv(
	source: Env,
	ownKeys: readonly string[],
): Record<string, string> {
	const allowed = new Set([...ownKeys, TYPESAFE_KEY]);
	const env: Record<string, string> = {};
	for (const [name, value] of Object.entries(source)) {
		if (value !== undefined && (allowed.has(name) || !SECRET_NAME.test(name)))
			env[name] = value;
	}
	return env;
}

// Every secret-named variable counts, not only the client's own, so a stray key is masked too.
export function scrub(text: string, source: Env): string {
	const values = Object.entries(source)
		.filter(
			([name, value]) =>
				SECRET_NAME.test(name) && (value?.length ?? 0) >= MIN_SECRET_CHARS,
		)
		.map(([, value]) => value as string)
		.sort((a, b) => b.length - a.length);
	return values.reduce((t, value) => t.replaceAll(value, MASK), text);
}

export function normalisePaths(
	text: string,
	roots: readonly (readonly [string, string])[],
): string {
	const longestFirst = [...roots].sort((a, b) => b[0].length - a[0].length);
	return longestFirst.reduce(
		(t, [root, placeholder]) =>
			root === "" ? t : t.replaceAll(root, placeholder),
		text,
	);
}
