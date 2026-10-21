import { expect, test } from "claude-code/testing";
import { EFFORT_LADDER, route } from "../hooks/router.ts";
import { answer } from "./harness.ts";

const input = (prompt: string) => ({
	role: "general-purpose",
	description: "task",
	prompt,
	model: "jev-latest",
});

// The scoring itself is tested in shared/core*.test.ts on the byte-identical copy this mod carries.
test("the decision names the tier, the work index and the effort from the ladder", async () => {
	const work = { "0": 0.7, "1": 0.2, "2": 0.1 };
	const d = await route(input("Fix the named defect."), async () =>
		answer({ "0": 0.2, "1": 0.7, "2": 0.1 }, work),
	);
	expect(d).toEqual({
		model: "sonnet",
		level: 1,
		workIndex: 0,
		effort: EFFORT_LADDER.sonnet[0],
		probabilities: { tier: { "0": 0.2, "1": 0.7, "2": 0.1 }, work },
	});
	const haiku = await route(input("Fix the named defect."), async () =>
		answer({ "0": 1, "1": 0, "2": 0 }, work),
	);
	expect("model" in haiku && haiku.model).toBe("haiku");
	expect("effort" in haiku && haiku.effort).toBe(EFFORT_LADDER.haiku[0]);
});
