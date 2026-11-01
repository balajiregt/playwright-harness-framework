# Requirement-guided behavioral mutation testing

The current independent-engine workflow is documented in
[independent mutation analysis](independent-mutation-analysis.md). The original
complementary-role pilot below remains available for reference.

**Purpose:** establish whether an existing Playwright suite catches specific,
requirement-breaking faults. Measure the application with a fault present, then
restore it and verify green. A model's opinion alone does not establish detection.

```text
Downloaded epic / PRD / Jira exports + allowed app source
                            ↓
Codex CLI → cited criteria + small, bounded fault plan
                            ↓
Local Laya → per-test detection predictions
                            ↓
Isolated app copy → green baselines → activate one fault
                            ↓
Independent observation → existing Playwright suite, twice
                            ↓
Detected / survived / unknown → restore → private report
```

Codex is the planner; Laya is a small decision model; Playwright is the execution
oracle. These are complementary roles, not a direct model-quality comparison.
The prior coverage/smoke/Jev experiments remain available as historical workflows.

## Run the sample

Install Node dependencies and the existing local model environment as described
in the [team setup](team-quickstart.md). The target repository must already have
its own Playwright dependencies and browser installed. No second browser framework
is installed here.

From the internal `quality/` package directory:

```bash
npm ci
python3 -m venv .venv                    # only if it does not exist
.venv/bin/python -m pip install -r python/requirements.txt
.venv/bin/python -m pip install -r python/requirements-artifacts.txt

npm run mutation -- context --config examples/mutation/role-aware.config.json
npm run mutation -- plan --config examples/mutation/role-aware.config.json --allow-hosted
npm run mutation -- inspect --config examples/mutation/role-aware.config.json
npm run mutation -- assess --config examples/mutation/role-aware.config.json
npm run mutation -- run --config examples/mutation/role-aware.config.json --allow-run
```

Planning uses the installed, signed-in `codex exec` CLI with a structured output
schema and read-only sandbox. It uses the CLI's default model unless `codexModel`
is set. The invocation ignores global configuration so unrelated MCP servers and
hooks are not activated. It is distinct from the model selected in a desktop chat;
the CLI does not always report its resolved model name. Usage and this limitation
are recorded in `planner.json`; actual billed cost remains unavailable. Codex
receives the explicitly selected exported text and source. Laya inference stays
local, selecting MPS if available and CPU otherwise. No Jev key is needed.

The sample uses an authored epic and Jira-like JSON plus the existing local demo.
Only its **viewer project (seven existing tests)** runs, on ports 5273/3433. No
real customer documents are bundled. [Recorded results](behavioral-mutation-validation.md).

## Use your own exports and repository

Put downloaded Confluence epics/PRDs and Jira tickets in the parent product's
ignored `contexts/tasks/<work-item>/` folder; see
[context ownership](../../contexts/README.md). Keep one coherent work item per
folder, with no nested directories. Select the existing requirements file
explicitly for `qa`; mutation imports read the selected folder via `artifactDir`.
No customer artifacts are bundled or downloaded automatically, and choosing a
folder does not start inference or a workload.

For documents prepared by [the intake workflow](../../docs/document-intake.md),
set `artifactFiles` to the exact original filenames returned by intake, alongside
`artifactDir` pointing at the private work-item folder. The optional filename
allowlist excludes generated requirements, provenance and unrelated documents.
Without it, the existing flat-folder reader still reads every non-hidden file.

Copy the sample config to `quality/mutation.config.local.json` when working
from the product root; set `repo`, `artifactDir`, `playwrightConfig`, explicit
`sourceFiles` and projects. Config-owned paths resolve relative to the config
file. For that local config, `"artifactDir": "../contexts/tasks/ABC-123"` selects
the product's `contexts/tasks/ABC-123/` folder. Recalculate the sample's relative
paths when moving its config; do not reuse paths relative to
`quality/examples/mutation/`. An explicit CLI config path is caller-relative.
Keep `examples/mutation/context` as the explicitly synthetic demonstration.

PDF with selectable text, DOC/DOCX, HTML, JSON, CSV, TXT/Markdown and XLS/XLSX with
literal values are accepted as passive exports. PDF extraction uses pypdf from
`python/requirements-artifacts.txt`; legacy DOC uses macOS textutil or antiword.
Scans require separately supplied OCR text. Formula cells, oversized/unreadable
documents and unsupported formats fail visibly. No document macros, embedded
scripts or Atlassian APIs execute. Limits are 30 regular files with no nested
directories, 10 MiB/file, 30 MiB total and 90,000 extracted context/source
characters. Split oversized scope explicitly. Original files and exact
requirement quotes are hashed and linked in the private report; conflicts and
missing acceptance criteria need review.

Every planned criterion must quote the imported text exactly. Every mutation
replaces one unique source match in an allowed application/mock file. Tests,
fixtures, dependency files and config are excluded from mutation targets. Only
one replacement is applied at a time. Any artifact/source change invalidates the
plan; changed tests or plan invalidate stored Laya predictions.

An independent probe observes an existing `data-testid` through the target
Playwright runner. It checks a count or text value. Configure a readiness signal
and, for role-dependent applications, the existing setup module/export. Projects
with a different authentication/observation interface need an explicit adapter;
the tool does not guess one. The sample reuses `mockAgentRoles`.

## Interpret evidence

- **Killed:** the fault was observed and the same assertion failed on two runs.
- **Survived:** the fault was observed and the existing suite passed twice.
- **Not activated:** the independent observation did not change; no gap inferred.
- **Invalid / inconclusive:** parse errors, unstable results, startup/timeouts,
  missing observation or restored-baseline failure; excluded from detection rate.
- **Not run:** baseline was not consistently green; no fault execution claimed.

The runner uses a disposable source copy, shares the installed dependency directory,
disables retries/server reuse, runs two green baselines and two executions per
activated fault, then restores and checks green. Test timeout defaults to five
seconds with a shorter assertion timeout; both baseline and mutant use the same
settings. Explicitly configure slower suites. This is filesystem isolation, not
an OS security boundary for untrusted application code. Only use trusted local
non-production apps with dedicated loopback servers. Monorepo/symlinked source
layouts and remote production mutation are outside this pilot.

Open the generated `index.html`. `campaign.json` retains requirements, patches,
observations, test failures and model predictions. `metrics.json` contains aggregate
counts; detection rate excludes unknowns and says nothing about all possible
faults. Laya's prediction agreement is measured against the observed test outcomes,
separately from detection rate. Incomplete model evidence is not scored.

These new artifacts are local. The existing hosted viewers/publication schemas
have not been extended to this protocol; use the self-contained HTML report.

## Try Code Mode

The same tools are available as ordinary MCP:

```bash
npm run mutation -- mcp --config mutation.config.local.json
```

Default tools: `context`, `evidence`, `inspect`, `assess`. Add `--allow-hosted`
to expose `plan`; add `--allow-run` to expose `run`. A request cannot dynamically
register another server, path or command. No global MCP config is changed.

The optional [UTCP integration](../integrations/code-mode/README.md) exposes
`interfaces` and `call_tool_chain`, letting an agent batch/filter the same MCP
results in code. The model needs to see only the compact result it returns.
This is an orchestration experiment; token or latency savings require a controlled
agent comparison and are not inferred from the external demo.
