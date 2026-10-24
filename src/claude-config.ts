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
} from "./claude-host.ts";
import { denied } from "./claude-host.ts";
import { readKeys } from "./claude-keys.ts";
import { order } from "./provider.ts";
import {
	alreadyValue,
	ask,
	badCall,
	isValue,
	isValueSetting,
	keyLine,
	NO_ANSWER,
	NOT_OFFERED,
	pick,
	REFUSED,
	toolDescription,
	unchanged,
	useOneOf,
	VALUE_SETTINGS,
	type ValueSetting,
	valueLine,
} from "./settings.ts";

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
let queue: Promise<unknown> = Promise.resolve();

export function resetConfig(): void {
	for (const setting of VALUE_SETTINGS) delete written[setting];
	queue = Promise.resolve();
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
		return unchanged(setting, err instanceof Error ? err.message : String(err));
	}
}

async function choose(
	$: Engine,
	setting: ValueSetting,
	options: Options,
): Promise<string> {
	const { question, options: labels } = ask(setting, current(options, setting));
	let answer: string;
	try {
		answer = await $.ui.ask(question, { options: labels, header: setting });
	} catch {
		return unchanged(setting, NO_ANSWER);
	}
	const value = pick(setting, answer);
	if (value === undefined) return unchanged(setting, NOT_OFFERED);
	if (value === current(options, setting))
		return unchanged(setting, alreadyValue(value));
	return write($, setting, value);
}

async function read($: Engine, options: Options): Promise<string> {
	const provider = current(options, "provider");
	const keys = await readKeys($, options, provider);
	return [
		valueLine("provider", provider),
		valueLine("scope", current(options, "scope")),
		...order(provider).map((name) =>
			keyLine(name, keys[name] === undefined ? "unset" : "set"),
		),
	].join("\n");
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
	const run = queue.then(() => answer($, call, options));
	queue = run.catch(() => undefined);
	return run;
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
