# Eval fixtures

These files stand in for what a headless client prints. The selftest parses
them with the adapters of `scripts/evals.ts`. It needs no model and no secret.

- `claude.jsonl`: the stdout of `claude -p … --output-format stream-json
  --verbose`. The decision line is the `text` of the `system` event with
  subtype `ui_log`.
- `omp.jsonl`: the stdout of `omp -p --mode json`. The rewritten agent is the
  `agent` field in the `args.tasks` of the `task` start event.
- `omp.stderr.txt`: the stderr of the same run. omp prints the decision line
  there when it has no UI.

## Synthetic now

Every fixture here is synthetic. A person wrote it by hand from the event
shapes of each client and the line formats of the plugins, on 2026-10-21. No
run recorded it. The first line of each `.jsonl` file is a marker with
`"synthetic": true`, and `omp.stderr.txt` opens with a comment that says the
same. The selftest accepts synthetic fixtures while `SYNTHETIC_ALLOWED` in
`scripts/evals/selftest.ts` is `true`.

## Recorded next

After the first dispatched run of the evals workflow, one pull request
replaces these files with the recorded streams and sets `SYNTHETIC_ALLOWED`
to `false`. From then on the selftest rejects a synthetic marker.

A recorded fixture has a marker line with `"synthetic": false` and three
fields: `client_version`, `run` (the link of the workflow run) and `date`.
Capture scrubs exact secret values and swaps runner and home paths for
placeholders such as `<work>`. The selftest rejects key-shaped strings and
un-normalised paths in every fixture.
