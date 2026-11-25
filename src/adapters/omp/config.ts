import {
	alreadyValue,
	badCall,
	COMMAND_DESCRIPTIONS,
	chooseValue,
	isValue,
	isValueSetting,
	modelsAlready,
	modelsCallOf,
	modelsLines,
	modelsWrite,
	NO_ANSWER,
	type Stored,
	settingsOf,
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
} from "#core/options/settings.ts";
import { UNREADABLE } from "#core/output/reasons.ts";
import { collectKeys } from "#core/providers/provider.ts";
import { errorText } from "#utils/error.ts";
import { isRecord } from "#utils/guards.ts";
import { serializer } from "#utils/serializer.ts";
import { findKey, readGlobalSettings, readSettings } from "./settings.ts";
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
	show: (stored: Stored) => string | Promise<string>,
): Promise<string> {
	const stored = await readSettings(omp, ctx.cwd);
	return stored === undefined ? UNREADABLE : show(stored);
}

// A key is only checked for presence. Nothing about it leaves this function.
const readAll = (omp: OmpImports, ctx: Context): Promise<string> =>
	withSettings(omp, ctx, async (stored) =>
		settingsReport(
			stored,
			[],
			await collectKeys(settingsOf(stored), (holder) => findKey(ctx, holder)),
		),
	);

/**
 * Sets a setting to a value and returns the line to show. Returns the allowed
 * values when the value is not one of them. Returns an unchanged line when the
 * settings are unreadable, omp gave no installed name, or the write fails.
 * A write replaces the global text, so it is skipped when that text already
 * equals the value. The line is then "already" if the applied text equals it
 * too, else the applied line and the project-override line. Never throws.
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
	const global = await readGlobalSettings(omp);
	if (before === undefined || global === undefined || plugin === undefined)
		return unchanged(setting, UNREADABLE);
	if (global[setting] === value && before[setting] === value)
		return unchanged(setting, alreadyValue(value));
	const wrote = global[setting] !== value;
	if (wrote) {
		try {
			await omp.writeSetting(ctx.cwd, plugin, setting, value);
		} catch (err) {
			return unchangedBy(setting, err);
		}
	}
	// Nothing changed without a write, so the first read still holds.
	const after = wrote
		? ((await readSettings(omp, ctx.cwd)) ?? { ...before, [setting]: value })
		: before;
	const line = valueLine(setting, after);
	return after[setting] === value
		? line
		: [line, projectOverrides(setting)].join(LINE_BREAK);
}

/**
 * Writes the models text to the global settings and returns the models lines. A project's value
 * never applies, so no override line follows. Returns the refusal line for a text that is not
 * valid, and an unchanged line when the text is stored already, the settings are unreadable, omp
 * gave no installed name, or the write fails. Never throws.
 */
async function applyModels(
	omp: OmpImports,
	ctx: Context,
	text: string,
): Promise<string> {
	const { plugin } = omp;
	const global = await readGlobalSettings(omp);
	if (global === undefined || plugin === undefined)
		return unchanged("models", UNREADABLE);
	const write = modelsWrite(global, text);
	if ("refused" in write) return write.refused;
	const already = modelsAlready(global.models, write.models);
	if (already !== undefined) return already;
	try {
		await omp.writeSetting(ctx.cwd, plugin, "models", write.models);
	} catch (err) {
		return unchanged("models", errorText(err));
	}
	const after = (await readSettings(omp, ctx.cwd)) ?? {
		...global,
		models: write.models,
	};
	return modelsLines(after).join(LINE_BREAK);
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
	const { setting, models } = isRecord(params) ? params : {};
	if (models !== undefined) {
		const asked = modelsCallOf(setting, models);
		return "refused" in asked
			? asked.refused
			: applyModels(omp, ctx, asked.text);
	}
	if (setting === undefined) return readAll(omp, ctx);
	return isValueSetting(setting) ? dialog(omp, ctx, setting) : badCall();
}

async function runCommand(
	omp: OmpImports,
	ctx: Context,
	setting: ValueSetting,
	args: string,
): Promise<string> {
	const value = args.trim();
	return value === ""
		? withSettings(omp, ctx, (stored) => valueLine(setting, stored))
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
		description: toolDescription(),
		parameters: pi.zod.object({
			setting: pi.zod.enum(VALUE_SETTINGS).optional(),
			models: pi.zod.string().optional(),
		}),
		loadMode: "essential",
		approval: "write",
		execute: (_id, params, _signal, _update, ctx) =>
			serial(async () => reply(await runTool(omp, ctx, params))),
	});
}
