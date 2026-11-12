import { order } from "../../core/provider.ts";
import {
	alreadyValue,
	badCall,
	chooseValue,
	isValue,
	isValueSetting,
	REFUSED,
	settingsReport,
	toolDescription,
	unchanged,
	unchangedBy,
	useOneOf,
	VALUE_SETTINGS,
	type ValueSetting,
	valueLine,
} from "../../core/settings.ts";
import { serializer } from "../../utils/serializer.ts";
import type {
	CommandOutput,
	CommandRun,
	ConfigCall,
	Engine,
	Next,
	Options,
	Outcome,
	SessionStart,
	ToolAnswer,
} from "./host.ts";
import { denied } from "./host.ts";
import { readKeys } from "./keys.ts";

const ROW_PREFIX = "model-router.";
// Only the person's own Enter at the prompt may change a setting by command.
const PERSON = "composer";

const TOOL_SPEC = {
	name: "config",
	description: toolDescription(VALUE_SETTINGS),
	inputSchema: {
		type: "object",
		properties: { setting: { type: "string", enum: VALUE_SETTINGS } },
	},
};

// What this instance wrote, so a call queued behind a write sees the new value before the reload.
const written: Partial<Record<ValueSetting, string>> = {};
let serial = serializer();

export function resetConfig(): void {
	for (const setting of VALUE_SETTINGS) delete written[setting];
	serial = serializer();
}

const current = (options: Options, setting: ValueSetting): unknown =>
	written[setting] ?? options[setting];

export async function registerConfigTool(
	$: Engine,
	e: SessionStart,
	next: Next,
): Promise<Outcome> {
	await $.tool.register(TOOL_SPEC);
	return next(e);
}

// The tool and both commands write through this one function, so equal outcomes read alike.
async function write(
	$: Engine,
	setting: ValueSetting,
	value: string,
): Promise<string> {
	try {
		const { deny } = await $.config.set({
			key: `${ROW_PREFIX}${setting}`,
			value,
		});
		if (deny !== undefined) return unchanged(setting, deny);
		written[setting] = value;
		return valueLine(setting, value);
	} catch (err) {
		return unchangedBy(setting, err);
	}
}

async function choose(
	$: Engine,
	setting: ValueSetting,
	options: Options,
): Promise<string> {
	return chooseValue(
		setting,
		current(options, setting),
		async (question, labels) => {
			try {
				return await $.ui.ask(question, { options: labels, header: setting });
			} catch {
				return undefined;
			}
		},
		async (value) =>
			value === current(options, setting)
				? unchanged(setting, alreadyValue(value))
				: write($, setting, value),
	);
}

async function read($: Engine, options: Options): Promise<string> {
	const provider = current(options, "provider");
	const keys = await readKeys($, options, provider);
	return settingsReport(
		provider,
		current(options, "scope"),
		[],
		order(provider).map((name) => [
			name,
			keys[name] === undefined ? "unset" : "set",
		]),
	);
}

async function answer(
	$: Engine,
	call: ConfigCall,
	options: Options,
): Promise<ToolAnswer> {
	if (await denied($, call)) return { deny: REFUSED };
	const { setting } = call;
	if (setting === undefined) return { result: await read($, options) };
	if (isValueSetting(setting))
		return { result: await choose($, setting, options) };
	return { result: badCall(VALUE_SETTINGS) };
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
		return { text: valueLine(setting, current(options, setting)) };
	return { text: await write($, setting, args) };
}
