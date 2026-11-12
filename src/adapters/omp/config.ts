import { order } from "../../core/provider.ts";
import { UNREADABLE } from "../../core/reasons.ts";
import {
	alreadyValue,
	badCall,
	COMMAND_DESCRIPTIONS,
	chooseValue,
	isKeySetting,
	isValue,
	isValueSetting,
	NO_ANSWER,
	SETTING_NAMES,
	settingsReport,
	TOOL_LABEL,
	TOOL_NAME,
	toolDescription,
	unchanged,
	unchangedBy,
	useOneOf,
	VALUE_SETTINGS,
	type ValueSetting,
	valueLine,
} from "../../core/settings.ts";
import { isRecord } from "../../utils/guards.ts";
import { serializer } from "../../utils/serializer.ts";
import { findKey, readSettings, type Settings } from "./gates.ts";
import { changeKey } from "./key.ts";
import type { Context, OmpImports, Pi, ToolReply } from "./types.ts";

const COMMAND_PREFIX = "model-router:";
const LINE_BREAK = "\n";

export const projectOverrides = (setting: ValueSetting): string =>
	`A project value for ${setting} overrides it.`;

// A failed report must never block the caller.
export function say(ctx: Context, text: string): void {
	try {
		if (ctx.hasUI) ctx.ui.notify(text);
		else process.stderr.write(`${text}\n`);
	} catch {
		// Nothing is left to tell.
	}
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
			order(provider).map(
				async (name) =>
					[
						name,
						(await findKey(ctx, name)) === undefined ? "unset" : "set",
					] as const,
			),
		);
		return settingsReport(provider, scope, [], keys);
	});

/**
 * Sets a setting to a value and returns the line to show. Returns the allowed
 * values when the value is not one of them. Returns an unchanged line when the
 * settings are unreadable, omp gave no installed name, the value already holds,
 * or the write fails. Writes go to the global settings. The effective value is
 * read again, because a project value can win, and the line then names the
 * override. Never throws.
 */
async function apply(
	omp: OmpImports,
	ctx: Context,
	setting: ValueSetting,
	value: string,
): Promise<string> {
	if (!isValue(setting, value)) return useOneOf(setting);
	const { plugin } = omp;
	const before = await readSettings(omp, ctx.cwd);
	if (before === undefined || plugin === undefined)
		return unchanged(setting, UNREADABLE);
	if (before[setting] === value) return unchanged(setting, alreadyValue(value));
	try {
		await omp.writeSetting(ctx.cwd, plugin, setting, value);
	} catch (err) {
		return unchangedBy(setting, err);
	}
	const now = (await readSettings(omp, ctx.cwd))?.[setting] ?? value;
	const line = valueLine(setting, now);
	return now === value
		? line
		: [line, projectOverrides(setting)].join(LINE_BREAK);
}

async function dialog(
	omp: OmpImports,
	ctx: Context,
	setting: ValueSetting,
): Promise<string> {
	if (!ctx.hasUI) return unchanged(setting, NO_ANSWER);
	const shown = await readSettings(omp, ctx.cwd);
	return chooseValue(
		setting,
		shown?.[setting],
		(question, options) => ctx.ui.select(question, options),
		(value) => apply(omp, ctx, setting, value),
	);
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
