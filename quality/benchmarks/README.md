# Playwright Agent — evaluation fixtures and historical protocols

This directory belongs to the internal `quality/` module of Playwright Agent.
It contains evaluation fixtures and retained coverage/smoke experiment protocols;
it does not define a separate Decision Bench product or an active task context.
See [quality ownership](../README.md) and the current
[mutation evidence workflow](../docs/behavioral-mutations.md).

The [earlier experiment plan](../docs/evaluation-scope.md) proposed local Laya
versus OpenAI Decisions, with the agent + MD/skill workflow as a baseline, for
requirement-to-test coverage and smoke-suite selection. It is historical research
scope, not the required workflow or roadmap for ordinary agent tasks.

## Current state

`crm-inputs.json` and `crm-gold.json` are authored synthetic scaffold fixtures.
They exercise planning, duplication and assertion review; they are not the final
coverage/smoke dataset, and a preview supplies no measured model comparison.
Gold stays out of model evidence packets. Recorded studies retain their own
protocol and limitations; see [pilot findings](../docs/pilot-findings.md) and
[independent mutation validation](../docs/independent-mutation-validation.md).

```bash
npm run benchmark:crm:preview
```

Run this command from `quality/`. It is offline and produces no model answers.
Metrics utilities operate only on explicitly supplied reports. This preview does
not run a model, execute a campaign or publish results.

## Historical result identity and future exports

Existing feeds retain their measured values, provider labels, denominators and
historical identity. Future standard exports use the parent's unchanged
platform-publish contract and the Playwright Agent identity. Export preparation
does not authorize publication. Keep raw evidence private, report unavailable
measurements explicitly, and do not rename historical provider outputs as new
results.
