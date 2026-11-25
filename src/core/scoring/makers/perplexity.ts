import { OPENROUTER_DECISIONS } from "#core/scoring/formats/openrouter-decisions.ts";
import { SYSTEM_ONE } from "#core/scoring/formats/system-one.ts";
import { BEARER, type MakerModule } from "#core/scoring/maker-module.ts";

export const perplexity: MakerModule = {
	vendor: "perplexity",
	openrouterRoute: "decisions",
	// The aliases and the paid v1.3 slugs have no OpenRouter endpoint, so the aliases and the v1.3 ids map to the `:free` slugs.
	openrouterNames: {
		"pplx-decider-latest": "perplexity/pplx-decider-v1.3:free",
		"pplx-decider-v1.3": "perplexity/pplx-decider-v1.3:free",
		"pplx-decider-flash-latest": "perplexity/pplx-decider-flash-v1.3:free",
		"pplx-decider-flash-v1.3": "perplexity/pplx-decider-flash-v1.3:free",
		"pplx-decider-v1.2": "perplexity/pplx-decider-v1.2",
		"pplx-decider-flash-v1.2": "perplexity/pplx-decider-flash-v1.2",
	},
	paths: {
		direct: {
			url: "https://api.perplexity.ai/v1/decisions",
			format: SYSTEM_ONE,
			model: "pplx-decider-latest",
			keyHeader: BEARER,
		},
		openrouter: {
			url: "https://openrouter.ai/api/alpha/decisions",
			format: OPENROUTER_DECISIONS,
			model: "perplexity/pplx-decider-v1.3:free",
			keyHeader: BEARER,
		},
	},
};
