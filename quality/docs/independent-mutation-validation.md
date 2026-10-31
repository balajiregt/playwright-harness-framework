# First independent mutation comparison

Recorded on 31 October 2026. Run `f839ec13-0902-4692-8636-713c8906f1be` uses
the synthetic role-aware mockserver fixture: seven viewer-project tests and
three predefined behavioral faults, producing 21 frozen test/fault packets.
Laya and Codex received identical packet contents through the real Code Mode
MCP integration. Neither received observed outcomes.

| Measurement | Local Laya | Codex CLI |
| --- | ---: | ---: |
| Assessments completed | 21/21 | 21/21 |
| Agreement with observed outcomes | 2/21 (9.5%) | 20/21 (95.2%) |
| False detection claims | 19 | 0 |
| Uncertain decisions | 0 | 1 |
| Detection precision | 9.5% | 100% |
| Detection recall | 100% | 100% |
| Analysis wall time | 39.08 s | 374.71 s |
| Per-pair latency p50 / p95 | 1.36 / 1.97 s | 17.42 / 22.21 s |
| Input tokens | 19,744 | 1,383,541 |
| Cached input tokens | Unavailable | 1,025,280 |
| Output tokens | 0 | 4,384 |

The independent Playwright campaign took 61.92 seconds. Two healthy baselines,
fault activation probes, repeated mutant runs and restored green confirmed:

- Exposing the admin-console action to a viewer: detected.
- Displaying four actions when three cards exist: survived all seven tests.
- Replacing the required viewer workspace title: detected.

Both providers assessed all 21 comparable pairs, with 19 disagreements. Laya
predicted detection for every pair. Codex returned one `needs_judgment`; it
remains in the known-outcome denominator. Laya ran its own cached checkpoint on
MPS through Python SDK 0.4.12. No Qwen model or llama.cpp server was involved.
Full pinned checkpoint/runtime provenance is recorded in the private report.
The CLI did not expose its resolved model identity; the report records that
limitation instead of assigning a model name.

These selected cases are small, correlated and imbalanced: only two pairs
actually detected a fault, and predicting `missed` throughout would match 19/21.
The percentages are pilot outcome agreement, not general adoption evidence.
Codex tokens and timing include separate CLI/tool orchestration for every pair;
they are not directly comparable inference costs. Actual spend, peak accelerator
memory, energy and reviewer effort were not measured. No claim of Code Mode
token savings is made without a direct-MCP baseline.

Local outputs under `artifacts/behavioral-mutations/comparisons/<run ID>/`:
`comparison.json`, `metrics.json`, `index.html`, `platform-measurements.json`
and `prepared-metrics.json`. Raw artifacts and evidence remain private. The
unchanged platform-publish skill prepared and validated 49 aggregate metrics;
the platform reader accepted that feed through an offline fetch fixture and
preserved unavailable/stale states on failed refresh. The registry change and
export are prepared locally; nothing was published or deployed.

Verification: evaluator typecheck, 83 tests, all required offline preview gates;
platform contract checks, 37 Python tests, 59 JavaScript tests and production
build. Native Code Mode and browser rendering were exercised locally. Existing
target tests and app source were kept unchanged.

See [the reusable workflow](independent-mutation-analysis.md) for commands and
the distinction between predictions and measured assertion detection.
