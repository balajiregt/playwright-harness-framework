# Playwright Agent — internal quality module

This module is owned by the parent Playwright Agent repository. Follow its
AGENTS.md and keep evaluator changes inside quality/. The old standalone
checkout is a compatibility/archive location, not a second implementation owner.

The primary workflow measures whether existing Playwright assertions detect
requirement-breaking behavioral faults. An optional research benchmark independently compares local Laya and Codex assessment
engines on one frozen fault/test catalogue through Code Mode. Codex planning is
optional. Playwright supplies observed evidence. Other agents use hash-bound imports.
Downloaded epic/PRD/Jira exports are passive, hashed local context. The optional
UTCP Code Mode adapter orchestrates the same bounded MCP tools. Never register
global MCP servers, enable hooks, publish or deploy as a side effect.

Application faults run only in disposable copies, one at a time. Require two
green baselines, an independent baseline/mutant observation, repeatable results
and restored green. Startup errors, unactivated faults and flaky failures do not
count as detected faults. Keep original tests, helpers and user checkouts unchanged.
Use `npm run mutation -- help` and `docs/behavioral-mutations.md` for this workflow.

Historical requirement coverage, smoke selection, Jev, OpenAI
and Qwen pilots remain separate. Keep existing browser tests unchanged during evaluation. Test-authoring tasks
are owned by the parent agent workflow and require their own explicit scope.

Read `contexts/task.yml`, then run `npm run context:resolve`. Supplied evidence,
assertions and completeness flags determine coverage; names, claimed links and
passing run records are not proof. Preserve uncertainty and missing helpers.

The bench:* commands implement a bounded synthetic coverage/smoke pilot. Laya and
Qwen run locally. OpenAI is optional and direct-only; never use old Gateway keys. `workflow.ts` retains general rubric
machinery; `comparison.ts` uses normalized injected responses in tests. Do not
claim native API compatibility, live results or measured gains from offline tests.

Gold labels, rationales, benchmark IDs, source filenames and reviewer decisions
must never enter model evidence packets. Do not change gold to make a model pass.
Never log credentials, raw provider errors or headers. No automatic repo-source export.

Keep raw findings, local probability routing, refusals and operational errors
separate. Keep models and protocol versions identified. No fabricated browser
execution, lead approval, costs or latency. Smoke proposals require whole-suite
coverage, dependency and runtime constraints before lead approval.

Run `npm run typecheck`, `npm test`, `npm run context:resolve`,
`npm run review:preview`, `npm run compare:preview` and
`npm run benchmark:crm:preview` and `npm run bench:preview` after implementation changes. Previews and tests
must not use network APIs. Documentation-only changes need link/reference checks.

The public destination is framework-benchmarks-balaji.netlify.app. The result feed is benchmark-results/decision-bench.json. Keep raw reports, prompts, code, keys and reviewer notes private.
Do not reuse retired provider results under a new model name. Medium/LinkedIn
remain drafts. Report changed files, verification and any skipped gates.

## Reusable team CLI

The user-authorized `qa` commands accept explicit external repository and requirements
paths. They collect using the target repository's own Playwright runner. Local-provider
inference is loopback-only. `qa compare --providers laya,jev --allow-hosted` explicitly
authorizes sending the frozen evidence to TypeSafe; no other command implicitly
enables hosted inference. Load TYPESAFE_API_KEY only for that route. `qa record` explicitly
runs the suite. `qa run` only lists tests and evaluates evidence. `qa publish` validates
the closed shared/team-metrics.mjs contract before any GitHub mutation. Do not widen
that public schema to include text, paths, IDs, raw responses or source. Comparisons
use the separate versioned shared/comparison-metrics.mjs contract and comparison-metrics.json
feed. Quality requires input-bound reviewer labels. Estimates are never approval.

## Independent analysis and platform export

Use mutation freeze/compare with docs/independent-mutation-analysis.md. Preserve
identical packets, provider completion denominators and separate observed outcomes.
Use the bundled .agents/skills/platform-publish contract for exports; do not fork
the publisher or add another feed schema. Preparing metrics does not publish.
Run the native Code Mode integration under Node 22; full tests may skip that
one integration check only when the optional native dependency is absent.
