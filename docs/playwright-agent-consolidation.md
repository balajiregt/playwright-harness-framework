# Playwright Agent: one product

## Ownership

The renamed `playwright-agent` repository is the canonical
**Playwright Agent** product. Its established directory stays
`qa-projects/Playwright Agentic Framework` in the workspace.

| Capability | Owner |
| --- | --- |
| Requirements/context, task routing, acceptance matrix | Native agent skill and project contexts |
| Test creation/update, fixtures, page objects, captures and graphs | Existing framework layers |
| Coverage assessment, decision adapters, mutation execution and reports | Internal `quality/` module |
| Prior provider comparisons and synthetic pilots | Historical protocols, fixtures and study documents inside `quality/` |
| Public aggregate presentation | Build with Balaji platform, with legacy feed identities retained |

Parent `contexts/` remains the framework/task input location. The imported
`quality/contexts/task.yml` is only a historical offline-preview fixture; actual
mutation configs reference the selected requirement documents.

The `quality/` directory is a dependency-isolated internal package, not a second
Git repository or user-facing product. Root `qa`, `mutation`, `quality:*`
commands are the supported product entry points. Supplied file paths retain
caller-relative semantics. `npm test` remains the browser suite, while
`npm run quality:test` checks evaluation behavior without invoking paid models.

## Source and history preservation

Imported from the local `playwright-decision-bench` working tree on 31 October
2026, including its uncommitted mutation/Code Mode work. Committed source
revision: `12e95f2f949cd4074baf3f82ad3598bb7a750783`.

The full source Git history was fetched into this repository as branch
`archive/playwright-decision-bench-20261031`, without resetting or committing
the product's working tree. It preserves the original historical paths; the new
`quality/` paths are imported working files. The original checkout and local
changes remain intact as a compatibility/archive location. It is removed from
active workspace product registration and its operational npm scripts forward
to this repository. Direct invocation of its old source is historical only.

A source snapshot, Git bundle and per-file import hashes are retained privately
under workspace `artifacts/playwright-agent-consolidation-20261031/`. No
node_modules, virtual environment, auth files, model cache or generated campaign
was imported. Existing private results remain at their original locations.
The original working README is retained as `quality/docs/legacy-decision-bench-readme.md`.

## Compatibility and deliberate changes

- Existing evaluator source interfaces and closed metric schemas are retained.
- The role-aware fixture configuration resolves its selected external demo from
  the new module location. The synthetic integration test uses the parent
  product's Playwright dependency, so it also runs in a standalone clone.
  Neither check claims to validate the CRM login flow.
- Historical result branches, project IDs and old public URLs remain valid.
  Legacy `qa publish` keeps its schema-specific destination; use the standard
  export path for new parent-product metrics, with publication separately authorized.
  The platform groups the legacy decision-bench identity under Playwright Agent.
- New standard exports use project ID `agentic-playwright` and the parent
  repository's platform-results branch. Preparing an export does not publish it.
- Node 22 is required for the installed native Code Mode build. Python document
  import and local inference remain separately configured optional runtimes.
- No benchmark campaign, hosted inference, global MCP connection, hook
  installation or result publication is part of this migration.

## Verification

Run module typecheck/tests and its required offline previews, root framework
typecheck, CLI forwarding checks, workspace layout checks, skill validation,
and platform tests/build. Actual results and any skipped gates are recorded in
the private delivery report under the workspace migration artifact directory.

## Canonical repository

The product repository is `balajiregt/playwright-agent`, renamed from
`balajiregt/playwright-harness-framework`. The workspace folder stays at
`qa-projects/Playwright Agentic Framework`; registry IDs and historical result
identities remain stable. Benchmark publication is manual-only; publishing this
source migration does not start a benchmark campaign. The root Node version
retains the upstream security baseline. Use Node 22 for the optional Code Mode
native integration, rebuilding it explicitly for the selected Node runtime.
