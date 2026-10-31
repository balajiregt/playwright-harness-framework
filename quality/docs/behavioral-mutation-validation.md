# Behavioral mutation pilot — 31 October 2026

The first implementation measured **two detected faults and one surviving fault**
using seven existing tests in the role-aware sample's viewer project. The epic
and Jira-like exports are authored examples, not customer downloads.

| Criterion | Independent activation observation | Existing tests, twice |
| --- | --- | --- |
| Viewer must not see admin console | Admin action count: 0 → 1 | Detected by the role-matrix test's absent-action assertion |
| Display the correct action count | Label: 3 actions → 4 actions | All seven passed; an assertion gap |
| Display the viewer workspace title | Correct title → Viewer Workspace | Detected by the role-matrix test's title assertion |

Two baselines and the restored baseline each passed **7/7**. Each mutation ran
separately in a disposable copy. Original source was unchanged. The conclusive
campaign took **58.46 seconds** and produced an observed detection rate of **2/3**.
This describes only these three selected faults, not overall suite effectiveness.

Run ID: `e015b7b2-8124-4808-b360-c74fa3fa0eeb`.
Private artifacts: `artifacts/behavioral-mutations/<run-id>/`.

Codex CLI generated the three requirement-linked patches from exact document
quotes in **13.69 seconds**, using 17,742 input and 578 output tokens. It used
the CLI default model; no resolved model name was emitted, and actual cost is
unavailable. The plan and usage records remain local.

Laya 0.4.12, pinned revision `7b928d828b7b0e022f929d9bd2e44165aa270148`,
ran on **MPS** with PyTorch 2.15.0 / Python 3.15.2. It completed **21/21**
test/fault predictions with zero exclusions/errors in **40.09 seconds**, including
**7.52 seconds** startup. It predicted detection for every pair; only **2/21**
matched observed assertion detection. The other 19 test/fault pairs passed.
These correlated, imbalanced examples are not a general accuracy benchmark.
The result does not support using Laya to approve or skip fault execution.

The first campaign retained two inconclusive results because the assertion wait
and test timeout expired together. After giving assertions a shorter timeout,
the complete baseline/mutant/restoration sequence was rerun. Earlier artifacts
were retained; their results were not relabelled as successful detections.

The optional UTCP adapter passed both classic-versus-Code-Mode result equivalence
and an actual MCP → Code Mode → local mutation MCP round trip, reading the same
three planned criteria/faults. It was not a measured model-token-savings trial.
The default Codex CLI then successfully called the bridge's `interfaces` and
`call_tool_chain` tools in read-only mode, batching context and plan inspection
and returning three criteria/three faults in 17.13 seconds. That connectivity
check's usage record stays local; it is not an MCP-versus-Code-Mode benchmark.
The final installed root and optional dependency sets audited clean.

Verification: TypeScript checking, 72 offline/unit/integration tests, required
historical previews, and extraction of synthetic PDF/DOCX/HTML/XLSX documents.
The generated HTML was opened and inspected in a browser. No new reports were
published, no global MCP configuration was changed, and no test assertions were
added to hide the surviving fault. Legacy DOC/XLS imports are supported through
existing converters/readers but were not exercised in this pilot.
