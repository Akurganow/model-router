import {
	type Environment,
	readState,
	type State,
	withPluginSetting,
} from "./openclaw-settings.ts";
import type {
	CommandContext,
	CommandResult,
	OpenClawApi,
	ToolResult,
} from "./openclaw-types.ts";
import { isRecord } from "./part.ts";
import { type Keys, order, type Provider } from "./provider.ts";
import {
	alreadyValue,
	badCall,
	COMMAND_DESCRIPTIONS,
	isKeySetting,
	isValue,
	isValueSetting,
	keyLine,
	keyProvider,
	SETTING_NAMES,
	TOOL_LABEL,
	unchanged,
	useOneOf,
	VALUE_SETTINGS,
	type ValueSetting,
	valueLine,
} from "./settings.ts";

export const TOOL_NAME = "model_router_config";
const COMMAND_PREFIX = "model-router-";
const commandName = (setting: ValueSetting): string =>
	`${COMMAND_PREFIX}${setting}`;
export const COMMAND_NAMES: readonly string[] = VALUE_SETTINGS.map(commandName);
const ADMIN_SCOPE = "operator.admin";
const LINE_BREAK = "\n";
const UNSET = "unset";

export const NOT_OWNER = "only the owner can change it";
export const TOOL_DESCRIPTION = `Reads the router's settings. With no input it returns the provider, the scope, both models, and whether each key the provider allows is set. With a setting name (${SETTING_NAMES.join(", ")}) it returns how the person changes that setting. It changes nothing and never returns a key.`;

const modelLine = (name: string, model: string | undefined): string =>
	`${name}: ${model ?? UNSET}`;

// A key is only checked for presence. Nothing about it leaves this function.
function keyLines(providers: readonly Provider[], keys: Keys): string[] {
	return providers.map((name) =>
		keyLine(name, keys[name] === undefined ? UNSET : "set"),
	);
}

function readAll({ settings, keys }: State): string {
	return [
		valueLine("provider", settings.provider),
		valueLine("scope", settings.scope),
		modelLine("small_model", settings.smallModel),
		modelLine("large_model", settings.largeModel),
		...keyLines(order(settings.provider), keys),
	].join(LINE_BREAK);
}

function howToChange(setting: unknown): string {
	if (isValueSetting(setting))
		return [
			`Type /${commandName(setting)} <value> in the chat.`,
			useOneOf(setting),
		].join(LINE_BREAK);
	return isKeySetting(setting)
		? `Enter the ${keyProvider(setting)} key in the plugin's settings. Never type a key into the chat.`
		: badCall(SETTING_NAMES);
}

function runTool(api: OpenClawApi, env: Environment, params: unknown): string {
	const { setting } = isRecord(params) ? params : {};
	return setting === undefined
		? readAll(readState(api, env))
		: howToChange(setting);
}

// OpenClaw runs the `requiredScopes` check before the handler. A channel message carries no
// gateway scopes, and the check lets its owner through (`executeRegisteredPluginCommand` in
// src/plugins/plugin-command-execution.ts), so the owner flag is the one check left here.
const isOwner = (ctx: CommandContext): boolean => ctx.senderIsOwner === true;

// "auto" is the only policy that publishes the write to the runtime snapshot `config.current()` returns,
// so the next spawn sees the value. "none" skips that, and "restart" would drop the gateway for a setting.
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
		return unchanged(setting, err instanceof Error ? err.message : String(err));
	}
}

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

// A failure must never throw into OpenClaw's command or tool dispatch.
function failure(err: unknown): string {
	return `error: ${err instanceof Error ? err.message : String(err)}`;
}

export function registerConfig(api: OpenClawApi, env: Environment): void {
	api.registerTool({
		name: TOOL_NAME,
		label: TOOL_LABEL,
		description: TOOL_DESCRIPTION,
		parameters: {
			type: "object",
			properties: { setting: { type: "string", enum: SETTING_NAMES } },
			additionalProperties: false,
		},
		execute: async (_id, params) => {
			try {
				return textOf(runTool(api, env, params));
			} catch (err) {
				return textOf(failure(err));
			}
		},
	});
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
