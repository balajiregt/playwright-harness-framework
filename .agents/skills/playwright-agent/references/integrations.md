# Optional decision and mutation integrations

These stages extend the selected task; they are not prerequisites for writing
tests. Do not install providers, connect global MCP servers, change model
configuration, rerun a benchmark or publish as a side effect.

## Use the product's quality module

The selected Playwright Agent repository owns `quality/`. Read `quality/AGENTS.md`
and the relevant guide there. Use root `npm run qa` and `npm run mutation`
commands; no separate evaluator repository or copied runner is required.

- Behavioral execution: `quality/docs/behavioral-mutations.md`.
- Independent engine comparison: `quality/docs/independent-mutation-analysis.md`.
- Code Mode: `quality/integrations/code-mode/README.md`.
- Team review: `quality/docs/team-quickstart.md` and
  `quality/docs/jev-laya-comparison.md`.

The synthetic role-aware sample remains a fixture, not validation of the selected
CRM/team login flow. Configure the actual repository, allowed app source,
requirements, projects, readiness and an independent observation adapter. Keep
original tests and working source unchanged during fault execution.

## Decide whether a model adds value

Start with the coding agent plus source/assertion evidence. An optional decision
call can classify an ambiguous criterion/test pair or review a suspected duplicate.
Provide the actual relevant test bodies, helpers, role/state and requirement—not
just names. Keep an insufficient-evidence outcome available.

For Jev/Laya, reuse the existing team comparison interface when applicable:

```text
npm run qa -- compare --providers laya,jev --allow-hosted --config <selected-config>
```

Run from the Playwright Agent product root. Inspect that CLI's current help
and configuration first. `--allow-hosted` sends selected evidence to TypeSafe;
use it only when that provider and disclosure have been authorized. A CLI flag
does not itself establish authorization. Ordinary task execution does not require
a hosted provider. Local Laya still consumes local compute when explicitly run.

OpenAI is another optional structured-decision provider. Verify the current
official interface and configured adapter before calling it; historical pilot
labels are not proof of current compatibility. Never treat formatted output or
a probability threshold as accuracy, calibration or acceptance proof. Reviewed
labels and observed execution outcomes are distinct evaluation evidence.

## Use Code Mode only for its exposed tools

If the existing QA Code Mode server is connected, read `interfaces`. Its mutation
profile exposes a bounded catalogue such as `qa.context`, `qa.evidence`,
`qa.inspect`, `qa.assess`, with planning/execution available only in enabled
profiles. Workload profiles can expose only `qa.analysis_packet`; do not assume
the mutation catalogue is also present.

Batch context/plan reads and compact filtering where the catalogue supports it.
Read-only inspection must not call `assess`, which runs local inference. Keep
dependent planning, inspection and execution ordered. There is no guarantee of
token or latency savings from using Code Mode.

When no server is connected, use the existing equivalent CLI operations. From
the Playwright Agent product root:

```text
npm run mutation -- context --config <selected-config>
npm run mutation -- inspect --config <selected-config>
npm run mutation -- run --config <selected-config> --allow-run
```

`context` and `inspect` read context/an existing valid plan; `run` requires a
valid plan and explicit execution scope. If no plan exists, prepare and validate
one using the existing runner's documented workflow. Hosted planning needs its
own authorization; do not silently enable it. Code Mode need not be connected
for the CLI fallback. Never register it globally just to complete a task.

## Interpret fault execution

Use disposable application copies and the runner's green baselines, independent
fault activation observation, repeated test execution and restored-green checks.
An activated fault that the suite repeatedly fails on is killed; one it
repeatedly passes on survived. Unactivated faults, startup failures, flaky
outcomes and missing probes are inconclusive, not detected bugs or coverage gaps.
Do not generalize a selected fault catalogue to all possible defects.

Keep model predictions separate from these observed results. Preserve local
reports. Public exports, if later requested, use `$platform-publish` and its
existing closed contract; this agent does not automatically publish them.
