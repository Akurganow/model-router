import type { RoutingState } from "../../brief/brief.ts";
import type { Part, Probabilities } from "../../part.ts";
import type { Failure } from "../failure.ts";
import type { Usage } from "../reply.ts";

export type Answers = {
	// One pair per part.
	readonly answers: readonly (readonly [Part, Probabilities])[];
	readonly model: unknown;
	readonly usage: Usage | undefined;
};

// One scoring API's request body and reply. A format maps its API's token counts into Usage.
// `body` may throw when a question cannot be serialised; `read` never throws.
export type Format = {
	readonly body: (
		parts: readonly Part[],
		state: RoutingState,
		model: string,
	) => string;
	readonly read: (
		parts: readonly Part[],
		status: number,
		text: string,
	) => Answers | Failure;
};
