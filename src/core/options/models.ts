import {
	MAKERS,
	type Maker,
	type ModelNames,
} from "#core/providers/provider.ts";

type ModelsRead =
	| { readonly models: ModelNames }
	| { readonly invalid: string };

const QUOTED = /"(?:[^"\\]|\\.)*"/g;

export const isPlainObject = (
	value: unknown,
): value is Record<string, unknown> => {
	if (typeof value !== "object" || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/** Returns a stored value as the person would read it: a text as written, anything else as JSON. */
export const textOf = (value: unknown): string => {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
};

const makerOf = (name: string): Maker | undefined =>
	MAKERS.find((maker) => maker === name);

// Writes one entry into `named` and returns false when the entry is not valid.
function accept(
	named: Partial<Record<Maker, string>>,
	provider: string,
	model: string,
): boolean {
	const maker = makerOf(provider.trim());
	const name = model.trim();
	if (
		maker === undefined ||
		name === "" ||
		name.includes("/") ||
		Object.hasOwn(named, maker)
	)
		return false;
	named[maker] = name;
	return true;
}

// One entry per key. A value that is not text fails with its provider name.
function readObject(object: Record<string, unknown>): ModelsRead {
	const named: Partial<Record<Maker, string>> = {};
	for (const [provider, model] of Object.entries(object)) {
		if (typeof model !== "string") return { invalid: provider.trim() };
		if (!accept(named, provider, model))
			return { invalid: `${provider.trim()}:${model.trim()}` };
	}
	return { models: named };
}

// JSON.parse keeps the last of two equal keys. With every value a string, the string tokens
// alternate key and value, so the keys are the even tokens of the raw text.
function repeatedKey(text: string): string | undefined {
	const seen = new Set<string>();
	const tokens = text.match(QUOTED) ?? [];
	for (let i = 0; i < tokens.length; i += 2) {
		const key = String(JSON.parse(tokens[i] ?? '""')).trim();
		if (seen.has(key)) return key;
		seen.add(key);
	}
	return undefined;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

// The owner's form: braces optional but paired, entries split at commas, each at its first colon.
function readOwnerForm(text: string): ModelsRead {
	if (text.startsWith("{") !== text.endsWith("}")) return { invalid: text };
	const inner = (text.startsWith("{") ? text.slice(1, -1) : text).trim();
	if (inner === "") return { models: {} };
	const named: Partial<Record<Maker, string>> = {};
	for (const part of (inner.endsWith(",") ? inner.slice(0, -1) : inner).split(
		",",
	)) {
		const entry = part.trim();
		const colon = entry.indexOf(":");
		if (
			colon < 0 ||
			!accept(named, entry.slice(0, colon), entry.slice(colon + 1))
		)
			return { invalid: entry === "" ? text : entry };
	}
	return { models: named };
}

/**
 * Returns the scoring model each maker names in a stored `models` value, or the failing part of
 * it. A silent value names none. A text is the owner's form `{typesafe:jev-preview, openai:gpt-6-luna}`
 * with optional braces, or a JSON object; a native object is read the same way. Never throws.
 */
export function readModels(stored: unknown): ModelsRead {
	if (stored === undefined || stored === null) return { models: {} };
	if (isPlainObject(stored)) return readObject(stored);
	if (typeof stored !== "string") return { invalid: textOf(stored) };
	const text = stored.trim();
	if (text === "") return { models: {} };
	if (text.startsWith("{")) {
		const parsed = parseJson(text);
		if (isPlainObject(parsed)) {
			const read = readObject(parsed);
			if ("invalid" in read) return read;
			const repeated = repeatedKey(text);
			return repeated === undefined ? read : { invalid: repeated };
		}
	}
	return readOwnerForm(text);
}

/** Returns the owner's form of the names, in `MAKERS` order: `{typesafe:jev-preview, openai:gpt-6-luna}`. */
export const formatModels = (names: ModelNames): string =>
	`{${MAKERS.flatMap((maker) => {
		const name = names[maker];
		return name === undefined ? [] : [`${maker}:${name}`];
	}).join(", ")}}`;

const sameNames = (a: ModelNames, b: ModelNames): boolean =>
	MAKERS.every((maker) => a[maker] === b[maker]);

/**
 * Returns `models` with the maker's entry added in the form `models` already has: a native object
 * stays an object, a JSON text stays JSON, any other text stays the owner's form. Returns undefined
 * when `models` is not valid, names the maker already, or the result would not read back as the
 * old names plus this one.
 */
export function withModel(
	models: unknown,
	maker: Maker,
	name: string,
): string | Record<string, unknown> | undefined {
	const read = readModels(models);
	if ("invalid" in read || read.models[maker] !== undefined) return undefined;
	const text = typeof models === "string" ? models.trim() : undefined;
	const parsed = text?.startsWith("{") ? parseJson(text) : undefined;
	let added: string | Record<string, unknown>;
	if (isPlainObject(models)) added = { ...models, [maker]: name };
	else if (isPlainObject(parsed))
		added = JSON.stringify({ ...parsed, [maker]: name });
	else added = formatModels({ ...read.models, [maker]: name });
	const back = readModels(added);
	return "models" in back &&
		sameNames(back.models, { ...read.models, [maker]: name })
		? added
		: undefined;
}
