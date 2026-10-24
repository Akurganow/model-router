import { findKey } from "./omp-gates.ts";
import type { Context } from "./omp-types.ts";
import {
	type KeySetting,
	keyFrom,
	keyLine,
	keyNotSaved,
	keyProvider,
	keyQuestion,
} from "./settings.ts";

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
