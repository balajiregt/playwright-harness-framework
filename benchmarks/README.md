# Controlled agent trials

This is benchmark instrumentation, not evidence that an AI agent is faster or better. No live agent baseline/framework comparison has been completed. The CRM and Java oracles run against synthetic fixtures.

## Run a matched experiment

1. Select an immutable task from `benchmarks/tasks.json`. Freeze the target source snapshot, external oracle and exact prompt. Use SHA256 hashes of the prompt and target snapshot in the metadata; a Git SHA1 is not a SHA256 snapshot hash.
2. Use separate clean branches/worktrees for baseline and framework arms. Baseline gets the same requirements and target; framework additionally gets its documented context/helpers. Keep model/version, permissions, machine, oracle and time budget identical. Alternate arm order across at least three repeat numbers. Never change the gold/oracle to accommodate an agent answer.
3. Record actual UTC start/finish timestamps including model/tool execution. Copy `trial-template.json`, supply a unique trial ID, task, arm, repeat, model/version and hashes. Use `live-agent` for real model work and `scripted-validation` only for collector smoke checks. Do not relabel browser runtime as agent completion time.
4. Execute the independent required tests with retries disabled and export a JSON report. Capture provider token usage and its evidence source when available. A dated public price converts actual tokens to an **estimate**, not invoice cost. Leave usage/pricing null otherwise.
5. Review the diff: record incorrect changes and human correction time with a reviewer evidence reference, or keep both null. Count unrelated regressions, invalid assertions and unwanted application edits separately in that review. Passing the required oracle is operational completion, not exhaustive correctness.
6. Run `npm run benchmark:collect -- METADATA.json REPORT.json`, then `npm run benchmark:summary`. Trial writes reject overwrites. Summaries reject duplicate arm/repeat identities and separate incompatible model, target and evidence kinds. Retain failed/skipped/missing required checks as incomplete work.

Results, traces, trial records and reviewer notes stay ignored under `benchmark-results/`. Publish only reviewed aggregate evidence, with denominator, date, environment, source revision, report hash and limitations. Prompt/target hashes do not prove a fair experiment by themselves; retain the underlying controlled records privately. Human time and unknown costs must never become zero.

## Existing CRM/SaaS application

`npm run benchmark:oracle` starts its own loopback demo on port 4273 and runs four independent checks: viewer export denied in UI **and direct HTTP**, exact manager export data, unauthenticated export rejection, and manager direct admin-route denial. `npm run benchmark:test` checks the session/role matrix, session expiry, forged cookies and collector rules. `npm run benchmark:mutation` runs a deliberately faulty server; success requires the viewer test to fail specifically with expected 403 / received 200, and writes `mutation-summary.json`.

The existing browser login now also establishes an HttpOnly demo server session using seeded `role@example.com` / `password` accounts. Logout removes that session. Existing localStorage still drives browser navigation; it is not the server authorization oracle. The API exports synthetic JSON accounts, not a production CSV system. Fault injection requires **both** `CRM_BENCHMARK_MODE=1` and `CRM_BENCHMARK_FAULT=viewer-export`; normal server startup rejects a fault setting. Never expose this demo beyond loopback.

Measured 2026-10-11: four normal browser/API checks passed; one seeded viewer-export bypass was detected by the independent HTTP assertion even though the UI remained read-only. This proves detection of that specific defect only. No AI productivity, business savings or general mutation score is claimed.

See [automatic dashboard publication](AUTOMATIC-PUBLICATION.md) for the canonical runner, CI, privacy controls and retry behaviour.

## Controlled baseline / framework generation trials

The first live pilot uses the existing sample app, three repeats per condition, the same model settings, and an independent healthy-app + fault-injection evaluation of unchanged generated tests. This is a context-assisted generation experiment, not the complete autonomous workflow. Human correction effort remains unmeasured; standard API-equivalent cost is an estimate, not billed spend.

[Protocol, runner and limitations](https://github.com/balajiregt/framework-benchmark-dashboard/blob/main/trials/README.md) · [Live charts and evidence](https://framework-benchmarks-balaji.netlify.app/#controlled-trials)

Run from this checkout after installing the documented prerequisites:

```sh
npm run benchmark:trials -- --dashboard /path/to/framework-benchmark-dashboard --peer /path/to/other-app-repo --campaign /path/to/private-campaign
```

Use the API checkout as peer from Playwright, or Playwright as peer from API. The campaign directory must be outside all source checkouts. The command prepares/resumes 12 calls, evaluates them and publishes both result feeds automatically. Use `--no-publish` for local-only work. A future run reads new results without dashboard deployment. These model calls are explicit local runs, not automatically triggered by every source push. Existing `npm run benchmark` continues to run only the original browser/API execution benchmark.
