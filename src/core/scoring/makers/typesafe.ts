import { SYSTEM_ONE } from "#core/scoring/formats/system-one.ts";
import { BEARER, type MakerModule } from "./shared.ts";

// Both endpoints resolve this alias to their newest Jev release.
const JEV = "jev-latest";

export const typesafe: MakerModule = {
	paths: {
		direct: {
			url: "https://api.typesafe.ai/v1/systemone",
			format: SYSTEM_ONE,
			model: JEV,
			keyHeader: BEARER,
		},
		openrouter: {
			url: "https://openrouter.ai/api/v1/systemone",
			format: SYSTEM_ONE,
			model: JEV,
			keyHeader: BEARER,
		},
	},
};
