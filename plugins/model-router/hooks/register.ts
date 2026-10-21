import type { Register } from "claude-code";
import { DEADLINE_MS, decisionSuffix, TransportError } from "./core.ts";
import { type Decision, route, type Skipped } from "./router.ts";

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
	const { api_key: keyOption, model: modelOption } = options;
	const jev = modelOption === "jev-preview" ? "jev-preview" : "jev-latest";
	const key = (v: unknown) =>
		typeof v === "string" && v !== "" ? v : undefined;

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
		// The key goes only to TypeSafe, which issued it. The sensitive option comes first. The desktop app
		// reads it back empty after a restart, so the variable stands in when it is empty.
		const apiKey = key(keyOption) ?? key(await $.env.get("TYPESAFE_API_KEY"));

		// The deadline covers the whole call, retry included. Stopping aborts the retry wait, so no request follows a skip.
		const stop = new AbortController();
		const signal = AbortSignal.any([stop.signal, next.signal]);
		let raw = "";

		const post = async (body: string): Promise<string> => {
			if (!apiKey) throw new Error("api_key unset");
			const pieces = Math.ceil(body.length / DEBUG_PIECE_CHARS);
			for (let i = 0; i < pieces; i++)
				$.ui.log(
					`request ${i + 1}/${pieces} ${body.slice(i * DEBUG_PIECE_CHARS, (i + 1) * DEBUG_PIECE_CHARS)}`,
					{ to: "debug" },
				);
			const res = await $.http
				.fetch("https://api.typesafe.ai/v1/systemone", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body,
				})
				.catch(() => {
					throw new TransportError("network");
				});
			if (!res.ok) throw new TransportError("http", { status: res.status });
			raw = res.text;
			return res.text;
		};

		const deadline = $.clock
			.sleep(DEADLINE_MS, { signal })
			.then(
				(): Skipped => ({ skipped: new TransportError("timeout").message }),
			);
		let decision: Decision | Skipped;
		try {
			decision = await Promise.race([
				route(
					{
						role: call.subagent_type ?? "general-purpose",
						description: call.description,
						prompt: call.prompt,
						model: jev,
					},
					post,
					{ sleep: (ms) => $.clock.sleep(ms, { signal }) },
				),
				deadline,
			]);
		} catch (err) {
			decision = { skipped: err instanceof Error ? err.message : String(err) };
		} finally {
			stop.abort();
		}
		if ("skipped" in decision) {
			$.ui.log(`skipped, ${decision.skipped}`);
			return next(e);
		}
		const { level, model, workIndex, effort, probabilities } = decision;
		const p = `${probabilities.tier[level].toFixed(2)}/${probabilities.work[workIndex].toFixed(2)}`;
		const pick = `L${level} ${model} · ${keep ? "caller effort" : effort} · p=${p}${decisionSuffix(raw)}`;
		$.ui.log(pick);
		const r = await next(keep ? { ...e, model } : { ...e, model, effort });
		if ("deny" in r && r.deny !== undefined) $.ui.log("denied");
		return r;
	}).catch((_, e, next) => next(e));
};
