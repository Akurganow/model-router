import { register } from "./claude.ts";

export type Hook = ($: unknown, e: unknown, next: unknown) => Promise<unknown>;

export const AGENT_CALL = "agent.spawn";
export const SPAWN = {
	tool_use_id: "toolu_1",
	prompt: "p",
	description: "d",
	subagentType: "general-purpose",
	fork: false,
};
export const CLOCK = {
	after: () => ({ cancel() {} }),
	sleep: () => new Promise(() => {}),
};

/**
 * The continuation under a hook. Its origin names the plugin that started the call, and "engine" is the Agent tool itself.
 */
export const nextHook = (plugin = "engine") =>
	Object.assign(async () => ({}), {
		signal: new AbortController().signal,
		origin: { plugin },
	});

/**
 * Registers the mod against a hook collector and returns its hooks by event name.
 * A hook with a matcher is keyed by the event, a space and the matcher as JSON.
 */
export function registered(
	options: Record<string, unknown> = {},
): Record<string, Hook> {
	const hooks: Record<string, Hook> = {};
	const on = (event: string, ...rest: unknown[]) => {
		const matcher = rest.length > 1 ? ` ${JSON.stringify(rest[0])}` : "";
		hooks[`${event}${matcher}`] = rest.at(-1) as Hook;
		return { catch: () => undefined };
	};
	register(on as never, options);
	return hooks;
}

const SCORE = (p: number[]) => ({ type: "score", probabilities: { ...p } });
export const ANSWER = JSON.stringify({
	model: "jev-1.14.0",
	answers: { tier: SCORE([0.9, 0.1, 0]), work: SCORE([0.2, 0.6, 0.2]) },
});

export type Offer = { agent: string; source: string; description?: string };
export const BUILT_IN_DEFAULT: Offer = {
	agent: "general-purpose",
	source: "built-in",
};

/**
 * Registers the mod, makes the offers, then spawns `subagentType` as the engine does.
 * Returns the env names read, the requests Jev received and the role each carried.
 */
export async function routedCall(
	options: Record<string, unknown>,
	env: Record<string, string>,
	offers: readonly Offer[] = [BUILT_IN_DEFAULT],
	subagentType = "general-purpose",
	description = SPAWN.description,
) {
	const reads: string[] = [];
	const requests: { url: string; model: unknown }[] = [];
	const roles: unknown[] = [];
	const descriptions: unknown[] = [];
	const $ = {
		clock: CLOCK,
		env: {
			get: async (name: string) => {
				reads.push(name);
				return env[name];
			},
		},
		http: {
			fetch: async (url: string, init: { body: string }) => {
				const body = JSON.parse(init.body);
				requests.push({ url, model: body.model });
				roles.push(body.state.role);
				descriptions.push(body.state.description);
				return { status: 200, ok: true, headers: {}, text: ANSWER };
			},
		},
		tool: { check: async () => ({ decision: "allow" }) },
		ui: { log: async () => undefined },
	};
	const next = nextHook();
	const hooks = registered(options);
	for (const offer of offers) await hooks["agent.offer"]?.($, offer, next);
	await hooks[AGENT_CALL]?.($, { ...SPAWN, subagentType, description }, next);
	return { reads, requests, roles, descriptions };
}
