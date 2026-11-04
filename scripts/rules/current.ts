import { work } from "../../src/effort.ts";
import { tier } from "../../src/model.ts";
import type { Rule } from "../compare-rules.ts";

const rule: Rule = {
	name: "current",
	fit: () => ({ tier: tier.pick, work: work.pick }),
};
export default rule;
