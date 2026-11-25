import { OPENAI_DECISIONS } from "#core/scoring/formats/openai-decisions.ts";
import { OPENROUTER_DECISIONS } from "#core/scoring/formats/openrouter-decisions.ts";
import {
	BEARER,
	type MakerModule,
	OPENROUTER_DECISIONS_URL,
} from "./shared.ts";

export const openai: MakerModule = {
	paths: {
		direct: {
			url: "https://api.openai.com/v1/decisions",
			format: OPENAI_DECISIONS,
			model: "gpt-6-luna",
			keyHeader: BEARER,
		},
		openrouter: {
			url: OPENROUTER_DECISIONS_URL,
			format: OPENROUTER_DECISIONS,
			model: "openai/gpt-6-luna-decisions",
			keyHeader: BEARER,
		},
	},
};
