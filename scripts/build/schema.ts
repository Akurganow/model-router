// Exactly the JSON Schema 2020-12 keywords that metadata/source.schema.json uses.
const ANNOTATIONS = ["$schema", "$id", "title", "description", "$defs"];
const SUPPORTED = new Set([
	...ANNOTATIONS,
	"$ref",
	"type",
	"properties",
	"required",
	"additionalProperties",
	"items",
	"minItems",
	"minLength",
	"pattern",
]);
const DEFS_PREFIX = "#/$defs/";

export type Schema = {
	readonly $ref?: string;
	readonly $defs?: Readonly<Record<string, Schema>>;
	readonly type?: string;
	readonly properties?: Readonly<Record<string, Schema>>;
	readonly required?: readonly string[];
	readonly additionalProperties?: boolean;
	readonly items?: Schema;
	readonly minItems?: number;
	readonly minLength?: number;
	readonly pattern?: string;
};

type Walk = {
	readonly root: Schema;
	readonly problems: string[];
};

const kindOf = (value: unknown): string =>
	value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

// Returns one problem per violation, each beginning with the JSON path of the value at fault.
export function validate(schema: Schema, value: unknown): string[] {
	const walk: Walk = { root: schema, problems: [] };
	check(walk, schema, "$", value);
	return walk.problems;
}

// A malformed schema is the author's error, so it throws instead of listing a data problem.
function refuseMalformed(schema: Schema, path: string): void {
	if (schema.$ref !== undefined)
		for (const keyword of Object.keys(schema))
			if (keyword !== "$ref" && !ANNOTATIONS.includes(keyword))
				throw new Error(
					`${path}: schema keyword ${keyword} next to $ref is ignored; move it into the referenced definition`,
				);
	if (
		schema.additionalProperties !== undefined &&
		typeof schema.additionalProperties !== "boolean"
	)
		throw new Error(
			`${path}: schema keyword additionalProperties must be a boolean`,
		);
}

function check(walk: Walk, schema: Schema, path: string, value: unknown): void {
	refuseMalformed(schema, path);
	for (const keyword of Object.keys(schema))
		if (!SUPPORTED.has(keyword))
			walk.problems.push(`${path}: schema keyword ${keyword} is not supported`);
	if (schema.$ref !== undefined) {
		checkReference(walk, schema.$ref, path, value);
		return;
	}
	const kind = kindOf(value);
	if (schema.type !== undefined && schema.type !== kind) {
		walk.problems.push(`${path}: expected ${schema.type}, got ${kind}`);
		return;
	}
	if (typeof value === "string") checkString(walk, schema, path, value);
	else if (Array.isArray(value)) checkArray(walk, schema, path, value);
	else if (kind === "object")
		checkObject(walk, schema, path, value as Record<string, unknown>);
}

function checkReference(
	walk: Walk,
	ref: string,
	path: string,
	value: unknown,
): void {
	const target = ref.startsWith(DEFS_PREFIX)
		? walk.root.$defs?.[ref.slice(DEFS_PREFIX.length)]
		: undefined;
	if (target === undefined)
		walk.problems.push(`${path}: schema reference ${ref} is not defined`);
	else check(walk, target, path, value);
}

function checkString(
	walk: Walk,
	{ minLength, pattern }: Schema,
	path: string,
	value: string,
): void {
	if (minLength !== undefined && value.length < minLength)
		walk.problems.push(`${path}: shorter than ${minLength} characters`);
	if (pattern !== undefined && !new RegExp(pattern).test(value))
		walk.problems.push(`${path}: does not match ${pattern}`);
}

function checkArray(
	walk: Walk,
	{ minItems, items }: Schema,
	path: string,
	value: unknown[],
): void {
	if (minItems !== undefined && value.length < minItems)
		walk.problems.push(`${path}: fewer than ${minItems} items`);
	if (items !== undefined)
		value.forEach((item, index) => {
			check(walk, items, `${path}[${index}]`, item);
		});
}

function checkObject(
	walk: Walk,
	{ properties = {}, required = [], additionalProperties }: Schema,
	path: string,
	value: Record<string, unknown>,
): void {
	for (const key of required)
		if (!Object.hasOwn(value, key))
			walk.problems.push(`${path}.${key}: required key is missing`);
	for (const [key, member] of Object.entries(value)) {
		const known = properties[key];
		if (known !== undefined) check(walk, known, `${path}.${key}`, member);
		else if (additionalProperties === false)
			walk.problems.push(`${path}.${key}: unknown key`);
	}
}
