import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { NPM_ROOT } from "./build/outputs.ts";
import { EXIT_USAGE } from "./exit-codes.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PLUGIN_ID = "model-router-openclaw";
const PACKAGE_NAME = "@akurganow/model-router";
const HOOK = "before_tool_call";
const TOOL = "model_router_config";
const COMMANDS = ["model-router-provider", "model-router-scope"];

// An object read for the named fields, each of which may be absent or of any type.
type Fields<K extends string> = Partial<Record<K, unknown>>;
const fieldsOf = <K extends string>(value: unknown): Fields<K> | undefined =>
	typeof value === "object" && value !== null
		? (value as Fields<K>)
		: undefined;

// `openclaw plugins inspect --runtime` loads the installed package without
// activating it, so its report proves the install and the module load but
// lists no hook, tool or command of this plugin. registrationProblems covers those.
export function inspectProblems(report: unknown, version: string): string[] {
	const root = fieldsOf<"plugin" | "diagnostics">(report);
	const plugin = fieldsOf<
		| "id"
		| "packageName"
		| "version"
		| "status"
		| "imported"
		| "enabled"
		| "contracts"
	>(root?.plugin);
	if (root === undefined || plugin === undefined)
		return ["the inspect output has no plugin"];
	const problems: string[] = [];
	const expect = (field: keyof typeof plugin, want: unknown) => {
		if (plugin[field] !== want)
			problems.push(`plugin.${field} is ${plugin[field]}, expected ${want}`);
	};
	expect("id", PLUGIN_ID);
	expect("packageName", PACKAGE_NAME);
	expect("version", version);
	expect("status", "loaded");
	expect("imported", true);
	expect("enabled", true);
	const tools = fieldsOf<"tools">(plugin.contracts)?.tools;
	if (!Array.isArray(tools) || !tools.includes(TOOL))
		problems.push(`plugin.contracts.tools does not list ${TOOL}`);
	const { diagnostics } = root;
	if (Array.isArray(diagnostics) && diagnostics.length > 0)
		problems.push(
			`the report holds diagnostics: ${JSON.stringify(diagnostics)}`,
		);
	return problems;
}

// Runs the installed bundle's register() against a recording api in full
// mode, the mode a running Gateway uses, and lists what it did not register.
export function registrationProblems(plugin: unknown): string[] {
	const register = fieldsOf<"register">(plugin)?.register;
	if (typeof register !== "function")
		return ["the bundle's default export has no register function"];
	const hooks: { event: string; options: unknown }[] = [];
	const tools: string[] = [];
	const commands: string[] = [];
	const noop = () => {};
	const api = {
		id: PLUGIN_ID,
		registrationMode: "full",
		config: {},
		pluginConfig: {},
		logger: { debug: noop, info: noop, warn: noop, error: noop },
		on: (event: string, _handler: unknown, options: unknown) =>
			void hooks.push({ event, options }),
		registerTool: (tool: Fields<"name">) => void tools.push(String(tool.name)),
		registerCommand: (command: Fields<"name">) =>
			void commands.push(String(command.name)),
	};
	try {
		register.call(plugin, api);
	} catch (error) {
		return [
			`register threw: ${error instanceof Error ? error.message : error}`,
		];
	}
	const problems: string[] = [];
	const hook = hooks.find(({ event }) => event === HOOK);
	if (hook === undefined) problems.push(`no ${HOOK} hook registered`);
	else if (!JSON.stringify(hook.options).includes("sessions_spawn"))
		problems.push(`the ${HOOK} hook does not match sessions_spawn`);
	if (!tools.includes(TOOL)) problems.push(`no ${TOOL} tool registered`);
	for (const command of COMMANDS)
		if (!commands.includes(command))
			problems.push(`no ${command} command registered`);
	return problems;
}

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
		const { version } = JSON.parse(
			readFileSync(join(root, NPM_ROOT, "package.json"), "utf8"),
		);
		const problems = inspectProblems(report, version);
		if (problems.length === 0) {
			const bundle = join(report.plugin.rootDir, "index.js");
			const { default: plugin } = await import(pathToFileURL(bundle).href);
			problems.push(...registrationProblems(plugin));
		}
		for (const problem of problems) console.error(problem);
		if (problems.length === 0)
			console.log(
				`${PLUGIN_ID} ${version} is installed and loaded; it registers ${HOOK}, ${TOOL} and ${COMMANDS.join(", ")}.`,
			);
		return problems.length === 0 ? 0 : 1;
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		return 1;
	}
}

if (import.meta.main) process.exit(await main(process.argv.slice(2), ROOT));
