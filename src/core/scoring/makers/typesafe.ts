import { SYSTEM_ONE } from "#core/scoring/formats/system-one.ts";
import { BEARER, type MakerModule } from "#core/scoring/maker-module.ts";

// Both endpoints resolve this alias to their newest Jev release.
const JEV = "jev-latest";

export const typesafe: MakerModule = {
	vendor: "typesafe",
	openrouterRoute: "system-one",
	// Every known name has an entry, and OpenRouter's System One route maps these aliases itself.
	openrouterNames: {
		"jev-latest": "jev-latest",
		"jev-preview": "jev-preview",
		"jev-1.14.0": "typesafe/jev-1.14",
		"jev-1.13.0": "typesafe/jev-1.13",
	},
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
