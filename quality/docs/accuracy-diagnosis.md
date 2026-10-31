# Accuracy diagnosis — October 20, 2026

**Decision: keep this as a research pilot.** The low scores are not sufficient to
reject either model generally. Our framing and evidence contribute, but the
current checkpoints also make clear errors that the tested changes did not solve.

## What we tested

Six development examples: four coverage cases plus sign-in and theme smoke
candidates. Same evidence and author labels; one variable changed per probe.
No held-out tuning, hosted calls, new checkpoint downloads or gold-label edits.
Original published results remain the baseline. These small, deliberately chosen
cases diagnose failures; they do not estimate production accuracy.

| Change from the original six-case setup | Laya matches | Qwen matches |
|---|---:|---:|
| Baseline replay | 1/6 | 2/6 |
| Readable evidence fields | 1/6 | 2/6 |
| Explicit decision sequence in the question | 1/6 | 3/6 |
| Reverse option order | 1/6 | 2/6 |
| Native JSON object instead of escaped evidence string | — | 2/6 |
| Remove output enum restriction | — | 2/6 |
| Put output schema in the prompt | — | 2/6 |
| Present the whole prompt as prose sections | — | 3/6 |
| Increase output budget from 64 to 1,536, thinking off | — | 2/6 |

Clearer questions corrected Qwen's missing-helper case; prose corrected its CSV
case. These were separate changes, not a combined improvement. Both still called
the status-only refund test fully covered and included the irrelevant theme test.
Reversing choices changed Qwen's missing-helper answer between two wrong labels;
there is sensitivity, but no evidence that first-option bias alone explains failure.

Qwen thinking was tested with the same 1,536-token budget. The first request used
all 1,536 tokens and returned **no final decision after 141 seconds**. It is an
incomplete generation, not a wrong classification. The next in-flight request
was interrupted and the remaining thinking cases were not run. Thinking-enabled
accuracy remains unresolved. Baseline completed outputs used 10–11 tokens, so
raising their output cap alone could not help.

## What explains the failures?

**Input context contributes.** On four atomic assertion questions, removing only
the requirement text changed answers despite leaving the code intact. It fixed
Laya's false refund-amount claim but broke its previously correct CSV judgment
(3/4 before and after). Qwen improved from 2/4 to 3/4. This is evidence of context
sensitivity, not proof that deleting requirements is a solution. Keep desired
behavior clearly separated from observed assertion evidence.

**Question type contributes, with limits.** Eight narrower questions asked about
specific assertions, helper availability and journey-tag membership. Binary
`choice` matched 5/8 for each model. Laya's native `noul` matched 6/8 using a
provisional 0.5 yes/no cutoff. These are easier, different tasks—not improved
six-case coverage accuracy. `noul` still incorrectly affirmed the missing amount
assertion and theme's mandatory-journey membership. Neither cutoff nor model
probabilities are calibrated for adoption.

**The benchmark needs stronger evidence and labels.** The viewer-delete snippet
asserts `response.status()` without assigning `response` from the delete call.
Several smoke helpers are marked complete but supplied only as comments, and the
cart example omits its starting state and price fixture. Gold is explicitly
`author-labeled-unreviewed`. These ambiguities require independent review, though
they do not explain unambiguous failures such as treating a heading assertion as
CSV verification. We did not silently repair snippets or labels after seeing scores.

**Current model/task fit remains a concern.** Laya passed both literal color
controls; Qwen passed all four color/layout controls. Integration is not simply
returning a constant. Laya's tested checkpoint is the 421M English encoder, not a
domain-tuned Playwright reviewer. Its maintainers report different performance
for base versus tuned checkpoints on their own benchmark; those numbers do not
predict ours. [Laya checkpoint and tuning documentation](https://github.com/NandhaKishorM/laya#fine-tune-for-better-accuracy).
Qwen is the locally installed `qwen3:4b`, Q4_K_M quantization. Larger models,
alternate checkpoints and quantization effects were not tested. Persistent errors
establish limitations of this setup, not an inherent ceiling for either family.

Laya's checked multi-class inputs fit without truncation. Qwen's completed calls
reported `done_reason: stop` and short prompts; no evidence of an input-window
problem was found. Laya's 0.8 review threshold affects automated acceptance, not
raw accuracy. Changing it would not fix wrong labels.

## Better next experiment

1. Build complete evidence packets: atomic acceptance criteria, relevant test
   bodies, actual helper/fixture source, assertion references and explicit unknowns.
   Have a second reviewer adjudicate labels before running models.
2. Ask for criterion-to-assertion matches and missing evidence. Aggregate the
   final coverage status in code. Test paired examples where adding/removing a
   real assertion must change the result; preserve an unknown outcome.
3. For smoke, use deterministic journey/dependency/reliability/runtime selection
   as the baseline when metadata is trusted. Use AI to investigate missing or
   questionable journey mappings, with source evidence and lead review.
4. Freeze the revised protocol, then evaluate new tickets and independent suites.
   Measure false-covered rate, gap recall, per-class performance, abstention versus
   accepted accuracy, valid-response rate and latency. Execute the proposed smoke
   suites and measure critical fault retention and actual runtime before adoption.

## Reproduce and inspect

Run from the project root; all inference uses cached Laya or loopback Ollama.
Do not run the local model scripts concurrently on the 8 GiB machine.

```bash
node --import tsx scripts/diagnose-accuracy.ts
node --import tsx scripts/diagnose-output-schema.ts
node --import tsx scripts/diagnose-atomic.ts
node --import tsx scripts/diagnose-atomic.ts without-requirement
# Substitute the path printed by the original atomic run:
.venv/bin/python scripts/diagnose-noul.py artifacts/accuracy-diagnostics/atomic-<run>/report.json
node scripts/diagnose-sanity.mjs
```

The main script now stops its thinking branch after the first incomplete response.
Follow-up schema and atomic probes were planned after the initial results; this
is exploratory diagnosis, not a preregistered benchmark. Repetitions and variants
are not additional independent samples. Timings include local runtime/cache effects.

Local raw evidence (ignored by Git):

- [Main ablations](../artifacts/accuracy-diagnostics/2026-10-20T04-03-43-359Z/report.json)
- [Output-schema checks](../artifacts/accuracy-diagnostics/schema-2026-10-20T04-09-31-722Z/report.json)
- [Prose prompt checks](../artifacts/accuracy-diagnostics/schema-2026-10-20T04-11-18-119Z/report.json)
- [Atomic choice checks](../artifacts/accuracy-diagnostics/atomic-2026-10-20T04-10-23-254Z/report.json)
- [Native noul checks](../artifacts/accuracy-diagnostics/atomic-2026-10-20T04-10-23-254Z/noul.json)
- [Requirement-removal checks](../artifacts/accuracy-diagnostics/atomic-without-requirement-2026-10-20T04-11-51-856Z/report.json)
- [Qwen elementary controls](../artifacts/accuracy-diagnostics/qwen-sanity.json)

API references: [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
and [thinking controls](https://docs.ollama.com/capabilities/thinking).

Validation: project typecheck, all 40 existing tests, context resolution and four
offline previews passed. Diagnostic TypeScript and Python syntax checks passed.
No Playwright browser suite, fine-tuning, fresh held-out evaluation or publication
was performed in this diagnosis. The original live report was restored after previews.
