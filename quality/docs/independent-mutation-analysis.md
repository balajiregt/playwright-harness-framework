# Independent mutation-analysis engines

**Purpose:** compare two independently selectable analysis paths against measured
Playwright assertion detection. This standalone project takes a repository,
artifact directory, Playwright config and fault catalogue; the role-aware sample
is the first benchmark fixture, not a required framework dependency.

```text
Downloaded artifacts + existing tests + predefined behavioral faults
                                  ↓
                  Freeze one evidence catalogue
                       ↙                    ↘
          Code Mode → local Laya     Codex agent → Code Mode
                       ↘                    ↙
                 Independent detection predictions
                                  ↓
       Shared isolated Playwright execution of the same faults
                                  ↓
       Private comparison report → shared platform aggregate contract
```

## Two paths, one packet definition

- **Laya:** the framework's deterministic orchestrator retrieves each packet
  through Code Mode, then calls Laya's Python SDK. Laya is itself a trained
  decision model; it needs neither llama.cpp nor Qwen. Its pinned weights run
  through PyTorch on MPS or CPU. The first download is cached locally.
- **Codex:** one signed-in CLI invocation per pair reads the same packet through
  the actual Code Mode MCP server. It returns a decision and packet hash. The
  invocation cannot query another pair or access execution/results tools.
- **Other agents:** use the same frozen-packet MCP contract and import their
  hash-bound decisions. Imported results are labelled externally supplied;
  uninstrumented time, tokens and probabilities remain unavailable.

The first comparison uses a fixed catalogue. Codex fault generation is an
optional authoring aid, not a prerequisite for running Laya. Both paths receive
the same criterion, exact artifact quote, patch, target test, supporting code,
uncertainties, rubric and three choices: `detected`, `missed`, `needs_judgment`.
Provider message wrappers, CLI instructions and tokenization differ. This is a
workflow comparison, not an isolated inference benchmark.

## Run the example

Use Node 22 for the optional native Code Mode integration. Follow
[model/artifact setup](behavioral-mutations.md) and install the integration:

```bash
npm ci
npm ci --prefix integrations/code-mode

npm run mutation -- freeze --config examples/mutation/role-aware.config.json \
  --catalogue examples/mutation/fault-catalogue.json
```

Use the printed immutable `workload.json` path:

```bash
# Local model only; no Codex planning or hosted analysis required.
npm run mutation -- compare --config examples/mutation/role-aware.config.json \
  --workload /path/to/workload.json --engines laya --allow-run

# Same inputs, independent engines, one shared execution campaign.
npm run mutation -- compare --config examples/mutation/role-aware.config.json \
  --workload /path/to/workload.json --engines laya,codex --allow-hosted --allow-run
```

Select `--engines codex` for the agent-only path. `--allow-hosted` authorizes
sending selected frozen evidence to the signed-in Codex provider. It does not
enable Jev or the Decisions API. `--allow-run` explicitly executes the local
mutation campaign. Without execution or a compatible `--campaign campaign.json`,
the report contains predictions and unavailable quality measurements.

`analysis.codeModeNode` optionally selects the Node executable for the Code Mode
server. `analysis.scope` is `local` by default; the authored sample is explicitly
`synthetic`. Copy the example config to `mutation.config.local.json` for your own
repository. Preserve your target runner, setup helpers and source ownership.

Freezing hashes artifacts, the plan, test evidence and repository source. It
records every test/fault pair, including non-runnable exclusions. Source/config
changes require a new freeze. No required content is silently truncated; Laya
capacity failures are exclusions. Three consecutive provider errors stop further
requests while retaining all unassessed pairs.

## Interpret the report

`comparison.json` and `index.html` show per-pair predictions, observed assertion
failures, uncertainty, probabilities where provided and the exact input packets.
Playwright uses two green baselines, independent activation observations, two
mutant runs and restored green. The original tests and checkout stay unchanged.

Common-pair quality uses outcomes assessed by every selected engine on identical
packets. Whole-provider completion and comparable-pair quality are reported
separately. An uncertain prediction against a known runtime outcome remains in
the agreement denominator; abstention does not improve the score by vanishing.
Unknown execution/evidence has no accuracy result. False detection claims identify
predictions that a test catches a fault when it actually passed.

These are selected, correlated test/fault cases with class imbalance. Most
existing tests may legitimately be unaffected by a particular fault. Do not infer
overall requirement coverage or release readiness from a single match rate.
Codex latency/tokens include CLI and tool orchestration; caching is separate.
Actual API spend, GPU peak memory, energy and review effort remain unavailable.

To add results without rerunning an existing engine, use `--previous comparison.json`
with a different engine. Reuse of execution requires exact repository, plan and
configuration bindings; older unbound campaign files are not accepted.

## Use another agent

Start the Code Mode server with `--workload /path/to/workload.json`; it exposes
`interfaces` and `call_tool_chain`. Inside the sandbox, read
`qa.analysis_packet({pairId: "pair ID from workload.json"})`.
The underlying MCP exposes only `analysis_packet`; there are no mutation-execution,
freeform repository, result or provider-comparison tools in this assessment scope.

Save the agent's decisions in this format:

```json
{
  "engine": "my-agent",
  "model": "your recorded model identity",
  "workloadHash": "hash from workload.json",
  "cells": [
    {"pairId": "pair ID", "packetHash": "packet hash", "decision": "missed"}
  ]
}
```

Import with `compare --engines none --imports /path/to/results.json` plus the
usual `--workload`, `--config` and explicit execution/campaign flags. Missing
predictions remain unassessed. Imports cannot impersonate the built-in Laya or
Codex identities. A new public engine metric requires corresponding reviewed
definitions in your publication policy, not a new platform schema.

## Standard benchmark publication

This project bundles the platform's existing
[`platform-publish` skill](../.agents/skills/platform-publish/SKILL.md), unchanged,
from platform commit `4ad9d1055c9b093b652ba081fbeb6e9ec994f5f1`.
All manifest checksums match version 1.0.0. The adapter maps real report values to
its standard contract; it does not create another result-feed format.

```bash
npm run benchmark:export -- --report /path/to/comparison.json \
  --policy .platform-publish.json
```

This prepares and validates `prepared-metrics.json` next to the report. Existing
exports are not overwritten. Publication is separate, after review and explicit
authorization of the exact public payload and repository:

```bash
npm run platform:publish -- validate --config .platform-publish.json \
  --input /path/to/prepared-metrics.json
npm run platform:publish -- publish --config .platform-publish.json \
  --input /path/to/prepared-metrics.json --confirm-publication
```

The shared destination is `platform-results/metrics.json` in your policy's public
repository. It uses existing Git sign-in. Raw artifacts, patches, prompts and
private reports never enter this export. Unknown measurements remain null.
Our example policy is synthetic and names this public project; teams must author
their own reviewed policy before sharing their results. The local platform
registry entry is prepared; this change does not deploy a route or publish a feed.

[Recorded first comparison](independent-mutation-validation.md).
