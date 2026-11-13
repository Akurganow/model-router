import type { Provider } from "../../core/provider.ts";
import {
	type KeySetting,
	keyLine,
	keyNotSaved,
	keyProvider,
	PROVIDER_NAMES,
} from "../../core/settings.ts";
import { findKey } from "./settings.ts";
import type { Context } from "./types.ts";

export const KEY_MAX_LENGTH = 512;
// A dialog that asks for text pads its options with these labels.
const PADDED_LABELS: readonly string[] = ["Yes", "No"];
const LINE_BREAK = /[\r\n\u2028\u2029]/;

export function keyFrom(answer: unknown): string | undefined {
	if (typeof answer !== "string" || LINE_BREAK.test(answer)) return undefined;
	const key = answer.trim();
	return key === "" ||
		key.length > KEY_MAX_LENGTH ||
		PADDED_LABELS.includes(key)
		? undefined
		: key;
}

export const keyQuestion = (provider: Provider, replaces: boolean): string =>
	`Enter your ${PROVIDER_NAMES[provider]} API key. It goes to the harness's credential store.${
		replaces ? " It replaces the key that is set now." : ""
	}`;

// The answer goes to omp's credential store and nowhere else. A failure says only that the key was not saved,
// because an error from the dialog or the store can hold the key.
export async function changeKey(
	ctx: Context,
	setting: KeySetting,
): Promise<string> {
	const provider = keyProvider(setting);
	if (!ctx.hasUI) return keyNotSaved(provider);
	try {
		const replaces = (await findKey(ctx, provider)) !== undefined;
		const key = keyFrom(await ctx.ui.input(keyQuestion(provider, replaces)));
		if (key === undefined) return keyNotSaved(provider);
		// Saved like omp's own login, so it outranks a stale variable and applies at once.
		await ctx.modelRegistry.authStorage.credentials.set(provider, {
			type: "api_key",
			key,
			source: "login",
		});
		return keyLine(provider, "saved, checking");
	} catch {
		return keyNotSaved(provider);
	}
}
