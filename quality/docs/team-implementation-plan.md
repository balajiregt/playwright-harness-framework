# Team evaluator implementation

Outcome: point a local command at a Playwright repository and structured requirements;
produce a private requirement/assertion matrix and draft smoke proposal; publish only
validated aggregate metrics. Existing synthetic pilot remains reproducible.

1. Import JSON/XLS/XLSX/DOCX/DOC into one strict requirement schema. Reject duplicates,
   ambiguous structure and oversized inputs. Verify with real format fixtures.
2. Collect the repository's actual Playwright test list using its installed runner;
   gather bounded local source/helper evidence and optional execution history. Evaluate
   each requirement/test pair with local Laya or Qwen (Ollama or llama.cpp). Missing,
   failed or oversized evidence remains unknown. Verify collection and provider seams.
3. Generate private JSON/HTML/CSV coverage and smoke artifacts. Use deterministic
   dependency/budget selection over model suggestions; mark every proposal unapproved.
4. Export a closed, numeric aggregate schema. Dashboard imports metrics locally and
   reads a GitHub result index. Explicit publishing uses the operator's GitHub access;
   no source or requirement text reaches that boundary. Test rejection of extra fields.

Validation: meaningful importer/collector/provider/selection/export tests, existing
project gates, local smoke test of the CLI, a bounded real-model run, dashboard tests,
and a rendered dashboard check. No automatic test tagging or release approval.
