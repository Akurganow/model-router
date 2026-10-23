import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import { getPluginsLockfile } from "@oh-my-pi/pi-utils";
import { createExtension } from "./omp-router.ts";

// The tests inject their own fakes, so only this entry imports omp.
export default createExtension({
	lookup,
	getPluginsLockfile,
	getPluginSettings,
});
