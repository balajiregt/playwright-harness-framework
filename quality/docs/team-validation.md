# Team workflow validation — 20 October 2026

This checks integration, not adoption readiness or model accuracy.

For the subsequent run against 21 actual browser tests, see
[Laya MPS validation](mps-validation.md). It records input-window exclusions,
unsupported coverage links and execution of the proposed smoke subset.

- Imported the same two criteria from real JSON, XLS, XLSX, DOCX and DOC files.
  DOC was converted with macOS textutil; Linux antiword is configured in CI.
- Discovered and executed a three-test synthetic Playwright fixture using an
  existing repository's installed runner. Recorded first-attempt outcomes and durations.
  The fixture uses Playwright assertions; it does not launch a browser or exercise an app.
- Ran all six requirement/test pairs locally through Qwen3-4B on llama.cpp and
  pinned Laya on MPS. Both completed six valid decisions without provider errors.
- Qwen labelled the two intended assertion matches covered and four unrelated
  pairs uncovered. Laya labelled three pairs covered and three partial, including
  an incorrect cross-requirement match. Its one-test smoke proposal consequently
  needs correction. No accuracy or approval claim is published from these checks.
- Excluded sibling test declarations from model evidence after an earlier run
  exposed context contamination. A regression test preserves shared hooks while
  removing unrelated test assertions.
- The installed Qwen GGUF contained a thinking-only template. Verified llama.cpp
  with Qwen's official template, thinking disabled and its OpenAI-style nested JSON
  schema format. The quickstart covers this setup; unsupported templates fail early.
- Verified only closed-schema aggregate metrics reach the result branch. Source,
  requirements, raw answers, per-test evidence and execution history remain private.

Live integration run IDs: Qwen `8edcfe60-9025-4696-88cd-93f9beed89f3`;
Laya `6b498168-8e5e-4871-b4b8-091b40cc324d`. Both are labelled
`synthetic-fixture` in the shared metrics feed. They are not comparable speed trials:
local host load differed and each provider ran once.

Checks: TypeScript typecheck; 59 evaluator tests; context resolution and all existing
preview commands; dashboard tests and build; desktop/narrow rendered panel checks.
The team Ollama request/parser has offline tests; the new team command's live Qwen
check used llama.cpp. Existing pilot Ollama evidence is a separate experiment.

Remaining evaluation work: representative team repositories, independently reviewed
requirement links, repeated history, real browser smoke execution and fault-retention
checks. Estimates do not establish runtime savings or release safety.
