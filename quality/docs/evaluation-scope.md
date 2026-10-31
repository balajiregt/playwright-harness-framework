# Start with the Playwright problem, then compare decision APIs

**Research question:** which review tasks in an agentic Playwright workflow benefit
from a separate decision API, and how do local Laya and OpenAI Decisions compare for each task?

The work has three phases: **identify candidates → apply both APIs → measure
quality, performance and practical value**. Integration alone is not evidence
that an extra review layer helps.

## 1. Identify and select candidates

A useful candidate has a recurring review decision, bounded evidence, a clear
answer rubric and a concrete action for the QA lead or coding agent. Prefer
semantic judgments that deterministic assertions or static checks cannot settle.

The first pilot has **two user-facing outcomes**. Assertion adequacy is evidence
for requirement coverage; duplication is a supporting consideration in suite selection.

| Primary use case | Inputs | Output | Lead action |
|---|---|---|---|
| Validate test coverage against requirements | Acceptance criteria + complete/partial test inventory + test/helper assertions | Requirement-to-test matrix: covered, partial, uncovered or needs judgment | Inspect evidence links and add or strengthen tests for confirmed gaps. |
| Select smoke tests from the full E2E suite | Test behavior + critical journeys/risk policy + dependencies + recent duration/reliability data + runtime budget | Smoke candidates: include, exclude or needs judgment; proposed suite with coverage and budget checks | Approve a fast suite that retains required critical journeys. |

### Requirement-to-test coverage

Judge each acceptance criterion using actual actions and assertions, not test names
or claimed links. Multiple tests can jointly cover a criterion. Distinguish planned
scenario coverage from implemented test coverage; a passing run is execution evidence,
not proof that the acceptance outcome was asserted.

- **Covered:** supplied tests verify all required aspects.
- **Partial:** some required aspects are verified, with explicit remaining gaps.
- **Uncovered:** a declared complete inventory has no adequate test for the criterion.
- **Needs judgment:** unclear requirements, missing helpers or incomplete inventory
  prevent a reliable conclusion. Do not turn unknown coverage into a confirmed gap.

Example: “Viewer cannot delete a customer and data remains.” A test that checks
only the Customers heading does not establish coverage. One that checks denial
but never checks preservation provides partial coverage.

### Smoke-suite selection

Define the team's smoke policy first: mandatory critical journeys, roles/platforms,
acceptable execution time and any deployment-specific needs. Give both models the
same policy and evidence. A short duration or an existing `@smoke` tag is not proof
that a test belongs. Hold existing labels back as a comparison baseline if relevant.

The models assess candidate relevance. Local selection logic then checks the
**whole proposed suite** for mandatory journey coverage, setup/dependency closure,
redundancy and runtime budget. These constraints cannot be established from independent
include/exclude predictions alone. If no feasible suite exists, report the conflict;
do not silently drop a critical journey to meet the budget. Leads review the proposal
before any tagging or execution changes.

Example: preserve login and a policy-mandated core transaction; exclude redundant
cosmetic variants when their behavior adds no required smoke coverage. Flag a flaky
critical test for repair or an equivalent replacement instead of hiding the journey.

Ordinary assertions, syntax checks and exact duplicate detection remain deterministic.
Behavioral-duplication review, failure triage and AI-content evaluation are later
standalone candidates. Model-driven retries, locator healing and release approval
are outside this experiment.

## 2. Apply both APIs to a fixed experiment

1. Build independent examples per candidate. The current 13 checks are an adapter
   sanity set, not a smoke-selection dataset or representative performance benchmark.
2. Have reviewers label the examples before model calls. Preserve disagreements
   and adjudicate them; unresolved scope can legitimately be a neutral label.
3. Separate development examples from held-out evaluation by ticket/work item.
   Checks from the same ticket must not leak across the split.
4. Send both APIs the same evidence, instructions and allowed outcomes. Keep gold
   labels, filenames and reviewer decisions local. Use Choice for this first pilot.
5. Compare against the current agent + MD/skill review on the same snapshots.
   This baseline tests whether an additional API provides value beyond existing review.
6. Freeze rubrics and each model's provisional threshold before held-out runs.
   Repeat the same cases, record call order, model/version, route, date and input hash.

Proposed pilot: 20 independent examples per candidate, covering the defined labels
and cases needing judgment. Run three paired repetitions: 40 examples × 2 models × 3 runs
= 240 assessment calls, split into bounded batches. This is a planning target, not a completed
dataset or a claim of statistical sufficiency. Also prepare multiple full-suite
selection fixtures with independently defined critical journeys and budgets. Their
additional assessment calls depend on inventory size; report the total separately.
Keep whole suites/work items together across dataset splits. Review cost before scaling.

## 3. Measure each use case and shared operational performance

| Use case | Primary quality measures | Practical outcome |
|---|---|---|
| Requirement coverage | Four-label accuracy; precision/recall of confirmed partial/uncovered findings; false-covered rate on known gaps; unknowns falsely marked covered | Evidence-backed traceability matrix and reviewer effort to verify/correct it. |
| Smoke selection | Mandatory critical journeys retained / all mandatory journeys; missed critical journeys; selection precision/recall against an adjudicated reference; dependency/budget violations | Selected test count and measured wall-clock reduction under the same runner settings, while retaining required coverage. |

Smoke selection may have several valid answers. Reference overlap is secondary to
suite coverage and constraints. An excluded test is not a defect. Existing tags
are a baseline, not unquestioned gold. Count boundary/role coverage explicitly where
required by policy. Measure failure-detection retention only by running both suites
against diagnosed regressions or controlled faults; selected-test count is no proxy.
Keep unavailable model assessments visible rather than silently excluding those tests.

Shared measurements:

| Dimension | Measurement | Interpretation |
|---|---|---|
| Correctness | Exact label matches / valid answers; also matches / requested checks | Show both model quality and end-to-end completion. |
| Coverage-gap detection | Precision = correct issue flags / all issue flags; recall = detected gold issues / all gold issues | Count missed issues, including unrun/error cases, in end-to-end recall. |
| Coverage false reassurance | Raw positive on gold-negative evidence; report gold-neutral positives separately | A useful reviewer must not confidently wave through weak tests. |
| Human workload | Neutral/low-probability rate; operational failures separately | Abstaining may be appropriate, but too many reviews remove the benefit. |
| Repeatability | Same-label rate across repeated calls per example | Exposes instability hidden by a single run. |
| Latency | Client-observed p50/p95 for usable answers, with sample counts | Includes client/network overhead; timeouts and failed-call latency are separate. |
| Cost | Reported cost and tokens per attempted call; total reported cost / usable answers | Disclose missing cost records; do not infer an invoice from partial metadata. |
| Reliability | Valid-answer, HTTP-error, malformed-answer, refusal and timeout rates | Operational failure is not a neutral model judgment. |
| Practical benefit | Reviewer time and accepted useful findings versus agent + skill baseline | Requires a timed, counterbalanced human study; no time-savings claim without it. |

Report raw findings separately from threshold routing. Compare thresholds on a
development set; use held-out results to assess the quality/workload tradeoff.
Provider confidence is not measured accuracy, and agreement between models is not
correctness. Show counts and uncertainty; a tiny sample cannot establish a winner.

Adoption is decided **per use case**: better gap detection or a smaller feasible
smoke suite than the baseline, with acceptable false reassurance and review overhead.
Record target limits before evaluation. If neither adds enough value, retain the
existing workflow for that candidate.

## Local Laya pilot and optional fine-tuning

Start with one criterion and a short evidence excerpt per case. Retain all facts
needed for judgment; label any omitted required evidence as incomplete. Check
actual tokenizer limits before calls. Use the same bounded packet for both models,
and record exclusions rather than silently shortening only Laya's input.

The upstream project documents default context limits and weaknesses on general
zero-shot typed decisions. This makes assertion adequacy a hypothesis to test,
not an assumed capability. Evaluate the chosen base checkpoint first. If fine-tuning
is warranted, train only on the development/training partition and report it as a
separate Laya variant. Keep the held-out tickets untouched and include training
cost/time. Compare the untuned and tuned results; do not replace a poor baseline
with the tuned score without labelling the change.

References: [model files and license](https://huggingface.co/convaiinnovations/laya/tree/main),
[upstream setup, limitations and fine-tuning](https://github.com/NandhaKishorM/laya#fine-tuning).

## Publish results on the existing benchmark dashboard

Destination: [Framework Benchmarks · Build with Balaji](https://framework-benchmarks-balaji.netlify.app/).

Publish two comparison views: **requirement-to-test coverage** and **smoke-suite
selection**, each showing local Laya, OpenAI Decisions and the agent/skill baseline.
Include dataset/protocol version, model/checkpoint, local hardware, run date,
repetition/sample counts, completed/requested assessments and operational failures.
Keep model assessment time separate from actual Playwright suite runtime.

- Coverage view: label accuracy, gap precision/recall, false-covered findings and
  human-review rate, with their denominators.
- Smoke view: mandatory journeys retained/missed, selected/total tests,
  dependency/budget violations and measured full-suite versus smoke-suite runtime.
  Show failure-detection retention only when execution evidence supports it.
- Shared view: successful-call p50/p95, reported cloud cost, local resource use,
  repeatability and unavailable measurements. Do not convert missing data to zero.

The shared dashboard reads sanitized aggregates from
`playwright-decision-bench/benchmark-results/decision-bench.json`.
Raw packets, responses and keys stay local. The first local pilot is documented in
[pilot findings](pilot-findings.md); OpenAI has no valid measurements.

## Implemented versus remaining

Implemented: coverage labels, evidence references, smoke policy/inventory contract,
candidate assessment, dependency/budget/reliability checks, local Laya and Qwen
adapters, optional direct OpenAI adapter, token preflight, raw/routed findings,
per-task quality, p50/p95, repeatability, operational errors and graph reports.

The first pilot uses 16 synthetic decisions and two repetitions, smaller than the
proposed expanded study above. Labels are author-supplied, not independently adjudicated.
No held-out errors were used to change the frozen rubric or labels.

Remaining: independent label review, expanded dataset, full tool-using agent baseline,
direct OpenAI measurements, measured Playwright suite runtime and fault retention,
calibrated thresholds and timed human review. Laya uses its own pinned English
checkpoint; the installed Ollama Qwen model is never relabeled as Laya.

See [the adapter contract](decisions-comparison.md) and
[reproducible pilot protocol](../benchmarks/decision-pilot/README.md).
