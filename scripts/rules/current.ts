import { work } from "../../src/core/effort.ts";
import { tier } from "../../src/core/model.ts";
import type { Rule } from "../compare-rules.ts";

const rule: Rule = {
	name: "current",
	fit: () => ({ tier: tier.pick, work: work.pick }),
};
export default rule;
