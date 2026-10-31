# Frozen synthetic pilot v1

**Purpose:** test whether typed decisions help assess Playwright coverage and smoke
candidate relevance. This is not a product defect benchmark or browser execution.

`dataset.json` contains eight coverage cases and two complete suite inventories
(eight candidates). `gold.json` has author-supplied labels and rationales, frozen
before calls. Independent review is pending. Work-item groups never cross the
four-coverage/five-candidate development and four-coverage/three-candidate held-out split.
Do not tune prompts, labels or thresholds against held-out errors.

Each provider gets the same text, instructions and choices. Internal case IDs,
source paths, split names, gold labels and rationales are excluded from packets.
Local reports retain source references as evidence considered; these references
are not model-generated proof that a particular test provides adequate coverage.

- Laya: `convaiinnovations/laya`, revision `7b928d828b7b0e022f929d9bd2e44165aa270148`,
  package 0.4.12, English base checkpoint; no task-specific fine-tuning. Context
  2,048 tokens, head budget 512. Preflight checks state AND question truncation.
- Qwen: existing Ollama `qwen3:4b`, identical evidence/rubric, JSON-constrained output,
  temperature 0, seed 42, thinking disabled, 4,096 context, 64 output tokens.
  This is a local model proxy, not a tool-using coding-agent baseline.
- OpenAI: optional direct `POST https://api.openai.com/v1/decisions`, `gpt-6-luna`.
  `OPENAI_API_KEY` is required; there is no Gateway fallback.

Two repetitions reverse case order on the second pass. Provider blocks avoid
simultaneous local model loads on the 8 GiB pilot host; model-order confounding is
not controlled. First-call latency is flagged and warm p50 is reported separately.
Client elapsed time includes local IPC or network overhead. Laya startup is separate.
Process RSS excludes a complete accounting of GPU/unified-memory usage and energy.

Raw labels are compared with gold. Low Laya/OpenAI selected-label probability
(<0.8), missing required evidence and unreliable critical candidates route to
human review. Qwen returns no probabilities: none are fabricated. Thresholds are
provisional and not comparable calibration guarantees across models.

The suite optimizer uses reviewed journey annotations, dependency closure and
fixture durations. It picks the lowest total serial-duration feasible subset of
accepted candidates; it does not infer new coverage or execute Playwright. If no
feasible suite exists, it returns no selected suite plus diagnostic missing journeys,
budget/dependency issues and unresolved candidates. All proposals require review.

Accuracy uses valid answers, alongside matched/requested end-to-end counts. Gap
recall includes failed/unrun expected gaps. Refusals, exclusions and transport
errors remain separate from model uncertainty. Repeated calls are not independent
examples. Costs are reported only when supplied; direct Decisions pricing is not
converted into an invented bill. Local operating costs remain unavailable.

Only sanitized aggregates are published to `benchmark-results/decision-bench.json`.
Raw packets, predictions, keys and model cache stay local. Source pushes run offline
checks only; live model calls and result publication are explicit commands/actions.
