import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { COMMAND_NAMES, TOOL_NAME } from "../src/openclaw-config.ts";
import { createFakeApi } from "../src/openclaw-fakes.ts";
import { SPAWN_TOOL } from "../src/openclaw-router.ts";
import { PLUGIN_ID } from "../src/openclaw-settings.ts";
import { NPM_ROOT } from "./build/outputs.ts";
import { EXIT_USAGE } from "./exit-codes.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGE_NAME = "@akurganow/model-router";
const HOOK = "before_tool_call";

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
	if (!Array.isArray(tools) || !tools.includes(TOOL_NAME))
		problems.push(`plugin.contracts.tools does not list ${TOOL_NAME}`);
	const { diagnostics } = root;
	if (Array.isArray(diagnostics) && diagnostics.length > 0)
		problems.push(
			`the report holds diagnostics: ${JSON.stringify(diagnostics)}`,
		);
	return problems;
}

// Runs the installed bundle's register() against the recording api of the
// unit tests, in full mode (the mode a running Gateway uses), and lists what it
// did not register. No Gateway runs here.
export function registrationProblems(plugin: unknown): string[] {
	const register = fieldsOf<"register">(plugin)?.register;
	if (typeof register !== "function")
		return ["the bundle's default export has no register function"];
	const fake = createFakeApi();
	try {
		register.call(plugin, fake.api);
	} catch (error) {
		return [
			`register threw: ${error instanceof Error ? error.message : error}`,
		];
	}
	const problems: string[] = [];
	const hook = fake.hooks.find(({ event }) => event === HOOK);
	if (hook === undefined) problems.push(`no ${HOOK} hook registered`);
	else if (!JSON.stringify(hook.options ?? null).includes(SPAWN_TOOL))
		problems.push(`the ${HOOK} hook does not match ${SPAWN_TOOL}`);
	if (!fake.tools.some(({ name }) => name === TOOL_NAME))
		problems.push(`no ${TOOL_NAME} tool registered`);
	for (const command of COMMAND_NAMES)
		if (!fake.commands.some(({ name }) => name === command))
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
				`${PLUGIN_ID} ${version} is installed and loaded; it registers ${HOOK}, ${TOOL_NAME} and ${COMMAND_NAMES.join(", ")}.`,
			);
		return problems.length === 0 ? 0 : 1;
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		return 1;
	}
}

if (import.meta.main) process.exit(await main(process.argv.slice(2), ROOT));
