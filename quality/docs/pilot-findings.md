# First local pilot — October 20, 2026

**Finding:** the current untuned models and rubric are not ready for unattended
coverage approval or smoke classification.

16 author-labeled synthetic decisions, two repetitions per provider. The local
arms completed 64 assessments. Independent human label review is pending.

| Held-out task | Unique requirements / candidates | Laya exact matches | Qwen exact matches | Laya p50 / p95 | Qwen p50 / p95 |
|---|---:|---:|---:|---:|---:|
| Requirement coverage | 4 | 2/8 calls (25%) | 2/8 calls (25%) | 213 / 537 ms | 2,422 / 5,695 ms |
| Smoke candidate relevance | 3 | 2/6 calls (33%) | 2/6 calls (33%) | 238 / 324 ms | 3,579 / 5,323 ms |

These are client-observed timings on this deployment, not a general speedup claim.
The two repetitions returned the same labels, but repetition does not add independent
examples or establish correctness. The three held-out smoke candidates belong to one suite, not three independent suites. Laya ran on Apple MPS, with an 8 GiB ARM64 host;
initial checkpoint loading took about 9.5 seconds separately from assessment latency.

Both models marked the held-out partial and uncovered cases as covered: four
false-covered calls out of four gold-gap calls each. Gap recall was zero. Laya's
0.8 probability threshold routed every held-out answer to review; it prevented
approval but supplied no autonomous decisions. Qwen's missing-evidence and flaky-test
guards routed uncertainty locally, without pretending it supplied calibrated confidence.

For the development checkout inventory, local optimization of Qwen's candidates
retained setup, sign-in and the shorter checkout test: three of five tests, with a
14-second **authored serial-time estimate**. Laya's threshold yielded no accepted
suite. Both arms left the held-out transfer suite infeasible because its only
critical transfer test was unreliable. These are proposals, not executed smoke suites.

**OpenAI was not measured.** The initial legacy Gateway attempt returned HTTP 403
with a billing/credits rejection. That route is now removed; the optional direct
OpenAI adapter requires a separate key. The failed attempt stays in the original
record, and no OpenAI accuracy or latency is claimed.

Actual Playwright wall-clock reduction, fault-detection retention, reviewer effort,
energy and hardware operating cost remain unavailable. Next: independently review
labels, improve prompts or tune only on development data, then evaluate on new
held-out tickets. Keep this first untuned result as the baseline.

Follow-up: [accuracy diagnosis](accuracy-diagnosis.md) tests development-only
ablations. It preserves these original results and does not establish a general
model adoption verdict.
