const MODEL_CHARS_MAX = 40;

// The token counts of one reply.
export type Usage = {
	readonly input_tokens: number | null;
	readonly output_tokens: number | null;
};

// The model name reaches the routing line, so it keeps safe characters only.
export const cleanModel = (model: unknown): string =>
	typeof model === "string"
		? model.replace(/[^A-Za-z0-9._/:-]/g, "").slice(0, MODEL_CHARS_MAX)
		: "";
