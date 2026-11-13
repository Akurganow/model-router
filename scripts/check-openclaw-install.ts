import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COMMAND_NAMES } from "../src/adapters/openclaw/config.ts";
import { createFakeApi } from "../src/adapters/openclaw/fakes.ts";
import { HOOK, SPAWN_TOOL } from "../src/adapters/openclaw/router.ts";
import { PLUGIN_ID } from "../src/adapters/openclaw/settings.ts";
import type {
	OpenClawApi,
	RegistrationMode,
} from "../src/adapters/openclaw/types.ts";
import { TOOL_NAME } from "../src/core/settings.ts";
import { errorText } from "../src/utils/error.ts";
import { nonEmpty } from "../src/utils/text.ts";
import { NPM_ROOT } from "./build/outputs.ts";
import { EXIT_USAGE } from "./exit-codes.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// An object read for the named fields, each of which may be absent or of any type.
type Fields<K extends string> = Partial<Record<K, unknown>>;
/**
 * Returns the value as an object whose named fields may be absent or of any
 * type, or undefined when it is not an object. Never throws.
 */
const fieldsOf = <K extends string>(value: unknown): Fields<K> | undefined =>
	typeof value === "object" && value !== null
		? (value as Fields<K>)
		: undefined;

/**
 * Lists what the report of `openclaw plugins inspect --runtime` gets wrong for
 * the expected package: the plugin id, name, version, status, import, root
 * folder, tool contract and diagnostics. An empty list means the report is
 * clean. The command loads the installed package without activating it, so its
 * report proves the install and the module load but lists no hook, tool or
 * command of this plugin. registrationProblems covers those. Never throws.
 */
export function inspectProblems(
	report: unknown,
	expected: { readonly name: string; readonly version: string },
): string[] {
	const root = fieldsOf<"plugin" | "diagnostics">(report);
	const plugin = fieldsOf<
		| "id"
		| "packageName"
		| "version"
		| "status"
		| "imported"
		| "enabled"
		| "contracts"
		| "rootDir"
	>(root?.plugin);
	if (root === undefined || plugin === undefined)
		return ["the inspect output has no plugin"];
	const problems: string[] = [];
	/** Records a problem when the plugin field differs from the wanted value. */
	const expect = (field: keyof typeof plugin, want: unknown) => {
		if (plugin[field] !== want)
			problems.push(`plugin.${field} is ${plugin[field]}, expected ${want}`);
	};
	expect("id", PLUGIN_ID);
	expect("packageName", expected.name);
	expect("version", expected.version);
	expect("status", "loaded");
	expect("imported", true);
	expect("enabled", true);
	if (nonEmpty(plugin.rootDir) === undefined)
		problems.push("plugin.rootDir is missing, so the bundle cannot be loaded");
	const tools = fieldsOf<"tools">(plugin.contracts)?.tools;
	if (!Array.isArray(tools) || !tools.includes(TOOL_NAME))
		problems.push(`plugin.contracts.tools does not list ${TOOL_NAME}`);
	const { diagnostics } = root;
	if (Array.isArray(diagnostics) && diagnostics.length > 0)
		problems.push(
			`the report holds diagnostics: ${JSON.stringify(diagnostics)}`,
		);
	return problems;
}

// Written out apart from the plugin's own mode tables, so a change to those tables fails this check.
// A Gateway fills the full registry, then the discovery registry that chat dispatch and agent runs
// read. A tool inspection fills a tool-discovery registry. OpenClaw drops every registration in the
// setup and CLI modes.
type Expectation = {
	mode: RegistrationMode;
	hook: boolean;
	tool: boolean;
	commands: boolean;
};
const REGISTRATION_EXPECTATIONS: readonly Expectation[] = [
	{ mode: "full", hook: true, tool: true, commands: true },
	{ mode: "discovery", hook: true, tool: true, commands: true },
	{ mode: "tool-discovery", hook: false, tool: true, commands: false },
	{ mode: "setup-only", hook: false, tool: false, commands: false },
	{ mode: "setup-runtime", hook: false, tool: false, commands: false },
	{ mode: "cli-metadata", hook: false, tool: false, commands: false },
];

/**
 * Returns the problem with one registration in one mode: missing where the mode
 * wants it, present where it does not, and none otherwise. Never throws.
 */
function presence(
	mode: RegistrationMode,
	wanted: boolean,
	present: boolean,
	what: string,
): string[] {
	if (wanted && !present) return [`${mode} mode: no ${what} registered`];
	if (!wanted && present)
		return [
			`${mode} mode: ${what} registered, which this mode should not hold`,
		];
	return [];
}

/**
 * Lists what the plugin registers wrongly in one mode: the routing hook, the
 * config tool and each command, each missing where the mode wants it or present
 * where it does not, a hook that does not match the spawn tool, and any call that
 * OpenClaw drops in that mode. A register function that throws yields one
 * problem. Each problem names the mode. Never throws.
 */
function problemsIn(
	plugin: unknown,
	register: (api: OpenClawApi) => void,
	{ mode, hook: wantHook, tool, commands }: Expectation,
): string[] {
	const fake = createFakeApi({ registrationMode: mode });
	try {
		register.call(plugin, fake.api);
	} catch (error) {
		return [`${mode} mode: register threw: ${errorText(error)}`];
	}
	const hook = fake.hooks.find(({ event }) => event === HOOK);
	const problems = presence(mode, wantHook, hook !== undefined, `${HOOK} hook`);
	if (
		wantHook &&
		hook !== undefined &&
		!JSON.stringify(hook.options ?? null).includes(SPAWN_TOOL)
	)
		problems.push(
			`${mode} mode: the ${HOOK} hook does not match ${SPAWN_TOOL}`,
		);
	const hasTool = fake.tools.some(({ name }) => name === TOOL_NAME);
	problems.push(...presence(mode, tool, hasTool, `${TOOL_NAME} tool`));
	for (const command of COMMAND_NAMES) {
		const has = fake.commands.some(({ name }) => name === command);
		problems.push(...presence(mode, commands, has, `${command} command`));
	}
	if (fake.ignored.length > 0)
		problems.push(
			`${mode} mode: calls ${[...new Set(fake.ignored)].join(", ")}, which OpenClaw drops in this mode`,
		);
	return problems;
}

/**
 * Lists what the installed bundle's default export registers wrongly in each of
 * OpenClaw's six registration modes. Full and discovery mode want the routing
 * hook, the config tool and each command, because a Gateway's chat turns and
 * agent runs read those registries. Tool-discovery mode wants the tool alone. The
 * setup and CLI modes want no call at all. An empty list means every mode got
 * what it wants. A missing register function yields one problem, and a throwing
 * one yields one problem per mode. register() runs against the recording api of
 * the unit tests, with no Gateway. Never throws.
 */
export function registrationProblems(plugin: unknown): string[] {
	const register = fieldsOf<"register">(plugin)?.register;
	if (typeof register !== "function")
		return ["the bundle's default export has no register function"];
	return REGISTRATION_EXPECTATIONS.flatMap((expected) =>
		problemsIn(plugin, register as (api: OpenClawApi) => void, expected),
	);
}

/**
 * Returns the exit code of the install check: 0 when the inspect output file
 * shows the package installed and loaded and the bundle registers everything,
 * EXIT_USAGE without a file argument, and 1 otherwise. Prints each problem.
 * Never throws.
 */
export async function main(args: string[], root: string): Promise<number> {
	const [file] = args;
	if (file === undefined) {
		console.error(
			"usage: node scripts/check-openclaw-install.ts <inspect output file>",
		);
		return EXIT_USAGE;
	}
	try {
		const report = JSON.parse(readFileSync(file, "utf8"));
		const { name, version } = JSON.parse(
			readFileSync(join(root, NPM_ROOT, "package.json"), "utf8"),
		);
		const problems = inspectProblems(report, { name, version });
		if (problems.length === 0) {
			const bundle = join(report.plugin.rootDir, "index.js");
			const { default: plugin } = await import(pathToFileURL(bundle).href);
			problems.push(...registrationProblems(plugin));
		}
		for (const problem of problems) console.error(problem);
		if (problems.length === 0)
			console.log(
				`${PLUGIN_ID} ${version} is installed and loaded; it registers ${HOOK}, ${TOOL_NAME} and ${COMMAND_NAMES.join(", ")} in full and discovery mode, and only ${TOOL_NAME} in tool-discovery mode.`,
			);
		return problems.length === 0 ? 0 : 1;
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		return 1;
	}
}

if (import.meta.main) process.exit(await main(process.argv.slice(2), ROOT));
