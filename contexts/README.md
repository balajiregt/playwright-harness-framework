# Context ownership

This folder belongs to Playwright Agent. Read only the context relevant to the
selected task; it is not a bundle to load into every session.

| Material | Owner and use |
| --- | --- |
| Current requirements, acceptance criteria, exported Jira/PRD documents | Select one ignored `contexts/tasks/<work-item>/` folder, or use the supplied prompt/document path. Do not commit private exports. The reviewed synthetic `CRM-DEMO-001` fixture is the explicit public exception. |
| Runtime and authentication assumptions | `app-under-test.yml`; verify against the selected target and configuration. A template is not a verified application fact. |
| Commands and artifact conventions | `command-map.yml`, `test-strategy.yml`; confirm executable commands in `package.json` and Playwright configuration. |
| Flow and agent workflow guidance | `flow-graph.yml`, `agent-loop.yml`; load for the requested workflow. |
| Source, test and coverage discovery | `source-map.yml`, `test-graph.yml`, `coverage-map.yml`, `duplication-rules.yml`; inspect current source before treating suggestions as requirements. |
| Curated page context | `capture-map.yml`, `capture-recipes.yml`, `captures/`; refresh only affected stale captures and exclude sensitive data. |
| Durable explanations and reviewed lessons | Existing `docs/`; link the authoritative source, decision and verification limitations. Do not create a parallel `knowledge/` copy. |
| Private execution and acceptance reports | Ignored `artifacts/agent-tasks/<work-item>/`, Playwright output folders, and internal `quality/artifacts/`. |

The internal `quality/` module owns evaluation rubrics, reviewed fixtures,
optional decision adapters and behavioral mutation tooling. Its
`quality/fixtures/task-preview.yml` is an **offline preview fixture**, not an
active ticket. Root `npm run quality:context` resolves that fixture only.

The bundled [CRM-DEMO-001 epic](tasks/CRM-DEMO-001/epic.md),
[synthetic tickets](tasks/CRM-DEMO-001/jira-tickets.json) and
[normalized requirements](tasks/CRM-DEMO-001/requirements.json) are tracked here
and included in the community ZIP. They are authored demonstration material;
this folder is their single source. `npm run demo:prepare` validates the fixture
without copying or overwriting documents. Only these three reviewed files are
shared; other files in that folder and all other work items remain ignored.

Keep private tickets, epics and PRDs in one selected
`contexts/tasks/<work-item>/` folder. Pass the existing requirements file
explicitly to `qa`; set mutation `artifactDir` to the selected folder, relative
to the mutation config file. For an intake task also use its returned
`artifactFiles` list of exact original filenames, so generated requirements and
source sidecars are not swept into raw context. No separate quality-module context-input folder
is needed. See [import formats and limits](../quality/docs/behavioral-mutations.md#use-your-own-exports-and-repository)
and [quality guidance](../quality/AGENTS.md). Reading context does not authorize
provider calls or workload execution.

Start with requirements, inspect authoritative source, make only the requested
change, run focused checks, and retain evidence. Promote a task discovery into a
shared context map or `docs/` only after review shows it is reusable. Record
where it came from and when source changes could invalidate it. Unknown or
implementation-derived behaviour must not become an unqualified business rule.

The workspace's shared UI resolver targets the separate role-aware mockserver;
it is not required to run this product and must not redirect this task there.

## Selected local documents

Use [document intake](../docs/document-intake.md) to copy explicitly selected
PRD/Jira/RTM files into the target project's private work item and extract
source-addressable segments. The host coding agent drafts criteria and handles
mapping/draft JSON; the user reviews the readable criteria and questions before
acceptance. Originals stay unchanged. Accepted version-1 requirements and their
provenance sidecar remain private; parser blockers cannot be approved away.

Intake run artifacts belong under the target's ignored
`artifacts/agent-tasks/<work-item>/intake/<runId>/`, not in shared maps or the
public CRM fixture. Select only relevant files; do not sweep entire task folders
or send generated review outputs to a flat raw-document loader.
Intake places private `*` ignore markers inside the selected work-item folder
and `artifacts/agent-tasks/`, without adding work-item IDs to the shared root
ignore file. Tracked tasks and unverifiable existing Git metadata are refused.
