import { isRecord } from "../../utils/guards.ts";

const MODEL_CHARS_MAX = 40;

// The token counts of one reply, as the System One API names them.
export type Usage = {
	readonly input_tokens: number | null;
	readonly output_tokens: number | null;
};

export const isCount = (v: unknown): v is number =>
	typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

// The model name reaches the routing line, so it keeps safe characters only.
export const cleanModel = (model: unknown): string =>
	typeof model === "string"
		? model.replace(/[^A-Za-z0-9._/-]/g, "").slice(0, MODEL_CHARS_MAX)
		: "";

export const readUsage = (usage: unknown): Usage | undefined =>
	isRecord(usage) ? (usage as unknown as Usage) : undefined;
