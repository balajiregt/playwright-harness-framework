# Compare Jev and local Laya against your Playwright suite

Use the same frozen requirements, assertions and setup evidence for both models.
Playwright execution, model-estimated coverage and model probability are separate
signals. A green test does not establish coverage.

[Recorded local validation and current limitations](jev-laya-validation.md).

## Install and configure

Follow the [team quickstart](team-quickstart.md) for Node, the Python environment,
Laya dependencies and JSON/XLS/XLSX/DOC/DOCX requirement templates. Supply one
testable criterion per requirement, a functionality/journey and criticality.
Free-form requirement extraction is not included.

```bash
npm run qa -- init --repo /path/to/repo --requirements /path/to/requirements.xlsx \
  --playwright-config playwright.config.ts
```

In the ignored `decision-bench.config.local.json`, use:

```json
{
  "provider": { "kind": "laya", "device": "auto" },
  "comparison": {
    "jevModel": "jev-1.14.0",
    "minProbability": 0.8,
    "minRuns": 3,
    "maxCostUsd": 0.25
  },
  "smoke": { "minPassRate": 0.98, "budgetMs": 300000 }
}
```

These are sections to merge into the generated config, not a complete config.
`auto` selects MPS when available, otherwise CPU. Explicit MPS also falls back
to CPU if unavailable; the actual device is recorded. Only one local model runs
at a time.

Put your own direct TypeSafe key in this evaluator's ignored `.env.local`:

```dotenv
TYPESAFE_API_KEY=your-key
```

No Vercel or OpenAI credential is used by this comparison.

## Record history, then evaluate

Run this **three times** to capture independent executions:

```bash
npm run qa -- record --comparison
```

Add each printed history path to the config's `history` array. The flag selects
the same evidence preparation used by comparison; old histories with different
source fingerprints do not establish current reliability. Retries do not erase a
first-attempt failure. Three runs are a configurable starting rule, not a reliable
statistical estimate of a 98% true pass rate.

```bash
# Local only; no key or hosted transfer.
npm run qa -- compare --providers laya

# Explicitly sends supplied evidence to the direct TypeSafe API.
npm run qa -- compare --providers laya,jev --allow-hosted
```

Use `--config /path/to/config.json` on every command for a custom config.
Each comparison collects once, then runs providers serially on that frozen input.
The default cap is 200 pairs. A conservative byte-based input estimate checks
the Jev spending cap before calls; reported costs are token-derived estimates
at the documented $0.042/million input rate, not invoices or hard provider-side
spending limits. Failed calls may have unreported usage; retries are not automatic.

The local slicer retains target assertions, shared hooks, transitively referenced
declarations and relevant class methods. It resolves static project-role arrays.
Aliased/default imports, inheritance and unsupported dynamic behavior can require
review. No missing evidence is silently promoted to coverage. Each provider
enforces its own input capacity; oversized requests remain excluded or operational
errors, never coverage gaps. Quality comparisons use identically hashed pairs
assessed by both; whole-workload counts show the excluded denominator.

## Read and review results

Open `index.html`, or import **`comparison.json`** into the
[QA Metrics Viewer](https://agentic-qa-metrics-viewer.netlify.app/).
It stays in browser memory; there is no backend upload, login or persistence.
The report shows evidence, provider disagreements, execution outcomes, historical
pass rate and selected-label probability. Do not compare the vendors' separate
`confidence` fields as if they were calibrated to one scale.

Each provider gets its own deterministic smoke proposal using the same policy:
complete critical coverage, setup dependencies, measured duration and reliability.
Unknown history/duration, incomplete evidence or low probability requires review.
The greedy algorithm leaves infeasible critical requirements visible and does
not claim an optimal subset. All proposals remain unapproved.

Optional reviewed labels measure four-way label accuracy and binary full-coverage
precision/recall. Fill `review-template.json`; every entry contains:

```json
{
  "requirementId": "AUTH-2",
  "testId": "test ID from the private report",
  "packetHash": "packet hash from the private report",
  "label": "covered",
  "reviewer": "QE reviewer",
  "reviewedAt": "2026-10-20T12:00:00.000Z",
  "notes": "Setup uses viewer; the reached assertion requires zero admin actions."
}
```

Keep the template's version and input hashes. Review against the actual source;
do not copy model answers into reference labels. Apply labels locally:

```bash
npm run qa -- review --report /path/to/comparison.json --reviews /path/to/labels.json
```

Each accepted update creates a private review event, merges reviewed pairs and
regenerates metrics. Unlabelled pairs do not enter accuracy denominators. A schema
can bind labels to evidence but cannot verify a reviewer's independence or quality.

Execute a proposed subset only with an explicit command:

```bash
npm run qa -- smoke --report /path/to/comparison.json --provider laya
```

The command verifies source fingerprints and exact test selection before running
the existing Playwright runner. Execution results and wall time are saved without
marking coverage or release approval. No tags or test code are modified.

## Share only aggregate metrics

Import **`metrics.json`** into
[Framework Benchmarks](https://framework-benchmarks-balaji.netlify.app/#jev-laya-comparison)
for browser-only viewing. To publish a shared aggregate using your Git access:

```bash
npm run qa -- validate-metrics --metrics /path/to/metrics.json
npm run qa -- publish --metrics /path/to/metrics.json
```

The versioned comparison feed is `comparison-metrics.json` on `benchmark-results`.
The strict schema rejects extra fields, source, requirement text and reviewer
notes. Model configuration and input hashes allow provenance checks; users of the
public dashboard cannot independently verify local source evidence.

Captured measurements include completion/exclusion/error counts, uncertain
decisions, reviewed quality on common and provider-specific pairs, smoke coverage
and gaps, actual subset execution when requested, startup, latency, input tokens,
process RSS and estimated hosted input cost. Local energy cost, fault retention
and review effort remain unmeasured. Historical local Qwen and OpenAI pilots
remain available separately; OpenAI is outside this comparison.
