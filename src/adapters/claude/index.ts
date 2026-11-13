import {
	configCall,
	configCommand,
	registerConfigTool,
	resetConfig,
} from "./config.ts";
import { type On, type Options, passOn, passStep } from "./host.ts";
import {
	forgetWaited,
	noteCallerEffort,
	noteOffer,
	resetRouting,
	routeSpawn,
	stepEffort,
} from "./router.ts";

export function register(on: On, options: Options): void {
	resetRouting();
	on("agent.offer", (_, e, next) => {
		noteOffer(e.agent, e.source, e.description);
		return next(e);
	}).catch(passOn);
	on("tool.call", { tool: "Agent" }, noteCallerEffort).catch(passOn);
	on("agent.spawn", ($, e, next) => routeSpawn($, e, next, options)).catch(
		passOn,
	);
	on("turn.step", stepEffort).catch(passStep);
	on("turn.complete", (_, e, next) => {
		if (e.agentId !== undefined) forgetWaited(e.agentId);
		return next(e);
	}).catch(passOn);
	resetConfig();
	on("session.start", registerConfigTool).catch(passOn);
	// The surface check reads the matchers, so the tool and command names stay literals here.
	on("tool.call", { tool: "mcp__model-router__config" }, ($, e) =>
		configCall($, e, options),
	);
	on("command.run", { command: "model-router:provider" }, ($, e) =>
		configCommand($, e, "provider", options),
	);
	on("command.run", { command: "model-router:scope" }, ($, e) =>
		configCommand($, e, "scope", options),
	);
}
