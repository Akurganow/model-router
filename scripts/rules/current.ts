import { tier } from "../../src/core/parts/tier.ts";
import { work } from "../../src/core/parts/work.ts";
import type { Rule } from "../compare-rules.ts";

const rule: Rule = {
	name: "current",
	fit: () => ({ tier: tier.pick, work: work.pick }),
};
export default rule;
