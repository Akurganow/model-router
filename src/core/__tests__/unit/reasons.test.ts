import assert from "node:assert/strict";
import { test } from "node:test";
import {
	agentDiscoveryFailed,
	agentUnknown,
	BAD_REPLY,
	CALLER_EFFORT,
	CANCELLED,
	CONFIG_EFFORT,
	FAILED,
	httpStatus,
	KEY_UNSET,
	NETWORK_ERROR,
	outsideCoreScope,
	SUBAGENT_MODEL_SET,
	setsOwnModel,
	TIMEOUT,
	UNREADABLE,
} from "../../output/reasons.ts";

// Every shared reason with the text the harnesses print: the constants, then the builders with one argument each.
const CONSTANTS: [string, string][] = [
	[CALLER_EFFORT, "caller effort"],
	[CONFIG_EFFORT, "config effort"],
	[SUBAGENT_MODEL_SET, "subagent model set"],
	[UNREADABLE, "settings unreadable"],
	[KEY_UNSET, "key unset"],
	[BAD_REPLY, "bad reply"],
	[TIMEOUT, "timeout"],
	[FAILED, "failed"],
	[CANCELLED, "cancelled"],
	[NETWORK_ERROR, "network error"],
];
type Builder = {
	build: (arg: never) => string;
	arg: string | number;
	text: string;
};
const BUILDERS: Builder[] = [
	{
		build: outsideCoreScope,
		arg: "scout",
		text: "scout is outside the core scope",
	},
	{
		build: agentDiscoveryFailed,
		arg: "scout",
		text: "scout agent discovery failed",
	},
	{ build: agentUnknown, arg: "scout", text: "scout agent unknown" },
	{ build: setsOwnModel, arg: "scout", text: "scout sets its own model" },
	{ build: httpStatus, arg: 503, text: "HTTP 503" },
];

test("the shared reasons keep the texts the harnesses print", () => {
	for (const [reason, text] of CONSTANTS) assert.equal(reason, text);
	for (const { build, arg, text } of BUILDERS)
		assert.equal((build as (arg: string | number) => string)(arg), text);
});
