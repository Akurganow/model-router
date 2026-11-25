import { GEMINI_DECISIONS } from "#core/scoring/formats/gemini-decisions.ts";
import { OPENROUTER_DECISIONS } from "#core/scoring/formats/openrouter-decisions.ts";
import {
	BEARER,
	type KeyHeader,
	type MakerModule,
	OPENROUTER_DECISIONS_URL,
} from "./shared.ts";

const GOOGLE_KEY: KeyHeader = { name: "x-goog-api-key", prefix: "" };

export const google: MakerModule = {
	paths: {
		direct: {
			url: "https://generativelanguage.googleapis.com/v1beta/decisions",
			format: GEMINI_DECISIONS,
			model: "gemini-decision-1",
			keyHeader: GOOGLE_KEY,
		},
		openrouter: {
			url: OPENROUTER_DECISIONS_URL,
			format: OPENROUTER_DECISIONS,
			model: "google/gemini-decision-1",
			keyHeader: BEARER,
		},
	},
};
