import { modelToolSentences, runModels } from "../../core/models.ts";
import {
	alreadyValue,
	badCall,
	COMMAND_DESCRIPTIONS,
	commandName,
	isKeySetting,
	isValue,
	isValueSetting,
	keyProvider,
	readOnlyToolDescription,
	SETTING_NAMES,
	settingsReport,
	TOOL_LABEL,
	TOOL_NAME,
	unchanged,
	unchangedBy,
	useOneOf,
	VALUE_SETTINGS,
	type ValueSetting,
	valueLine,
	valueSettingHelp,
} from "../../core/settings.ts";
import {
	SLOT_SETTINGS,
	SLOTS,
	slotLine,
	slotSetting,
} from "../../core/slots.ts";
import { errorText } from "../../utils/error.ts";
import { isRecord } from "../../utils/guards.ts";
import { type ListModels, listFromOpenClaw, modelPort } from "./models.ts";
import {
	type Environment,
	readState,
	type State,
	withPluginSetting,
} from "./settings.ts";
import type {
	CommandContext,
	CommandResult,
	OpenClawApi,
	ToolResult,
} from "./types.ts";

export const COMMAND_NAMES: readonly string[] = VALUE_SETTINGS.map(commandName);
const ADMIN_SCOPE = "operator.admin";
const LINE_BREAK = "\n";

export const NOT_OWNER = "only the owner can change it";
// No chat command sets a model, but the tool still answers where it is set, so
// the schema has to let the name through: OpenClaw checks arguments before execute.
const CHANGED_SETTINGS = [...SETTING_NAMES, ...SLOT_SETTINGS];
const TOOL_SETTINGS = [...CHANGED_SETTINGS, "models"];
export const TOOL_DESCRIPTION = `${readOnlyToolDescription(
	["the provider", "the scope", "the three models"],
	CHANGED_SETTINGS,
)} ${modelToolSentences(false)}`;

/**
 * Returns the report: the provider, the scope, the three models as configured,
 * and one line per provider that says whether its key is set or unset. A key
 * is only checked for presence. Nothing about it leaves this function.
 */
function readAll({ settings, keys }: State): string {
	return settingsReport(
		settings.provider,
		settings.scope,
		SLOTS.map((slot) => slotLine(slotSetting(slot), settings.models[slot])),
		keys,
	);
}

/**
 * Returns how the person changes a setting: the command and its allowed values
 * for a value setting, the plugin's settings for a key setting, and the list of
 * setting names for anything else. Never throws.
 */
function howToChange(setting: unknown): string {
	if (isValueSetting(setting)) return valueSettingHelp(setting);
	return isKeySetting(setting)
		? `Enter the ${keyProvider(setting)} key in the plugin's settings. Never type a key into the chat.`
		: badCall(TOOL_SETTINGS);
}

/**
 * Returns the text of one tool call: the full settings read when `params` names
 * no setting, the models or where a model is set for a model setting, otherwise
 * how to change that setting. Params that are not an object count as no input.
 * An error from reading the state propagates.
 */
async function runTool(
	api: OpenClawApi,
	env: Environment,
	listModels: ListModels,
	params: unknown,
): Promise<string> {
	const { setting } = isRecord(params) ? params : {};
	if (setting === undefined) return readAll(readState(api, env));
	return (
		(await runModels(modelPort(api, listModels), { setting })) ??
		howToChange(setting)
	);
}

// OpenClaw runs the `requiredScopes` check before the handler. A channel message carries no
// gateway scopes, and the check lets its owner through (`executeRegisteredPluginCommand` in
// src/plugins/plugin-command-execution.ts), so the owner flag is the one check left here.
const isOwner = (ctx: CommandContext): boolean => ctx.senderIsOwner === true;

/**
 * Writes one setting to the live config and returns its value line, or the
 * unchanged line with the error message when the write fails. Never rejects. The
 * write asserts that the owner is still current when the context offers the
 * check. "auto" is the only policy that publishes the write to the runtime
 * snapshot `config.current()` returns, so the next spawn sees the value. "none"
 * skips that, and "restart" would drop the gateway for a setting.
 */
async function write(
	api: OpenClawApi,
	ctx: CommandContext,
	setting: ValueSetting,
	value: string,
): Promise<string> {
	try {
		await api.runtime.config.mutateConfigFile({
			afterWrite: { mode: "auto" },
			...(ctx.assertOwnerCurrent
				? { writeOptions: { assertCurrent: ctx.assertOwnerCurrent } }
				: {}),
			mutate: (draft) => withPluginSetting(draft, setting, value),
		});
		return valueLine(setting, value);
	} catch (err) {
		return unchangedBy(setting, err);
	}
}

/**
 * Returns the reply to a setting command. An empty argument returns the current
 * value, and an invalid one returns the allowed values. A sender who is not the
 * owner gets the unchanged line, and so does a value already set. Any other
 * value is written. An error from reading the state propagates.
 */
async function runCommand(
	api: OpenClawApi,
	env: Environment,
	ctx: CommandContext,
	setting: ValueSetting,
): Promise<string> {
	const value = (ctx.args ?? "").trim();
	const current = readState(api, env).settings[setting];
	if (value === "") return valueLine(setting, current);
	if (!isValue(setting, value)) return useOneOf(setting);
	if (!isOwner(ctx))
		return [unchanged(setting, NOT_OWNER), valueLine(setting, current)].join(
			LINE_BREAK,
		);
	if (current === value) return unchanged(setting, alreadyValue(value));
	return write(api, ctx, setting, value);
}

const textOf = (text: string): ToolResult => ({
	content: [{ type: "text", text }],
});

/**
 * Returns `error: ` and the message of a thrown value, or its string form. Never
 * throws, because a failure must never throw into OpenClaw's command or tool
 * dispatch.
 */
function failure(err: unknown): string {
	return `error: ${errorText(err)}`;
}

/**
 * Registers the config tool, which lists the models with `listModels`. Its
 * execute never rejects: a failure comes back as an `error:` text. Throws only
 * when the api rejects the registration.
 */
export function registerConfigTool(
	api: OpenClawApi,
	env: Environment,
	listModels: ListModels = listFromOpenClaw,
): void {
	api.registerTool({
		name: TOOL_NAME,
		label: TOOL_LABEL,
		description: TOOL_DESCRIPTION,
		parameters: {
			type: "object",
			properties: { setting: { type: "string", enum: TOOL_SETTINGS } },
			additionalProperties: false,
		},
		execute: async (_id, params) => {
			try {
				return textOf(await runTool(api, env, listModels, params));
			} catch (err) {
				return textOf(failure(err));
			}
		},
	});
}

/**
 * Registers one command for each value setting. Each handler never rejects: a
 * failure comes back as an `error:` text. Throws only when the api rejects a
 * registration.
 */
export function registerConfigCommands(
	api: OpenClawApi,
	env: Environment,
): void {
	for (const setting of VALUE_SETTINGS)
		api.registerCommand({
			name: commandName(setting),
			description: COMMAND_DESCRIPTIONS[setting],
			acceptsArgs: true,
			requiredScopes: [ADMIN_SCOPE],
			handler: async (ctx): Promise<CommandResult> => {
				try {
					return { text: await runCommand(api, env, ctx, setting) };
				} catch (err) {
					return { text: failure(err) };
				}
			},
		});
}
