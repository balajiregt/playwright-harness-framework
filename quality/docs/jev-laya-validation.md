# Jev / Laya implementation validation — 20 October 2026

The comparison workflow works locally. The current Laya result is **not evidence
for adopting automatic coverage or smoke decisions**.

## Recorded local run

The existing role-aware Playwright repository supplied 21 tests and five explicit
criteria, including four critical criteria. Three separate executions passed
21/21 tests each. These records establish observed first-attempt history, not
proof that the tests satisfy all five criteria.

| Measurement | Laya result |
| --- | --- |
| Runtime | Python SDK 0.4.12, PyTorch 2.7.1, Apple MPS |
| Model revision | `7b928d828b7b0e022f929d9bd2e44165aa270148` |
| Assessments | 105/105 completed; zero exclusions or provider errors |
| Raw decisions | 99 covered, 6 partial |
| Selected-label probability | All 105 below the provisional 80% threshold |
| Proposed smoke subset | 0 selected; 21 review candidates; 4 critical gaps visible |
| Startup | 11.96 seconds |
| Evaluation wall time | 211.06 seconds |
| Per-pair latency | p50 1.95 seconds; p95 3.96 seconds |
| Peak model process RSS | 1.06 GiB; not total machine or GPU memory |
| Input tokens | 101,518 |
| Reviewed accuracy / precision / recall | Unavailable: no independent reference labels |
| Measured smoke runtime | Unavailable: no eligible subset |

Run ID: `c3bd8d71-9f0f-4daa-b9e2-360e19d15662`.
Detailed artifacts remain in the ignored `artifacts/jev-laya-validation/results/`
directory. No raw evidence or new run metrics were published.

Evidence preparation removed the earlier capacity exclusions (previously 60/105),
but it did not establish better judgment quality. The broad “covered” decisions
and low probabilities require criterion-by-criterion human review. We retained
the configured threshold rather than tuning it to obtain a nonempty proposal.

## Verification and remaining comparison

Offline tests cover the direct Jev request/response contract, malformed responses,
evidence slicing, review binding, common-pair denominators, smoke policy and
closed public metrics. A synthetic end-to-end test records a real Playwright
assertion, compares injected provider responses and explicitly executes exactly
the proposed test. Those injected responses are not live Jev measurements.

Both viewers were updated to distinguish execution from estimated coverage and
probability from observed pass rate. Detailed import stays in browser memory;
public import accepts only aggregate metrics.

Live Jev remains pending a direct `TYPESAFE_API_KEY`. Once configured, run both
providers with `--allow-hosted` against the same frozen inventory, add independent
review labels, and compare common-pair quality alongside completion rates.
Neither model's probabilities are calibrated safety guarantees.

See [setup, review and publication commands](jev-laya-comparison.md).
