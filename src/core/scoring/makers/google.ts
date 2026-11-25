import { GEMINI_DECISIONS } from "#core/scoring/formats/gemini-decisions.ts";
import { OPENROUTER_DECISIONS } from "#core/scoring/formats/openrouter-decisions.ts";
import {
	BEARER,
	type KeyHeader,
	type MakerModule,
} from "#core/scoring/maker-module.ts";

const GOOGLE_KEY: KeyHeader = { name: "x-goog-api-key", prefix: "" };

export const google: MakerModule = {
	vendor: "google",
	openrouterRoute: "decisions",
	openrouterNames: { "gemini-decision-1": "google/gemini-decision-1" },
	paths: {
		direct: {
			url: "https://generativelanguage.googleapis.com/v1beta/decisions",
			format: GEMINI_DECISIONS,
			model: "gemini-decision-1",
			keyHeader: GOOGLE_KEY,
		},
		openrouter: {
			url: "https://openrouter.ai/api/alpha/decisions",
			format: OPENROUTER_DECISIONS,
			model: "google/gemini-decision-1",
			keyHeader: BEARER,
		},
	},
};
