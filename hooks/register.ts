import type { Register } from "claude-code";
import { route } from "./router.ts";

const HTTP_TIMEOUT_MS = 8000;
// The debug log keeps 10000 characters of a line, and a body can carry 12000 of task text.
const DEBUG_PIECE_CHARS = 9000;

type AgentCall = {
	prompt: string;
	description: string;
	subagent_type?: string;
	model?: string;
	effort?: string;
	name?: string;
};

export const register: Register = (on, options) => {
	const { mode: modeOption, api_key: keyOption } = options;
	const mode = modeOption === "auto" ? "auto" : "suggest";
	// The key is the plugin's sensitive userConfig option and goes only to TypeSafe, which issued it.
	const apiKey =
		typeof keyOption === "string" && keyOption !== "" ? keyOption : undefined;

	on("tool.call", { tool: "Agent" }, async ($, e, next) => {
		const call = e as typeof e & AgentCall;
		// A fork inherits its parent's model, a named agent is a teammate, and a caller-named model keeps its effort too.
		if (
			call.subagent_type === "fork" ||
			call.name !== undefined ||
			call.model !== undefined
		)
			return next(e);
		// A call the user's rules deny as Claude made it never leaves the machine. The check opens no dialog.
		const {
			tool: _tool,
			tool_use_id: _id,
			agentId: _agentId,
			requestMeta: _meta,
			...input
		} = e as Record<string, unknown>;
		const check = await $.tool.check({ tool: "Agent", input });
		if (check.decision === "deny") return next(e);
		const keep = call.effort !== undefined;

		const post = async (body: string): Promise<string> => {
			if (!apiKey) throw new Error("api_key unset");
			const pieces = Math.ceil(body.length / DEBUG_PIECE_CHARS);
			for (let i = 0; i < pieces; i++)
				$.ui.log(
					`request ${i + 1}/${pieces} ${body.slice(i * DEBUG_PIECE_CHARS, (i + 1) * DEBUG_PIECE_CHARS)}`,
					{ to: "debug" },
				);
			const stop = new AbortController();
			const timeout = $.clock
				.sleep(HTTP_TIMEOUT_MS, {
					signal: AbortSignal.any([stop.signal, next.signal]),
				})
				.then(() => {
					throw new Error(`no answer in ${HTTP_TIMEOUT_MS} ms`);
				});
			try {
				const res = await Promise.race([
					$.http.fetch("https://api.typesafe.ai/v1/systemone", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${apiKey}`,
							"Content-Type": "application/json",
						},
						body,
					}),
					timeout,
				]);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.text;
			} finally {
				stop.abort();
			}
		};

		const decision = await route(
			{
				role: call.subagent_type ?? "general-purpose",
				description: call.description,
				prompt: call.prompt,
			},
			post,
		);
		if ("skipped" in decision) {
			$.ui.log(`skipped, ${decision.skipped}`);
			return next(e);
		}
		const { level, model, workIndex, effort, probabilities } = decision;
		const p = `${probabilities.tier[level].toFixed(2)}/${probabilities.work[workIndex].toFixed(2)}`;
		const pick = `L${level} ${model} · ${keep ? "caller effort" : effort} · p=${p}`;
		if (mode === "suggest") {
			$.ui.log(`would pick ${pick}`);
			return next(e);
		}
		$.ui.log(pick);
		const r = await next(keep ? { ...e, model } : { ...e, model, effort });
		if ("deny" in r && r.deny !== undefined) $.ui.log("denied");
		return r;
	}).catch((_, e, next) => next(e));
};
