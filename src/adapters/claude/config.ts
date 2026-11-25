import {
	alreadyValue,
	badCall,
	chooseValue,
	isValue,
	isValueSetting,
	modelCarry,
	modelsAlready,
	modelsCallOf,
	modelsLines,
	modelsWrite,
	type Stored,
	settingsOf,
	settingsReport,
	toolDescription,
	unchanged,
	useOneOf,
	VALUE_SETTINGS,
	type ValueSetting,
	valueLine,
} from "#core/options/settings.ts";
import { errorText } from "#utils/error.ts";
import { serializer } from "#utils/serializer.ts";
import type {
	CommandOutput,
	CommandRun,
	ConfigCall,
	ConfigRow,
	Engine,
	Next,
	Options,
	Outcome,
	RowShown,
	SessionStart,
	ToolAnswer,
} from "./host.ts";
import { denied } from "./host.ts";
import { readKeys } from "./keys.ts";

const ROW_PREFIX = "model-router.";
export const REFUSED =
	"Permission rules deny this tool, so nothing was read or changed.";
// Only the person's own Enter at the prompt may change a setting by command.
const PERSON = "composer";

const TOOL_SPEC = {
	name: "config",
	description: toolDescription(),
	inputSchema: {
		type: "object",
		properties: {
			setting: { type: "string", enum: VALUE_SETTINGS },
			models: { type: "string" },
		},
	},
};

// The rows this adapter writes: the value settings, `models` and the removed `model`.
const ROWS = [...VALUE_SETTINGS, "models", "model"] as const;
type Row = (typeof ROWS)[number];

// What this instance wrote, so a call queued behind a write sees the new value before the reload.
const written: Partial<Record<Row, string>> = {};
let serial = serializer();

export function resetConfig(): void {
	for (const row of ROWS) delete written[row];
	serial = serializer();
}

const current = (options: Options, row: Row): unknown =>
	written[row] ?? options[row];

// The settings as stored, so one setting's line can name the others it depends on.
const storedOf = (options: Options): Stored => ({
	provider: current(options, "provider"),
	gateway: current(options, "gateway"),
	scope: current(options, "scope"),
	models: current(options, "models"),
	model: current(options, "model"),
});

export async function registerConfigTool(
	$: Engine,
	e: SessionStart,
	next: Next,
): Promise<Outcome> {
	await $.tool.register(TOOL_SPEC);
	return next(e);
}

// Hides the row of the removed `model` option. The manifest keeps the option so a stored value
// reaches the migration, but the menu offers no row for it.
export async function hideRow(_: Engine, row: ConfigRow): Promise<RowShown> {
	return {
		label: row.label,
		...(row.description === undefined ? {} : { description: row.description }),
		isHidden: true,
	};
}

// Writes one row. Returns why it was not written, or undefined when it was.
async function put(
	$: Engine,
	row: Row,
	value: string,
): Promise<string | undefined> {
	try {
		const { deny } = await $.config.set({
			key: `${ROW_PREFIX}${row}`,
			value,
		});
		if (deny !== undefined) return deny;
		written[row] = value;
		return undefined;
	} catch (err) {
		return errorText(err);
	}
}

// Writes `models` when there is a text, then erases the removed `model` when asked, in that order.
// A refused `models` stops there. Returns the lines of the writes that failed, and whether `models`
// was written.
async function storeModels(
	$: Engine,
	models: string | undefined,
	eraseModel: boolean,
): Promise<{ stored: boolean; lines: string[] }> {
	if (models !== undefined) {
		const refused = await put($, "models", models);
		if (refused !== undefined)
			return { stored: false, lines: [unchanged("models", refused)] };
	}
	if (!eraseModel) return { stored: models !== undefined, lines: [] };
	const kept = await put($, "model", "");
	return {
		stored: models !== undefined,
		lines: kept === undefined ? [] : [unchanged("model", kept)],
	};
}

// A provider change also stores the models text the removed `model` makes, then erases it.
async function carryModel($: Engine, options: Options): Promise<string[]> {
	const { models, eraseModel } = modelCarry(storedOf(options));
	return (await storeModels($, models, eraseModel)).lines;
}

// The tool and every command write through this one function, so equal outcomes read alike.
async function write(
	$: Engine,
	options: Options,
	setting: ValueSetting,
	value: string,
): Promise<string> {
	const refused = await put($, setting, value);
	if (refused !== undefined) return unchanged(setting, refused);
	const rest = setting === "provider" ? await carryModel($, options) : [];
	return [valueLine(setting, storedOf(options)), ...rest].join("\n");
}

async function writeModels(
	$: Engine,
	options: Options,
	text: string,
): Promise<string> {
	const stored = storedOf(options);
	const planned = modelsWrite(stored, text);
	if ("refused" in planned) return planned.refused;
	const { eraseModel } = modelCarry(stored);
	const already = modelsAlready(stored.models, planned.models);
	if (already !== undefined && !eraseModel) return already;
	const { stored: done, lines } = await storeModels(
		$,
		planned.models,
		eraseModel,
	);
	return [...(done ? modelsLines(storedOf(options)) : []), ...lines].join("\n");
}

async function choose(
	$: Engine,
	setting: ValueSetting,
	options: Options,
): Promise<string> {
	return chooseValue(
		setting,
		current(options, setting),
		(question, labels) =>
			$.ui.ask(question, { options: labels, header: setting }),
		async (value) =>
			value === current(options, setting)
				? unchanged(setting, alreadyValue(value))
				: write($, options, setting, value),
	);
}

async function read($: Engine, options: Options): Promise<string> {
	const stored = storedOf(options);
	const keys = await readKeys($, options, settingsOf(stored));
	return settingsReport(stored, [], keys);
}

async function answer(
	$: Engine,
	call: ConfigCall,
	options: Options,
): Promise<ToolAnswer> {
	if (await denied($, call)) return { deny: REFUSED };
	const { setting, models } = call;
	if (models !== undefined) {
		const asked = modelsCallOf(setting, models);
		return {
			result:
				"refused" in asked
					? asked.refused
					: await writeModels($, options, asked.text),
		};
	}
	if (setting === undefined) return { result: await read($, options) };
	if (isValueSetting(setting))
		return { result: await choose($, setting, options) };
	return { result: badCall() };
}

// One dialog at a time. A call reads the value after the one before it closed.
export function configCall(
	$: Engine,
	call: ConfigCall,
	options: Options,
): Promise<ToolAnswer> {
	return serial(() => answer($, call, options));
}

export async function configCommand(
	$: Engine,
	e: CommandRun,
	setting: ValueSetting,
	options: Options,
): Promise<CommandOutput> {
	const args = e.args.trim();
	if (args !== "" && !isValue(setting, args))
		return { text: useOneOf(setting) };
	if (args === "" || e.origin.kind !== PERSON)
		return { text: valueLine(setting, storedOf(options)) };
	return { text: await write($, options, setting, args) };
}
