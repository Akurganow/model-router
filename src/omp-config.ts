import {
	findKey,
	PLUGIN,
	readSettings,
	type Settings,
	UNREADABLE,
} from "./omp-gates.ts";
import { changeKey } from "./omp-key.ts";
import type { Context, OmpImports, Pi, ToolReply } from "./omp-types.ts";
import { isRecord } from "./part.ts";
import { order } from "./provider.ts";
import {
	alreadyValue,
	ask,
	badCall,
	COMMAND_DESCRIPTIONS,
	isKeySetting,
	isValue,
	isValueSetting,
	keyLine,
	NO_ANSWER,
	NOT_OFFERED,
	pick,
	projectOverrides,
	SETTING_NAMES,
	TOOL_LABEL,
	toolDescription,
	unchanged,
	useOneOf,
	VALUE_SETTINGS,
	type ValueSetting,
	valueLine,
} from "./settings.ts";

const COMMAND_PREFIX = "model-router:";
const TOOL_NAME = "model_router_config";
const LINE_BREAK = "\n";

// A failed report must never block the caller.
export function say(ctx: Context, text: string): void {
	try {
		if (ctx.hasUI) ctx.ui.notify(text);
		else process.stderr.write(`${text}\n`);
	} catch {
		// Nothing is left to tell.
	}
}

// Calls queue behind each other, and a call that fails does not stop the queue.
function serializer() {
	let tail: Promise<unknown> = Promise.resolve();
	return <T>(job: () => Promise<T>): Promise<T> => {
		const run = tail.then(job);
		tail = run.catch(() => undefined);
		return run;
	};
}

async function withSettings(
	omp: OmpImports,
	ctx: Context,
	show: (settings: Settings) => string | Promise<string>,
): Promise<string> {
	const settings = await readSettings(omp, ctx.cwd);
	return settings === undefined ? UNREADABLE : show(settings);
}

// A key is only checked for presence. Nothing about it leaves this function.
const readAll = (omp: OmpImports, ctx: Context): Promise<string> =>
	withSettings(omp, ctx, async ({ provider, scope }) => {
		const keys = await Promise.all(
			order(provider).map(async (name) =>
				keyLine(
					name,
					(await findKey(ctx, name)) === undefined ? "unset" : "set",
				),
			),
		);
		return [
			valueLine("provider", provider),
			valueLine("scope", scope),
			...keys,
		].join(LINE_BREAK);
	});

// Writes go to the global settings. The effective value is read again, because a project value can win.
async function apply(
	omp: OmpImports,
	ctx: Context,
	setting: ValueSetting,
	value: string,
): Promise<string> {
	if (!isValue(setting, value)) return useOneOf(setting);
	const before = await readSettings(omp, ctx.cwd);
	if (before === undefined) return unchanged(setting, UNREADABLE);
	if (before[setting] === value) return unchanged(setting, alreadyValue(value));
	try {
		await omp.writeSetting(ctx.cwd, PLUGIN, setting, value);
	} catch (err) {
		return unchanged(setting, err instanceof Error ? err.message : String(err));
	}
	const now = (await readSettings(omp, ctx.cwd))?.[setting] ?? value;
	const line = valueLine(setting, now);
	return now === value
		? line
		: [line, projectOverrides(setting)].join(LINE_BREAK);
}

async function select(
	ctx: Context,
	question: string,
	options: string[],
): Promise<string | undefined> {
	try {
		return await ctx.ui.select(question, options);
	} catch {
		return undefined;
	}
}

async function dialog(
	omp: OmpImports,
	ctx: Context,
	setting: ValueSetting,
): Promise<string> {
	if (!ctx.hasUI) return unchanged(setting, NO_ANSWER);
	const shown = await readSettings(omp, ctx.cwd);
	const { question, options } = ask(setting, shown?.[setting]);
	const answer = await select(ctx, question, options);
	if (answer === undefined) return unchanged(setting, NO_ANSWER);
	const value = pick(setting, answer);
	return value === undefined
		? unchanged(setting, NOT_OFFERED)
		: apply(omp, ctx, setting, value);
}

async function runTool(
	omp: OmpImports,
	ctx: Context,
	params: unknown,
): Promise<string> {
	const { setting } = isRecord(params) ? params : {};
	if (setting === undefined) return readAll(omp, ctx);
	if (isValueSetting(setting)) return dialog(omp, ctx, setting);
	return isKeySetting(setting)
		? changeKey(ctx, setting)
		: badCall(SETTING_NAMES);
}

async function runCommand(
	omp: OmpImports,
	ctx: Context,
	setting: ValueSetting,
	args: string,
): Promise<string> {
	const value = args.trim();
	return value === ""
		? withSettings(omp, ctx, (settings) =>
				valueLine(setting, settings[setting]),
			)
		: apply(omp, ctx, setting, value);
}

const reply = (text: string): ToolReply => ({
	content: [{ type: "text", text }],
});

export function registerConfig(omp: OmpImports, pi: Pi): void {
	const serial = serializer();
	for (const setting of VALUE_SETTINGS)
		pi.registerCommand(`${COMMAND_PREFIX}${setting}`, {
			description: COMMAND_DESCRIPTIONS[setting],
			handler: (args, ctx) =>
				serial(async () => say(ctx, await runCommand(omp, ctx, setting, args))),
		});
	pi.registerTool({
		name: TOOL_NAME,
		label: TOOL_LABEL,
		description: toolDescription(SETTING_NAMES),
		parameters: pi.zod.object({
			setting: pi.zod.enum(SETTING_NAMES).optional(),
		}),
		loadMode: "essential",
		approval: "write",
		execute: (_id, params, _signal, _update, ctx) =>
			serial(async () => reply(await runTool(omp, ctx, params))),
	});
}
