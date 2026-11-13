import { tier } from "../../src/core/tier.ts";
import { work } from "../../src/core/work.ts";
import type { Rule } from "../compare-rules.ts";

const rule: Rule = {
	name: "current",
	fit: () => ({ tier: tier.pick, work: work.pick }),
};
export default rule;
