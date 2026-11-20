import { tier } from "#core/parts/tier.ts";
import { work } from "#core/parts/work.ts";
import type { Rule } from "#scripts/compare-rules.ts";

const rule: Rule = {
	name: "current",
	fit: () => ({ tier: tier.pick, work: work.pick }),
};
export default rule;
