# Codex probe: can a PreToolUse hook re-route `spawn_agent`?

You are verifying, by running Codex itself, whether a project-level PreToolUse hook can rewrite the `model` and `reasoning_effort` of a `spawn_agent` call before the subagent starts. The result decides how a plugin called model-router will work on Codex. Report facts you observed. Never guess. Mark anything you could not run as `not verified` and say why.

Facts from reading the Codex source (tag rust-v0.163.0) that this probe must confirm or refute:

- With multi-agent v1 the hook sees `tool_name` `spawn_agent`, and the alias `Agent` matches. With multi-agent v2 in the default namespace it sees `collaborationspawn_agent`, and the alias does not match.
- Each model in `codex debug models` names its `multi_agent_version`, so the parent model decides v1 or v2.
- A matcher made only of letters, digits, `_` and `|` is an exact match. Anything else is a regex search. The planned matcher is `^(?:spawn_agent|collaborationspawn_agent)$`.
- In v2 the `message` argument may reach the hook as an opaque, encrypted string instead of readable text.
- In v2 an absent `fork_turns` means a fork of the whole parent history.
- A hook may return a `systemMessage` next to `permissionDecision: "allow"`.
- Hooks inherit the Codex process environment, and `shell_environment_policy` filters only what agent shell commands see.

## Rules

- Work only in a new directory `~/model-router-probe`. Do not edit `~/.codex/config.toml`, `~/.codex/hooks.json` or any other user-level file. Part C asks the human before the one optional edit of `~/.codex/.env`.
- Do not read or print `~/.codex/auth.json` or any token, key or credential.
- Keep model use minimal. Every subagent task is the one line `Reply with the word OK.`
- The report must not contain account emails, organisation or workspace names, plan names, keys, tokens or internal hostnames. Write `~` instead of the home directory path.
- Use the official hooks documentation for the exact `hooks.json` schema: https://learn.chatgpt.com/docs/hooks (or https://developers.openai.com/codex/hooks). Record the schema you used in the report.
- The probe hook runs with Node. Do not install anything. If `node` is missing or older than 22.18, stop and report that.

## Part A: set up the probe

1. Record the environment:
   - the operating system and its version;
   - `codex --version`;
   - `node --version` and the absolute path from `command -v node` (on Windows, `where node`);
   - whether `bun` exists, with `bun --version`;
   - the rows of `codex features list` that mention `hooks`, `multi_agent` or `plugin`.
2. Run `codex debug models` and keep its JSON. For each model record `slug`, `visibility`, `supported_reasoning_levels`, `default_reasoning_level` and `multi_agent_version`.
3. Choose the parents:
   - `P1`: the cheapest-looking visible model with `multi_agent_version` v1, if one exists;
   - `P2`: the cheapest-looking visible model with `multi_agent_version` v2, if one exists.
4. Choose a visible target model `T` that differs from both parents, and an effort `E` that `T` supports and that differs from `T`'s default.
5. Create `~/model-router-probe/target.json` holding `{"model": "<T>", "reasoning_effort": "<E>"}`.
6. Create `~/model-router-probe/mode.txt` holding the single word `pass`.
7. Create `~/model-router-probe/probe.ts` with exactly this content:

```ts
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TASK = "Reply with the word OK.";
const dir = dirname(fileURLToPath(import.meta.url));
const started = Date.now();
const raw = readFileSync(0, "utf8");
const requested = readFileSync(join(dir, "mode.txt"), "utf8").trim();
const target = JSON.parse(readFileSync(join(dir, "target.json"), "utf8")) as {
	model: string;
	reasoning_effort: string;
};
let event: Record<string, unknown> = {};
try {
	event = JSON.parse(raw);
} catch {}
const toolName = String(event.tool_name ?? "");
const mode = toolName.endsWith("spawn_agent") ? requested : "pass";
const input = (event.tool_input ?? {}) as Record<string, unknown>;
const message = input.message;
const log = (entry: Record<string, unknown>) =>
	appendFileSync(
		join(dir, "hook-log.jsonl"),
		`${JSON.stringify({ at: new Date().toISOString(), mode, ...entry })}\n`,
	);
log({
	toolName,
	inputKeys: Object.keys(input),
	messageType: typeof message,
	messageLength: typeof message === "string" ? message.length : null,
	messageHead: typeof message === "string" ? message.slice(0, 24) : null,
	messageIsTask: typeof message === "string" && message.includes(TASK),
	forkTurns: input.fork_turns ?? null,
	forkContext: input.fork_context ?? null,
	agentType: input.agent_type ?? null,
	envelope: {
		model: event.model ?? null,
		agent_id: event.agent_id ?? null,
		agent_type: event.agent_type ?? null,
	},
	env: {
		probe: process.env.MODEL_ROUTER_PROBE ?? null,
		probeDotenv: process.env.MODEL_ROUTER_PROBE_DOTENV ?? null,
		pluginRoot: process.env.PLUGIN_ROOT ?? null,
		node: process.version,
		path: process.env.PATH ?? null,
		cwd: process.cwd(),
	},
});
const allow = (updatedInput: Record<string, unknown>) =>
	process.stdout.write(
		JSON.stringify({
			systemMessage: "model-router probe line",
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "allow",
				updatedInput,
			},
		}),
	);
switch (mode) {
	case "rewrite":
		allow({ ...input, ...target });
		break;
	case "bad-model":
		allow({ ...input, model: "no-such-model" });
		break;
	case "exit1":
		process.stderr.write("probe exit1\n");
		process.exit(1);
		break;
	case "garbage":
		process.stdout.write("not json");
		break;
	case "sleep":
		await new Promise((r) => setTimeout(r, 20000));
		allow({ ...input, ...target });
		break;
}
log({ done_ms: Date.now() - started });
```

8. Check the file runs: `echo '{}' | node ~/model-router-probe/probe.ts`. Record any warning or error, then delete `hook-log.jsonl`.
9. Create `~/model-router-probe/.codex/hooks.json` with one `PreToolUse` hook:
   - matcher `.*`, so the first run logs every tool name;
   - type `command`;
   - command `<absolute node path> <absolute path to probe.ts>`;
   - timeout 15 seconds, if the schema has a timeout field.
10. Run `git init` in `~/model-router-probe` if Codex needs a repository to load project hooks.

## Part B: automated runs

Run the whole table once with parent `P1` and once with parent `P2`. Skip a parent that does not exist and say so. Each run is one `codex exec` started in `~/model-router-probe` with the parent model.
- Find the flag in `codex exec --help` that runs project hooks without the interactive trust prompt, and use it.
- Find the flag that prints machine-readable events (for example `--json`), and keep each run's output as `run-<parent>-<run>.jsonl`.
- Set `MODEL_ROUTER_PROBE=1` in the environment of each run.

The default prompt of each run is:

```text
Use the spawn_agent tool exactly once to start one subagent whose task is "Reply with the word OK." Wait for it, then print its answer and nothing else.
```

If this Codex session's sandbox cannot start a nested `codex exec` (network or file access denied), do not work around the sandbox. Print the exact commands for the human to run in a terminal instead, wait for them to say they ran them, then continue from the logs.

Before each run, write the run's mode into `mode.txt`.

| Run | mode.txt and changes | What it answers |
|---|---|---|
| B1 | `pass`, matcher `.*` | Which `tool_name` does the spawn carry? Which keys does `tool_input` have? Is `message` readable (`messageIsTask` true) or opaque? Is `fork_turns` or `fork_context` set when the prompt does not ask for one? After this run, change the matcher to `^(?:spawn_agent|collaborationspawn_agent)$`. |
| B2 | `rewrite` | Does the subagent actually run on `T` at effort `E`? Did it still receive its task and answer OK? Where does `model-router probe line` appear: in the `--json` events, in the final output, or nowhere? |
| B3 | `bad-model` | Is a rewritten model validated? What error, and does the parent see it? |
| B4 | `exit1` | Does a failing hook block the spawn or let it run unchanged? |
| B5 | `garbage` | Does invalid hook output block the spawn or let it run unchanged? |
| B6 | `sleep` | Does a hook past its 15 s timeout block the spawn or let it run unchanged? How long did the spawn wait? |
| B7 | `rewrite`, prompt changed so the subagent itself spawns one more subagent with the same task | Does the hook fire for the nested spawn? Which `agent_id` and `agent_type` does the envelope carry? |
| B8 | `rewrite`, prompt asks for a fork of the full history (v1: `fork_context` true; v2: `fork_turns` "all") | Does Codex accept a different model on a fork? Which model does the forked child run on? |
| B9 | `rewrite`, prompt asks for no history (v2: `fork_turns` "none"; v1: `fork_context` false) | Same as B2 for an explicit non-fork. |
| B10 | `pass`, run with `-c 'shell_environment_policy.exclude=["MODEL_ROUTER_PROBE"]'` (check the key name in the config reference), prompt changed to first run the shell command `echo PROBE=${MODEL_ROUTER_PROBE:-unset}` and print its output, then spawn as usual | Does the hook still see `MODEL_ROUTER_PROBE` while the agent's shell prints `PROBE=unset`? |
| B11 | `pass`, matcher `Agent` | Does the documented `Agent` alias match? Run it only for a parent whose B1 showed `tool_name` `spawn_agent`. Restore the anchored matcher afterwards. |

### Find the model and effort each thread actually used

The hook log shows what the hook returned. It does not prove the subagent ran on `T`. For B2, B4, B5, B6, B7, B8 and B9, find the session files written during the run, usually under `~/.codex/sessions/`. Each thread has its own rollout file. From each file, extract only the fields that carry the thread's model and reasoning effort, for example `turn_context` entries. Do not copy message text. If the files store this differently, describe what you found and where.

## Part C: steps for the human

Codex cannot answer these alone. Show them to the human one at a time, wait for each answer, and record it word for word.

1. Set `mode.txt` to `rewrite`, then start interactive `codex` in `~/model-router-probe`. Does Codex ask you to trust the project hook, or does `/hooks` show it as untrusted? Trust it, then ask Codex to spawn one subagent with the task `Reply with the word OK.` Did the hook fire, judging by a new line in `hook-log.jsonl`? Did `model-router probe line` appear on screen, and how did it look?
2. Quit Codex. Add the line `// trust probe` at the end of `probe.ts`, leaving `hooks.json` unchanged. Start `codex` again. Does it ask you to trust the hook again?
3. Quit Codex. Change only the timeout value in `hooks.json`. Start `codex` again. Does it ask you to trust the hook again?
4. Only if you agree to a temporary edit of `~/.codex/.env`: add the line `MODEL_ROUTER_PROBE_DOTENV=1`, start `codex` again, and spawn one subagent as in step 1. Did the hook see the variable (`probeDotenv` in `hook-log.jsonl`)? Remove the line afterwards.
5. Only if you use the Codex desktop app: open `~/model-router-probe` in the app and spawn one subagent as in step 1. Did the hook fire, and did the probe line show? Repeat with the command's absolute node path replaced by plain `node`. Does it still fire? Restore the absolute path afterwards. If you did step 4, repeat it in the app as well.

## Report format

Reply with exactly this Markdown, filled in. Truncate any message text to 80 characters. Keep log excerpts to the fields that matter.

```markdown
# Codex probe report

## Environment
- OS:
- codex --version:
- node --version / path:
- bun:
- features (hooks, multi_agent, multi_agent_v2, plugin):
- hooks.json schema used (paste the file):

## Models
| slug | visibility | supported_reasoning_levels | default | multi_agent_version |
|---|---|---|---|---|

P1 = … (v1) · P2 = … (v2) · Target T = … · Effort E = …

## Node check
<output of `echo '{}' | node probe.ts`, or "no output">

## Runs
| Run | Parent | Hook fired? | Hook output accepted? | Subagent ran? | Model / effort actually used (from session files) | Parent saw an error? | Evidence |
|---|---|---|---|---|---|---|---|
| B1 | P1 | | | | | | |
| B1 | P2 | | | | | | |
| … | | | | | | | |
| B11 | P1 | | | | | | |

## tool_input shape (per parent)
- tool_name seen for the spawn:
- inputKeys:
- `message` readable (messageIsTask) or opaque (messageHead, messageLength):
- fork_turns / fork_context when the prompt asks for neither:
<the B1 log line, message text truncated>

## Decision line
- Where `model-router probe line` appeared in `codex exec` output (B2):
- How it looked in the interactive CLI (Part C step 1):
- In the desktop app (Part C step 5):

## Forks
- B8 (fork with a rewritten model), per parent:
- B9 (explicit non-fork), per parent:

## Hook environment
- MODEL_ROUTER_PROBE seen by the hook:
- B10: hook saw the variable / agent shell printed:
- MODEL_ROUTER_PROBE_DOTENV seen (Part C step 4, CLI / app):
- PLUGIN_ROOT:
- PATH contains node's directory (yes/no):
- cwd:

## Timing
- Hook duration in B2 (done_ms):
- Spawn delay in B6:

## Human steps (Part C)
1.
2.
3.
4.
5.

## Surprises
-

## Not verified
- <item> — <why>
```
