# Playwright Decision Bench

**Would our Playwright tests catch a real requirement-breaking fault?**

The primary workflow is **independent requirement-guided mutation analysis**.
Choose local Laya or a Codex agent; both receive the same frozen artifact, fault
and test evidence through Code Mode. Existing Playwright execution supplies the
observed detection result. The sample mockserver is a benchmark fixture; teams
configure their own cloned repository and downloaded requirement artifacts.

```text
Artifacts + tests + fixed faults → frozen evidence catalogue
                                ↙                 ↘
                     Code Mode + Laya      Codex + Code Mode
                                ↘                 ↙
                        Shared Playwright observations
                                    ↓
                Private report + standard platform metrics
```

[Independent workflow](docs/independent-mutation-analysis.md) ·
[Artifact folder](context-inputs/README.md) ·
[Code Mode integration](integrations/code-mode/README.md) ·
[Measured comparison](docs/independent-mutation-validation.md)

```bash
npm run mutation -- freeze --config examples/mutation/role-aware.config.json \
  --catalogue examples/mutation/fault-catalogue.json
npm run mutation -- compare --config examples/mutation/role-aware.config.json \
  --workload /path/to/workload.json --engines laya,codex --allow-hosted --allow-run
npm run benchmark:export -- --report /path/to/comparison.json
```

Laya is itself a model; it runs through its Python SDK on MPS/CPU without Qwen
or llama.cpp. Codex planning is optional when using a predefined fault catalogue.
Other agents can import hash-bound decisions. The platform's existing portable
publishing skill prepares aggregate metrics; publication requires a separate
explicit command. Original tests and source stay unchanged.

## Earlier coverage and smoke experiments

The [Jev/Laya comparison](docs/jev-laya-comparison.md),
[local team evaluator](docs/team-quickstart.md), historical results and `qa` /
`bench:*` commands remain available. The existing
[private viewer](https://agentic-qa-metrics-viewer.netlify.app/) and
[public benchmark](https://framework-benchmarks-balaji.netlify.app/) still support
those older protocols. New mutation reports are self-contained local HTML.

## Historical pilot and local-provider support

- Coverage: **covered / partial / uncovered / needs_judgment**, with references to
  the evidence considered. Missing helpers and ambiguous requirements preserve uncertainty.
- Smoke: **include / exclude / needs_judgment**, followed by deterministic subset
  selection checking mandatory journeys, dependencies, reliability and budget.
- Local Laya 0.4.12, pinned English checkpoint, Python/MPS adapter with token
  preflight. Oversized packets are excluded for every provider; no silent truncation.
- Local Ollama `qwen3:4b` proxy using the same evidence and rubric. It is not a
  measurement of a complete Copilot/Claude agent workflow.
- Optional **direct OpenAI Decisions** adapter using `OPENAI_API_KEY`. Laya needs
  no key. The Vercel Gateway route is no longer used.
- JSON + HTML reports: accuracy, gaps, false reassurance, p50/p95 latency,
  repeatability, operational failures and safe smoke proposals.

## First pilot

16 authored synthetic decisions × 2 repetitions; **64 valid local assessments**.
The held-out partition has four coverage cases and three smoke candidates.
Both local models matched 1/4 coverage labels and 1/3 smoke labels on each repetition.
This is a small, author-labeled sanity pilot, not evidence for unattended adoption.
OpenAI has no valid measurements; direct credentials are not configured.

Actual Playwright runtime reduction, fault-detection retention, hardware operating
cost and human review time remain **unmeasured**. Fixture duration values are authored
estimates. See [pilot findings](docs/pilot-findings.md).
The [accuracy diagnosis](docs/accuracy-diagnosis.md) separates prompt/context effects,
evidence weaknesses and unresolved model limitations before adoption.

## Run locally

The canonical workspace location is `evaluation/playwright-decision-bench/`.
This repository includes the local mutation-analysis work and the GitHub history
and security updates; use this working copy for future changes.

Use Node.js 22.23.4 from `.nvmrc` for the installed native Code Mode integration.
The main evaluator also supports newer Node versions, but the native dependency
must match the Node version it was built for. Python 3.10+ and Ollama with
`qwen3:4b` are required for the historical local-provider workflows.

```bash
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements.txt
npm run typecheck
npm test
npm run bench:preview       # offline; no model calls
npm run bench:preflight     # downloads/loads pinned Laya; checks token fit
npm run bench:live -- 2     # bounded synthetic pilot; direct OpenAI only if keyed
npm run bench:report       # rebuild graphs from recorded responses; no calls
npm run report:serve
```

Open `http://127.0.0.1:8791/decision-bench.html`. Local raw reports and model cache
stay under ignored `artifacts/`. The first Laya load downloads checkpoint weights.
The default device is `mps`; set `LAYA_DEVICE=cpu` on non-Apple systems. Live runs load
`.env.local`; use `.env.example` for the optional direct API key. No repo-source
export or arbitrary input path is exposed by the pilot CLI. Each run is capped at
150 assessments and stops a provider after access/billing/rate-limit failures.

## Design and limits

[Protocol](benchmarks/decision-pilot/README.md) · [Adapter contract](docs/decisions-comparison.md) ·
[Candidate scope](docs/evaluation-scope.md) · [Evidence handoff](docs/agent-handoff.md)

[Medium draft](docs/blog/medium-article.md) · [LinkedIn draft](docs/blog/linkedin-post.md)

The earlier three-rubric offline previews remain available for reference; the
`bench:*` commands implement the two current use cases. Probability routing uses a
provisional 0.8 threshold, not a calibrated accuracy guarantee. Leads review all
proposals. Human-reviewed, larger datasets and real execution studies are next.
