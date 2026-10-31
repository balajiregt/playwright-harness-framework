# Playwright Decision Bench — benchmark protocol

The intended comparison is local Laya versus OpenAI Decisions, with the existing
agent + MD/skill workflow as a baseline. Two primary tasks: requirement-to-test
coverage and smoke-suite selection. See [the experiment plan](../docs/evaluation-scope.md).

## Current state

No measured comparison results. `crm-inputs.json` and `crm-gold.json` are authored
synthetic scaffold fixtures. They exercise planning, duplication and assertion
review; they are not the final coverage/smoke dataset. Gold remains local.

```bash
npm run benchmark:crm:preview
```

This is offline and produces no model answers. Metrics utilities operate only on
explicitly supplied reports. The project has no automatic live benchmark or
publication command until verified adapters and the new protocol are ready.

## Publishing

Destination: [Framework Benchmarks](https://framework-benchmarks-balaji.netlify.app/).
The dashboard lists this experiment as not yet measured. A future versioned feed
will contain only sanitized aggregates with model/protocol identity, denominators,
run conditions and failures. The current scope update publishes no model results.
Historical provider outputs are not renamed or reused as evidence for this experiment.
