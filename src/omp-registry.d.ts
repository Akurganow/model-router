// omp is not installed here. The adapter's entry imports these modules and the bundle leaves them external.
declare module "@oh-my-pi/pi-coding-agent/config/registry" {
	export function lookup(
		id: string,
	): { get(scope: unknown): unknown } | undefined;
}

declare module "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader" {
	export function getPluginSettings(
		pluginName: string,
		cwd: string,
	): Promise<Record<string, unknown>>;
}

declare module "@oh-my-pi/pi-utils" {
	export function getPluginsLockfile(home?: string): string;
}

declare module "@oh-my-pi/pi-coding-agent/extensibility/plugins/manager" {
	export class PluginManager {
		constructor(cwd?: string);
		setPluginSetting(name: string, key: string, value: unknown): Promise<void>;
	}
}
