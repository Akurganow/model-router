import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";
import { createExtension } from "./omp-router.ts";

// The tests inject their own lookup, so only this entry imports the registry.
export default createExtension(lookup);
