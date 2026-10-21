import { claude } from "./claude.ts";
import { omp } from "./omp.ts";
import type { Adapter } from "./types.ts";

// A new client adds its adapter file, one line here, and its install and key steps in the workflow.
export const ADAPTERS: Readonly<Record<string, Adapter>> = { claude, omp };
