import { OPENAI_DECISIONS } from "#core/scoring/formats/openai-decisions.ts";
import { OPENROUTER_DECISIONS } from "#core/scoring/formats/openrouter-decisions.ts";
import { BEARER, type MakerModule } from "#core/scoring/maker-module.ts";

export const openai: MakerModule = {
	paths: {
		direct: {
			url: "https://api.openai.com/v1/decisions",
			format: OPENAI_DECISIONS,
			model: "gpt-6-luna",
			keyHeader: BEARER,
		},
		openrouter: {
			url: "https://openrouter.ai/api/alpha/decisions",
			format: OPENROUTER_DECISIONS,
			model: "openai/gpt-6-luna-decisions",
			keyHeader: BEARER,
		},
	},
};
