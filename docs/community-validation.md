# Playwright Agent — community validation findings

**31 October 2026 · authored synthetic CRM · Node 22.23.4 · macOS/Apple Silicon**

Playwright Agent connects a coding agent to an existing Playwright project;
the bundled CRM is supporting validation. This report intentionally publishes
only curated synthetic findings, source references and aggregate counts. Raw
logs, local paths, full MCP payloads and private work-item documents are excluded.

## What was verified

The source ZIP was installed and verified after clean extraction: **104 release
implementation tests passed**, followed by **6 browser tests passed, 0 skipped,
0 unexpected failures and 0 flaky results**. The native workflow then exercised
the existing graph pipeline, actual local MCP/Code Mode transports, two fixed
behavioral faults, restoration and source-preservation checks.

The archive contained no Git metadata, so the run recorded no observed Git
revision. A subsequent SHA256 comparison matched **all 279 source-payload files**
to [release commit `6f72c6b`](https://github.com/balajiregt/playwright-agent/commit/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9).
The archive also contained its generated source manifest; it was not counted as
a source-payload file. ZIP SHA256:
`6d6bd948526667362a4cd91591f69883b6068fee9ee22de637ba7653a79d83c2`.
These references identify the release bytes, excluding unrelated working-copy edits.

## Acceptance criteria and test matrix

The matrix below uses author-supplied synthetic criteria and coding-agent source
review, checked against that release's assertions and the recorded browser run.
It is a curated example, **not independent ground truth or a general acceptance
accuracy measurement**. Eight criteria map to six tests: seven are supported
within this bounded scope; one has a demonstrated missing assertion.

| Synthetic criterion | Released test and assertion evidence | Assessment |
| --- | --- | --- |
| [LOGIN-VALID: seeded admin reaches dashboard](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/task-template/epic.md#L6) | [Admin sign-in test](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L11-L23) → [dashboard and active-role assertions](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/assertions/sample-crm.assertions.ts#L14-L18) | Supported |
| [LOGIN-INVALID: incorrect password retains login with an error](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/task-template/epic.md#L8) | [Invalid-password test and direct assertions](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/validation-login.spec.ts#L3-L22): exact visible error, login URL/page and absent dashboard | Supported |
| [VIEWER-READONLY: banner and disabled export](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/task-template/epic.md#L10) | [Viewer scenario](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L84-L93) → [banner/disabled-button assertions](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/assertions/sample-crm.assertions.ts#L59-L63); activated fault killed twice | Supported |
| [MANAGER-ACCESS: enabled allowed and disabled restricted navigation](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/task-template/epic.md#L12) | [Manager navigation scenario](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L37-L49) → [visible/enabled/disabled/ARIA assertions](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/assertions/sample-crm.assertions.ts#L29-L49) | Supported |
| [LEAD-CREATE: required-field validation then lead creation](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/task-template/epic.md#L14) | [Sales scenario](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L25-L35) → [validation alert and created-name assertions](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/assertions/sample-crm.assertions.ts#L20-L27) | Supported |
| [OPPORTUNITY-CREATE: manager creates a named opportunity](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/task-template/epic.md#L16) | [Manager journey](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L66-L70) → [created opportunity assertion](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/assertions/sample-crm.assertions.ts#L74-L76) | Supported |
| [REPORT-RETRY: failed report becomes ready](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/task-template/epic.md#L18) | [Report retry journey](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L72-L76) → [failure/retry and ready/download-control assertions](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/assertions/sample-crm.assertions.ts#L78-L90) | Supported |
| [DASHBOARD-METRIC: open pipeline displays `$842k`](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/task-template/epic.md#L20-L25) | [Dashboard helper](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/assertions/sample-crm.assertions.ts#L14-L18) checks dashboard/role, not metric value; [fixed fault](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/fault-catalogue.json) changes the value and survives twice | Missing assertion |

**`productAccepted: false`.** A green suite does not fulfil the metric criterion.
The host coding-agent workflow can inspect a newly selected ticket, build a
matrix and edit/execute tests through its native tools. This demo does not prove
an automated arbitrary-ticket acceptance engine or the accuracy of future reviews.

## MCP audit: protocol evidence and deliberate rejections

The audit listed **27 checks: 25 true and 2 skipped**. The skipped checks were
live planning and live assessment; no Codex, Laya, Jev or other decision-model
inference was run. The true checks cover discovery, evidence/plan/packet identity,
capability boundaries, and binding returned execution to the saved campaign.

| Recorded transport events | Successful events | Expected rejected requests | Total receipts |
| --- | ---: | ---: | ---: |
| Direct MCP stdio | 8 | 3 | 11 |
| Code Mode MCP | 11 | 4 | 15 |
| Total | 19 | 7 | 26 |

The seven expected rejections were: unknown tool, disabled hosted planning and
out-of-scope frozen pair through direct MCP; unknown tool, disabled hosted
planning, read-only execution and out-of-scope frozen pair through Code Mode.
They are successful negative checks, not seven operational failures. Receipts
include connection/discovery and evidence-client operations; they are not 26
unique tools or model calls. [Released audit implementation](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/quality/src/demo/mcp-audit.ts).

## Mutation findings

Two green baselines each executed six tests. Each fault was independently
observed, then exercised by two complete suite runs in a disposable copy.

| Authored fault | Baseline → mutant observation | Repeated suite outcome |
| --- | --- | --- |
| Viewer read-only behavior removed | Banner count `1` → `0` | Killed; affected assertion failed on both runs |
| Dashboard metric changed | `$842kOpen pipeline` → `$0Open pipeline` | Survived; both suite runs passed despite the changed value |

Result: **1 killed and 1 survived out of 2 activated, conclusive faults**.
Restored baseline passed; the original source remained unchanged. These two
examples demonstrate one asserted behavior and one known gap, not a general
fault-detection rate or a model-quality comparison. [Catalogue and probes](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/examples/validation-demo/fault-catalogue.json),
[execution/classification implementation](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/quality/src/mutation/runner.ts).

## Graph and duplicate-review findings

The existing static pipeline produced **55 source nodes, 59 edges, 38 candidate
tests, 6 discovered test cases and 7 routes**. It reported **2 gaps, 0 exact
duplicate candidates and 1 overlap group**. Route-name/helper matching is
heuristic coverage; it does not establish assertion adequacy or runtime acceptance.

Manual source review examined that group's **3 tests and 3 unordered pairs**:
[sales lead validation](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L25-L35),
[manager navigation](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L37-L49)
and [viewer restrictions](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L84-L93).
All were retained: they share setup/helpers but exercise different roles,
actions and assertions. The fallback `unknown-route` grouping explains this
candidate; it is not proof of duplication. The separate released manager
journey also [asserts direct restricted-route denial](https://github.com/balajiregt/playwright-agent/blob/6f72c6b53e5a200a5f2bb9100ca1f58292048ac9/tests/sample-crm.spec.ts#L78-L81).
This coding-agent review is separate from graph output and browser execution;
it does not establish that the entire project is duplicate-free.

The findings support a bounded, reproducible community example. No performance,
token-saving, cost-saving, production-readiness or general acceptance-accuracy
claim is made. Raw evidence stays private; future real-project work requires its
own requirements, source review and execution evidence.
