# Why the router chooses what it chooses

This page explains the router's three tiers, its tie margin, its effort ladder
and its escalation rule. Each choice rests on an Anthropic source, named by
title in italics and listed with its address under [Sources](#sources).

See the effort ladder in [README](../README.md#effort).

## The axis

Anthropic sorts work by how clear the brief is and how much judgment it needs.
The router asks Jev the same question about each subagent's task.
*Introducing Claude Sonnet 5.5* puts Sonnet on well-scoped everyday tasks and
bug fixes, and finds Opus clearly stronger at complex, open-ended work.
*Building with Claude Sonnet 5.5* says Sonnet fits best when the task has a
clear spec and a way to check the result. *Introducing Claude Haiku 5.5* suits
Haiku to narrowly scoped tasks such as compaction, summarization and subagent
work.

## The three tiers

Jev scores the task against the three tier texts in `TIERS` in
`hooks/router.ts`:

<table>
<tr><th>Level</th><th>Model</th><th>Tier text</th></tr>
<tr><td>0</td><td><code>haiku</code></td><td>
Lookup or transcription: the brief names the exact files to read or string to
find, or holds the exact code, config or prose to write. It gives the
commands to run and the check that proves the work done. No choice is left.
</td></tr>
<tr><td>1</td><td><code>sonnet</code></td><td>
Bounded judgment: the brief fixes the goal and a way to check the result.
Check work against stated requirements, fix named defects, implement from a
given plan or spec, or answer a question from a few named files.
</td></tr>
<tr><td>2</td><td><code>opus</code></td><td>
Open judgment: the brief leaves the approach open. Decide a design, create
content with no plan or spec to follow, review a multi-file change for risks
no checklist names, or debug with an unclear cause.
</td></tr>
</table>

Tier 0 rests on *Manage costs effectively*, which tells Claude Code users to
set `model: haiku` for simple subagent tasks. *Prompting Claude Haiku 5.5*
adds that Haiku can report a code change as done without a check that
exercises it. So the tier-0 text asks the brief for the check that proves the
work done.

Tier 1 rests on the `opusplan` alias in *Model configuration*. That alias plans
with Opus and switches to Sonnet for code generation and implementation. The
workload table in *Building with Claude Sonnet 5.5* gives Sonnet bug fixes and
checks against requirements. Tier 1 therefore holds named defects, stated
requirements and implementation from a given plan.

Tier 2 rests on *Introducing Claude Sonnet 5.5*, which keeps complex,
open-ended work that needs sustained judgment on Opus. *Choosing the right
model* starts most workloads on Opus 5.5, and *Models overview* starts there
when unsure. Tier 2 takes the tasks whose brief leaves the approach open.

## The tie margin

`TIE_MARGIN = 0.1`. Jev returns a probability for each tier. When a higher tier
comes within 0.1 of the most probable one, the router picks the highest such
tier. A near tie therefore goes up, to the larger model. This matches
*Choosing the right model*, where most workloads start with Opus 5.5. A tier
too high costs more tokens. A tier too low can fail and pay for a second
attempt on top.

## The work question and the arch

Jev answers a second question in the same request: how much work the task
takes once the judgment is settled. It scores the three `WORK_LEVELS` texts:

- **0.** A short task: one or two mechanical steps in one place, nothing to
  diagnose, and the given command is the whole check.
- **1.** An ordinary task: reading or diagnosing code, a few steps or files,
  and a result to verify.
- **2.** A long or delicate task: many steps or files, hidden edge cases, or a
  wrong result that would look right.

`WORK_PRIOR = [0.5, 1, 0.5]` weights the three answers. An end wins only when
Jev gives it more than twice the middle's probability. When both ends pass,
the more probable end wins, and equal ends go to index 2.

The middle is the resting point because index 1 maps to `medium` on Sonnet and
Opus. *Model configuration* gives `medium` as Claude Code's default effort for
Opus 5.5, Sonnet 5.5 and Haiku 5.5. The router leaves that default only on
clear evidence.

Haiku's row starts at `medium` and ends at `xhigh`. *Prompting Claude Haiku
5.5* warns that at `low`, in long agent prompts, Haiku is more likely to skip
a check or stop early. *Pricing* puts Haiku, Sonnet, Opus and Fable at
1 : 20 : 40 : 100 per token. Extra thinking on Haiku costs little next to a
Sonnet attempt.

`max` is never set. Sonnet and Opus stop at `high`, because *Optimizing for
cost and intelligence* measured Opus 5.5 at `xhigh` only 1.4 points above
`high`. That step cost 2.5 times as much.

An effort named in the Agent call is kept, with or without a model. The
`tool.call` hook sees that the call names one, and the router leaves that
subagent's effort alone. The subagent's first request already carries the
router's effort: the spawn hook learns the agent id before the first request
is sent. A probe on 2026-10-10 logged the agent id from the spawn hook one line
before the subagent's first request.

## Escalation

`SKILL.md` gives the rule:

> Escalate when a subagent reports BLOCKED, fails the check its brief names,
> or two fix rounds in a row make no progress.
>
> - If the report shows skipped steps (a file not read, tests not run),
>   re-dispatch on the same tier at higher effort.
> - Otherwise re-dispatch one tier up with a new brief that states what
>   failed.
> - Level 0 goes one tier up on its first failure, skipped steps included.
> - Above opus, re-dispatch opus at `high`, then at `xhigh`. Use fable only
>   when the user opted in. Otherwise stop and report.

Each part has a source:

- *Claude Code effort level and model selection* separates two failures.
  Claude either did not try hard enough or did not know enough. Skipped steps
  call for more effort, and a wrong approach calls for a larger model.
- *Best practices for Claude Code* says to clear the context after two failed
  corrections and write a better prompt. A re-dispatch starts a fresh context,
  and its new brief states what failed.
- *Orchestrate subagents at scale with dynamic workflows* stops its example
  fix loop when two rounds in a row make no progress.
- *Optimizing for cost and intelligence* measured Haiku 5.5 and Sonnet 5.5
  executors. They called an Opus 5.5 advisor on none of 198 GPQA questions. A
  subagent seldom reports that it is stuck, so a failed check counts as well.
- A tier-0 failure means the brief left a choice, and that is tier-1 work. So
  level 0 does not retry on its own tier.
- *Models overview* moves to Fable 5.1 only when Opus 5.5 at higher effort
  still falls short.
- *Model configuration* says Claude Code bills Fable requests to usage credits
  without asking in `-p` mode and in the SDK. An automatic step to Fable could
  spend money unseen, so Fable needs the user's opt-in.

## Known limits

- Provider aliases point at older models. On Amazon Bedrock, Google Cloud's
  Agent Platform and Microsoft Foundry, *Model configuration* maps `sonnet` to
  Sonnet 4.5 and `haiku` to Haiku 4.5. Foundry maps `opus` to Opus 4.6 as
  well. On these providers the tiers save less and run an older generation.
- *Pricing* bills a Haiku 5.5 request at $0.50 / $2.50 per million tokens once
  its prompt passes 100,000 tokens. That is five times the base rate. A tier-0
  subagent that reads many files can cross that line.
- On tier-1 tasks, Sonnet 5.5 at `medium` might cost more per solved task than
  Opus 5.5 at `low`. *Optimizing for cost and intelligence* measured Opus 5.5
  at `low` solving 87.4% of a SWE-bench Pro subset for $0.12 per solved task.
  Sonnet 5 at its default solved 77.4% for $0.84. Sonnet 5.5 is not in that
  table, and tier-1 tasks are smaller than SWE-bench Pro. The question stays
  open.

## Sources

Titles are the live page titles on 2026-10-10, without the site name. Undated
pages were read on 2026-10-10.

### Claude Platform documentation

- **Models overview** —
  <https://platform.claude.com/docs/en/about-claude/models/overview> —
  undated, read 2026-10-10. The 5.x lineup and its shared specs. The advice
  to start with Opus 5.5 and move to Fable 5.1 when Opus falls short.
- **Choosing the right model** —
  <https://platform.claude.com/docs/en/about-claude/models/choosing-a-model>
  — undated, read 2026-10-10. Two selection strategies, the task-to-model
  matrix, effort as the first lever and the API's default efforts.
- **Optimizing for cost and intelligence** —
  <https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence>
  — undated, read 2026-10-10. Cost per solved task on SWE-bench Pro, the
  Opus 5.5 effort curve and re-running failures. The advisor and
  orchestrator measurements, and the evaluation method.
- **Pricing** —
  <https://platform.claude.com/docs/en/about-claude/pricing> —
  undated, read 2026-10-10. Prices of all models, the Haiku 5.5 rate above
  100k tokens, cache prices, and the prices of Haiku 4.5 and Sonnet 4.5.
- **Effort** —
  <https://platform.claude.com/docs/en/build-with-claude/effort> —
  undated, read 2026-10-10. `low` for simple subagent tasks, the starting
  effort of Sonnet 5.5 for agentic coding, and the risks of `low` on Haiku.
- **What's new in Claude Haiku 5.5** —
  <https://platform.claude.com/docs/en/models/haiku-5-5/whats-new-haiku-5-5>
  — undated, read 2026-10-10. What Haiku 5.5 is for: classification,
  routing, extraction and subagent tasks.
- **Prompting Claude Haiku 5.5** —
  <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5>
  — undated, read 2026-10-10. Haiku's two failures, "done" without a check
  and early stops, and the prompt text against them. The cost of moving
  from `low` to `medium`.
- **Prompting Claude Opus 5** —
  <https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5>
  — undated, read 2026-10-10. The cost of delegating small tasks, and the
  review accuracy of Opus at reduced effort.
- **Advisor tool** —
  <https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool>
  — undated, read 2026-10-10. An executor rarely calls the advisor, most of
  all on coding tasks.
- **Multiagent orchestration** —
  <https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration>
  — undated, read 2026-10-10. A sample configuration with a lead Opus 5.5
  and a reviewer, a test writer and a researcher on Haiku 5.5.

### Claude Code documentation

- **Model configuration** —
  <https://code.claude.com/docs/en/model-config> —
  undated, read 2026-10-10. Aliases and what they resolve to per provider,
  and Opus 5.5 as the default since v2.1.280. The "Work with Fable" section
  and Fable billing, `opusplan`, and effort defaults and calibration.
- **Create custom subagents** —
  <https://code.claude.com/docs/en/sub-agents> —
  undated, read 2026-10-10. The order that picks a subagent's model, and the
  precedence of the `agent.spawn` hook. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`,
  `availableModels`, the built-in agents' models, and the `effort` field
  and parameter.
- **Manage costs effectively** —
  <https://code.claude.com/docs/en/costs> —
  undated, read 2026-10-10. Sonnet for most coding, Opus for architecture,
  and `model: haiku` for simple subagents.
- **Best practices for Claude Code** —
  <https://code.claude.com/docs/en/best-practices> —
  undated, read 2026-10-10. The old address
  <https://www.anthropic.com/engineering/claude-code-best-practices>
  redirects here. The `security-reviewer` example on Opus, and the limit of
  two failed corrections.
- **Escalate hard decisions with the advisor tool** —
  <https://code.claude.com/docs/en/advisor> —
  undated, read 2026-10-10. The advisor for a repeating error, and
  subagents that inherit the advisor.
- **Orchestrate subagents at scale with dynamic workflows** —
  <https://code.claude.com/docs/en/workflows> —
  undated, read 2026-10-10. A fix loop that stops after two rounds in a row
  without progress.
- **Claude Code changelog** —
  <https://code.claude.com/docs/en/changelog> —
  entries from 2025-10-15 to 2026-07-01 used. Explore on Haiku from v2.0.17
  and on the session's model from v2.1.198. Claude picks a subagent's model
  from v2.0.28, and the `Agent(model:opus)` rule arrived in v2.1.178.
- **Mods reference** —
  <https://code.claude.com/docs/en/plugins/mods/reference> —
  undated, read 2026-10-10. The `agent.spawn` hook and how it sets a model.

### Model launch posts

- **Introducing Claude Haiku 5.5** —
  <https://www.anthropic.com/claude-haiku-5-5> —
  2026-10-07. Haiku as a subagent under Opus and Sonnet, and narrow tasks.
  Terminal-Bench 4.0 at 39.2% against 70.6% for Sonnet 5.5.
- **Introducing Claude Sonnet 5.5** —
  <https://www.anthropic.com/claude-sonnet-5-5> —
  2026-09-28. The line between Sonnet and Opus: well-scoped tasks against
  open-ended ones. Sonnet 5.5 benchmarks against Opus 5.5, and cost per task
  against Sonnet 5.
- **Introducing Claude Opus 5.5** —
  <https://www.anthropic.com/claude-opus-5-5> —
  2026-09-22. Opus 5.5 matches Fable 5.1 on most tasks and costs 40% less
  than Opus 5. Its strength in migrations and audits.
- **Introducing Claude Fable 5.1 and Claude Mythos 5.1** —
  <https://www.anthropic.com/claude-fable-and-mythos-5-1> —
  September 2026, the model shipped 2026-09-01. Where Fable 5.1 fits, and a
  typical workload 25% cheaper than on Fable 5.

### Articles and blogs

- **Claude Code effort level and model selection** (Lydia Hallie) —
  <https://claude.com/resources/articles/claude-model-and-effort-level-in-claude-code>
  — 2026-07-07. The address
  <https://claude.com/blog/claude-model-and-effort-level-in-claude-code>
  redirects here. The smaller-or-larger model heuristic, the
  knowledge-or-effort diagnosis and the rule for stepping back down.
- **Building with Claude Sonnet 5.5** (Addy Osmani) —
  <https://claude.dev/blog/building-with-claude-sonnet-5-5/> —
  2026-09-28. The Sonnet and Opus workload table, and the test of a clear
  spec with a way to check. Opus as the default of Claude Code.
- **Using Claude Code: Spending your effort** —
  <https://claude.dev/blog/spending-your-effort/> —
  undated, read 2026-10-10. Terminal-Bench 3.0 data: more effort cuts missed
  edge cases but does not fix a wrong approach.
- **The advisor strategy: Give Sonnet an intelligence boost with Opus** —
  <https://claude.com/blog/the-advisor-strategy> —
  2026-04-09. Sonnet and Haiku with an Opus advisor, measured on 4.x models.
- **When to use multi-agent systems (and when not to)** —
  <https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them>
  — 2026-01-23. Verifier subagents that declare success after one or two
  tests.
- **How we built our multi-agent research system** —
  <https://www.anthropic.com/engineering/multi-agent-research-system> —
  2025-06-13. A lead Opus 4 with Sonnet 4 subagents and explicit scaling
  rules in the prompts. Evaluation started with about 20 queries.
- **Building Effective AI Agents** —
  <https://www.anthropic.com/engineering/building-effective-agents> —
  2024-12-19. The live text names Haiku 4.5 and Sonnet 4.5, released after
  that date. Routing easy queries to a small model works only when the
  classification is accurate.

### Learning

- **Choosing the right Claude model: Haiku, Sonnet, Opus, or Fable**
  (Claude Academy) —
  <https://academy.claude.com/tutorials/choosing-the-right-claude-model> —
  undated, read 2026-10-10. The Haiku, Sonnet, Opus, Fable ladder, and the
  next model when the one before it fails.
