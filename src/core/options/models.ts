import {
	MAKERS,
	type Maker,
	type ModelNames,
} from "#core/providers/provider.ts";
import { isPlainObject } from "#utils/guards.ts";
import { textOf } from "#utils/text.ts";

type ModelsRead =
	| { readonly models: ModelNames }
	| { readonly invalid: string };

// The short form cannot hold these in a name: they belong to the JSON form.
const JSON_CHARS = /["{}]/;

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

// JSON.parse keeps the last of two equal keys, so the raw text is the only place that shows a repeat.
function repeatedKey(text: string): string | undefined {
	const seen = new Set<string>();
	let at = 0;
	while (at < text.length) {
		if (text[at] !== '"') {
			at += 1;
			continue;
		}
		let end = at + 1;
		while (end < text.length && text[end] !== '"')
			end += text[end] === "\\" ? 2 : 1;
		const token = text.slice(at, end + 1);
		at = end + 1;
		while (/\s/.test(text[at] ?? "")) at += 1;
		if (text[at] !== ":") continue;
		const key = String(JSON.parse(token));
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

// The short form: braces optional but paired, entries split at commas, each at its first colon.
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
			JSON_CHARS.test(entry.slice(colon + 1)) ||
			!accept(named, entry.slice(0, colon), entry.slice(colon + 1))
		)
			return { invalid: entry === "" ? text : entry };
	}
	return { models: named };
}

/** Tells whether a stored `models` names nothing: unset, null, or text of spaces alone. */
export const isSilentModels = (stored: unknown): boolean =>
	stored === undefined ||
	stored === null ||
	(typeof stored === "string" && stored.trim() === "");

/**
 * Returns the scoring model each maker names in a stored `models` value, or the failing part of
 * it. A silent value names none. A text is the short form `{typesafe:jev-preview, openai:gpt-6-luna}`
 * with optional braces, or a JSON object; a native object is read the same way. Never throws.
 *
 * The failing part names:
 * - `provider:model` (trimmed) for an entry of a known form that fails: a provider that is not a
 *   maker, an empty model, a model with a slash, a provider named twice, or a short-form model that
 *   holds a quote or a brace;
 * - the entry as written for an entry with no colon, or that holds a quote or a brace after it;
 * - the provider alone for a JSON or object value that is not text, and for a JSON key that
 *   repeats;
 * - the whole text for a text with an unpaired brace, an empty entry between two commas, or a
 *   value that is neither a text nor an object, shown as JSON.
 */
export function readModels(stored: unknown): ModelsRead {
	if (isSilentModels(stored)) return { models: {} };
	if (isPlainObject(stored)) return readObject(stored);
	if (typeof stored !== "string") return { invalid: textOf(stored) };
	const text = stored.trim();
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

/** Returns the short form of the names, in `MAKERS` order: `{typesafe:jev-preview, openai:gpt-6-luna}`. */
export const formatModels = (names: ModelNames): string =>
	`{${MAKERS.flatMap((maker) => {
		const name = names[maker];
		return name === undefined ? [] : [`${maker}:${name}`];
	}).join(", ")}}`;

const sameNames = (a: ModelNames, b: ModelNames): boolean =>
	MAKERS.every((maker) => a[maker] === b[maker]);

/**
 * Returns `models` with the maker's entry added in the form `models` already has: a native object
 * stays an object, a JSON text stays JSON, any other text stays the short form. Returns undefined
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
