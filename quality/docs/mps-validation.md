# Laya on Apple Silicon: measured validation

20 October 2026 · Run `658559ec-2e59-4f56-abf0-4565c3cc473c`

**Runtime works; automatic coverage approval and smoke selection are not ready.**
This run evaluated the existing role-aware mockserver Playwright repository,
not the earlier constant-assertion integration fixture.

## What ran

- Laya Python SDK 0.4.12, PyTorch 2.7.1, `device=mps`, ARM64 Mac with 8 GiB RAM.
- Checkpoint `convaiinnovations/laya`, revision
  `7b928d828b7b0e022f929d9bd2e44165aa270148`.
- Five source-derived requirements: admin actions, non-admin denial, role
  precedence, feature-flag display and downstream-error display.
- All 21 existing browser tests passed; full-suite Playwright time was 8.831 s.
- Expected full-coverage links were recorded before inference from setup and
  reached assertions. This is agent source review, not independent human gold.

## Captured results

| Measurement | Result |
|---|---:|
| Requirement/test pairs | 105 |
| Valid model decisions | 45 |
| Excluded: configured 2,048-token input window exceeded | 60 |
| Provider errors | 0 |
| Model startup | 14.48 s |
| Evaluation loop, excluding startup and collection | 128.20 s |
| Valid-call p50 / p95, including preflight and IPC | 2.18 s / 5.50 s |
| Peak model process RSS | 858.1 MiB |
| Model “covered” links | 15 |
| Covered links supported by source review | 6 |
| Unsupported full-coverage links | 9 |

RSS is not a complete measurement of GPU/unified-memory consumption. These are
one-run observations under current host load, not comparative speed or cost claims.
The 105 pairs are not independent examples: several tests repeat across projects.
Independent accuracy and local energy cost remain unmeasured.

## Coverage and smoke validation

Laya estimated four requirements covered and one partial. It selected one
downstream-error test and attributed three of four critical flows to it.
Source inspection supports **only the downstream-error flow**: it contains no
assertions for non-admin action denial or role precedence.

| Executed subset | Browser result | Critical flows supported by source | Playwright duration |
|---|---|---:|---:|
| Laya's one-test proposal | 1 passed | 1 / 4 | 3.158 s |
| Source-reviewed four-test alternative | 4 passed | 4 / 4 | 3.448 s |

The four-test alternative explicitly checks admin actions, non-admin denial,
mixed-role precedence and downstream errors. Its selection came from source
review, not from Laya. Neither subset has lead approval or a fault-retention study.
Single-run differences do not establish reliable runtime savings.

## What to improve before adoption

1. **Evidence size:** whole supporting files and repeated target code overflow the
   configured input window. Extract the reached helper methods and relevant setup
   without dropping assertion evidence; keep exclusions visible.
2. **Resolved inputs:** the generic role test uses project metadata. Supply resolved
   role bindings, or mark the case uncertain, instead of presenting identical
   evidence for different projects.
3. **Decision quality:** false full-coverage links also occurred on inputs that fit.
   Input limits therefore do not explain every error. Validate question/context
   changes on development examples, then evaluate untouched, human-labelled cases.

Keep Laya advisory. A technically passing smoke subset is insufficient when it
omits critical requirements.

## Reproduce locally

This workspace's private config, source review and generated reports are under
`artifacts/mps-validation/`; they are ignored by Git.

```bash
npm run qa -- run --config artifacts/mps-validation/config.json
```

For another team, follow [the quickstart](team-quickstart.md) and set
`provider.kind` to `laya`, `provider.device` to `mps`.

The run folder contains `index.html`, `coverage.csv`, `smoke.json`, `metrics.json`,
`validation.json`, both smoke test lists and actual browser-execution reports.
The metrics-only export retains `accuracy: null`; source-review notes stay private.
Measured subset execution is captured separately in `smoke-execution-summary.json`.
No new results were published by this validation run.

Verification: 59 evaluator tests passed, 21 full-suite browser tests passed, both
selected subsets passed, and the metrics-only export passed schema validation.
No application, framework or model-adapter source was changed; implementation-only
preview gates and fault-injection testing were not run.

## OpenAI Decisions through Codex

Codex can run a script that invokes the hosted Decisions API. The request needs
`OPENAI_API_KEY` and API access/billing; Codex subscription sign-in does not provide
API credit. The project has an optional direct API adapter in its synthetic pilot,
while the team `qa` command currently supports local inference only.

No OpenAI key was configured for this run, so no hosted comparison was attempted.
Using Codex itself to review the suite would be a separate agent baseline, not a
Decisions API measurement.

Sources: [Decisions API](https://developers.openai.com/api/docs/guides/decisions),
[subscription and API pricing](https://learn.chatgpt.com/docs/pricing).
