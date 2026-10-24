import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import { getPluginsLockfile } from "@oh-my-pi/pi-utils";
import { createExtension } from "./omp-router.ts";

// The manager loads when a write needs it, so a change in omp's internals breaks writes alone.
async function writeSetting(
	cwd: string,
	plugin: string,
	key: string,
	value: string,
): Promise<void> {
	const { PluginManager } = await import(
		"@oh-my-pi/pi-coding-agent/extensibility/plugins/manager"
	);
	await new PluginManager(cwd).setPluginSetting(plugin, key, value);
}

// The tests inject their own fakes, so only this entry imports omp.
export default createExtension({
	lookup,
	getPluginsLockfile,
	getPluginSettings,
	writeSetting,
});
