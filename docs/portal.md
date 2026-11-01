# Private local Playwright workbench

The portal is the browser workbench for one selected Playwright project: agent
analysis, document intake, reviewed criteria, traceability and test evidence.
Start the task in your existing coding chat. The host agent prepares the inputs,
records its findings and continues test authoring there. The portal displays
that work and can run explicitly registered project checks; it does not start
another model or write tests. Opening it or uploading a document never executes
a suite.

It runs on loopback and keeps task data in the selected project's private local
folders. It is not hosted on the public benchmark site and needs no database,
cloud upload service or additional repository.

The CRM-style overview shows the documents → criteria → traceability → tests →
mutations pipeline, interpretation and recorded matrix charts, source-format mix,
latest imported test/mutation outcomes and provenance. Missing evidence stays
unavailable; interpretation acceptance is separate from product acceptance.

**Layout preview** opens an explicitly labelled fictional example for inspecting
the infographic layout. It stays in the browser, creates no project records,
uploads no documents and disables write/import/acceptance actions. **Exit
preview** returns to the unchanged live workspace. Preview values are never
project results or benchmark evidence.

## Expand the dashboard

Open a dashboard card's detail action or an outcome count to inspect the records
behind it. The inspector stays on the selected work item and is read-only:

- **Test outcomes:** select an imported report, filter by outcome and search its
  tests. Expand a test for its declared expected status, recorded source
  location, attempts, retries, duration and error excerpts. An expected failure
  remains an expected failure; it is not presented as a passed assertion.
- **Mutation outcomes:** select a campaign and filter its faults. Expand a fault
  for the linked criterion, fault description, independent observations,
  repeat attempts and killing-test references. Baseline and restoration summaries
  retain skipped, failed, incomplete and unavailable evidence.
- **Requirements, traceability and sources:** inspect the recorded criteria,
  source links and matrix assessments without converting them into verified
  coverage. Activity shows the recorded intake and report-import events.

Report timestamps distinguish execution time, when supplied, from import time.
Search and filters apply to the selected report, not every import. Use the
original JSON download for complete recorded detail; bounded error excerpts are
not complete logs. Different imports are not assumed to cover identical source,
test scope or acceptance criteria, so the dashboard does not infer progress
trends or an overall acceptance score from their counts.

The labelled layout preview supports the same read-only inspection with
fictional records. Close the inspector with its close control or Escape;
keyboard focus returns to the control that opened it.

## Start in chat, then inspect the task

```text
Use $playwright-agent for LOGIN-123 in my existing Playwright project.
Use the attached ticket, PDF and RTM to create the missing tests.
Inspect the existing assertions, prepare source-linked criteria, a matrix and
findings, and open this work item in the local workbench.
Then make the focused test changes and run their checks.
Show unresolved requirements before recording accepted criteria.
```

The host agent uses only attachment files or text its client actually exposes.
It preserves accessible originals and identifies unavailable content. If the
client supplies only text, a labelled text capture can become a source; it is
not presented as the unavailable original binary. See
[document intake](document-intake.md) for formats and extraction limits.

After preparing and reviewing the intake, the host agent records concrete
assertions and assessments in the run's existing `matrix.csv`, preserving its
headers and source references. It writes the readable findings in a private
analysis file and records that file for the intake UUID:

```sh
npm run portal -- analysis --repo "../my-existing-project" --task LOGIN-123 --run RUN_UUID --file "../my-existing-project/artifacts/agent-tasks/LOGIN-123/analysis.md"
npm run portal -- serve --repo "../my-existing-project" --task LOGIN-123
```

The analysis is displayed read-only and bound to the selected intake/draft
hashes. A changed draft makes the saved assessment stale. Those hashes do not
independently establish coverage or source-code freshness; the host agent must
inspect the current source and tests. Review regenerates the initial matrix,
so record assessed matrix cells after reviewing the current draft. Keep proposed
actions and unresolved findings in the analysis, and retain unknown runtime
until checks actually execute.

The agent returns the task URL and opens it only when its browser tools and
session permissions allow. It may reuse a running instance for the same project;
an occupied port does not authorize stopping an unrelated process. When tools
are unavailable, it provides the saved artifacts and launch command without
claiming to have opened the page. Test creation and changes continue in the host
chat while the workbench shows their analysis and results.

Accepting the exact requirements interpretation remains a separate explicit
review action. It does not add another approval gate to routine test work
already requested against clear requirements. An assess-only request keeps
source/tests unchanged and execution disabled unless execution is also asked for.

## Open one project directly

From the toolkit checkout or extracted source ZIP:

```sh
npm run portal -- --repo "../my-existing-project"
```

The default address is `http://127.0.0.1:8792/`. Select another local port or an
existing extraction interpreter when needed:

```sh
npm run portal -- --repo "../my-existing-project" --port 8792 --python "/path/to/python"
```

`--task LOGIN-123` selects an existing work item in the printed URL. Keep the
terminal running while using the workbench; stop it with Ctrl+C. Start
a separate instance for a different project. Do not expose it through a public
tunnel or change its binding to serve private requirements over a network.

## Manual intake is also available

1. Choose **New work item**, a private ID such as `LOGIN-123` and the intent: assess, create
   or update. The public synthetic `CRM-DEMO-001` fixture is not an intake folder
   for real requirements.
2. Upload only the relevant local PRD, epic, PDF/Office export, CSV or Jira JSON.
   Originals remain source evidence. Review extracted segments and page/sheet/
   row locators; unreadable documents and missing information stay visible.
3. Use **Artifacts** to inspect documents, then **Acceptance criteria** to review
   the proposed criteria, their exact source quotes and outstanding
   questions. Correct the draft and supply relevant worksheet/field mappings
   where needed. The host coding agent can prepare mappings and draft criteria;
   the tester need not author JSON. Extraction alone does not understand all
   business requirements, and visual-only content does not receive OCR.
4. Choose **Save & validate draft**, inspect the readable review, resolve questions and confirm the exact
   interpretation before accepting requirements. Acceptance records reviewed
   criteria; it does not mean the application or tests have passed. Changed
   criteria require a new review; parser blocking issues cannot be approved away.
   Enter **Reviewed by**, select the explicit review confirmation and choose
   **Accept reviewed criteria**. Accepted versions stay read-only; create a new
   intake version for revised sources or interpretation.
5. Use **Copy agent brief** to hand the selected task to your existing Codex or
   Copilot session. Ask that agent to inspect the project's real tests and
   assertions, then assess coverage or make the requested focused test changes.
   Work and execution remain under that session's permissions.

The portal uses the same [document-intake workflow](document-intake.md), private
ignore markers, source hashes and review rules as the CLI. Its downloads stay
local. The intake matrix starts with runtime unknown/not run; source links and
supplied RTM statuses do not establish assertion coverage. The agent must inspect
actual assertions and retain execution evidence separately.

## Enable registered execution when requested

Execution starts disabled. When the user requests checks, the host agent can
prepare a run configuration from the selected project's actual trusted files
and start the workbench with:

```sh
npm run portal -- serve --repo "../my-existing-project" --task LOGIN-123 --allow-run --run-config portal-runs.json
```

The registered JSON file lives inside that project. The following example is a
shape to adapt to inspected, existing paths and project names; omit an execution
kind that the project has not configured:

```json
{
  "version": 1,
  "playwright": {
    "config": "playwright.config.ts",
    "projects": ["chromium"],
    "testFiles": ["tests/login.spec.ts"],
    "timeoutMs": 300000
  },
  "mutation": {
    "config": "mutation.config.json",
    "plan": "artifacts/agent-tasks/LOGIN-123/mutation-plan.json",
    "timeoutMs": 900000
  }
}
```

`playwright.config` is required for Playwright; `projects`, `testFiles`, `grep`
and `timeoutMs` are optional selectors. Mutation needs both its existing config
and reviewed source-bound plan. Paths stay inside the selected project and must
be regular files without symlink path components. Project configurations are
executable project code, so register only a project you trust. The configuration
does not accept arbitrary shell commands or a browser-entered command/environment.
Timeouts are milliseconds, from 1,000 to 3,600,000; defaults are 300,000 for
Playwright and 900,000 for mutations.

**Run Playwright** and **Run mutations** show the registered scope before a run.
**Stop** cancels the owned process tree; cancellation or incomplete evidence is
not a pass. The mutation action uses the existing runner and reviewed fresh plan,
not automatic planning or a provider call. An `--allow-run` server never starts
a check merely because it is opened. Read-only assessments leave the flag off;
an authorized create/update task can include its ordinary focused verification.

After a run, only a fresh, valid machine-readable report is automatically
attached to its work item, including a valid report from a failing test process.
Missing or malformed output remains a visible run failure. Imported results and
successful jobs still do not establish that all acceptance criteria are met.

## Attach existing execution evidence

After the host coding agent runs checks through the native CLI, it registers
the fresh actual JSON result for the selected task. This makes the result
available in the workbench without asking the tester to import it again:

```sh
npm run portal -- attach --repo "../my-existing-project" --task LOGIN-123 --kind playwright --file "../my-existing-project/test-results/results.json"
npm run portal -- attach --repo "../my-existing-project" --task LOGIN-123 --kind mutation --file "../my-existing-project/artifacts/mutations/RUN/campaign.json"
```

These commands attach evidence; they do not execute Playwright or mutations.
`--file` is caller-relative. The agent checks the report's freshness and actual
execution scope before attaching it. Reports already autoattached by portal
jobs are not attached again. The agent updates saved analysis and matrix runtime
cells only where matching evidence supports them, then refreshes the selected
portal's reports while preserving unsaved criteria edits. If refresh would
discard an unsaved draft, keep those edits and defer refresh until it is safe.
An unavailable browser is reported with the task URL and attached report paths.

Manual imports remain available through **Test reports** or **Mutation reports**
and **Import report**. File paths are explicit local selections. Supported views
preserve the imported report's recorded results and limitations:

| Report | What the workbench can show | What it does not establish |
| --- | --- | --- |
| Playwright JSON reporter output | Recorded tests/projects, expected and unexpected outcomes, skips, flaky outcomes, durations and errors where supplied. | That this is a fresh run, that every criterion maps to an assertion, or that a green suite fulfils all acceptance criteria. |
| Playwright Agent behavioral-mutation `campaign.json` | Baselines, fault outcomes, independent observations, killing-test references, restoration and source-preservation fields. | A new campaign, universal fault sensitivity, model accuracy or product approval. |

Import the actual machine-readable report rather than an HTML report, screenshot,
test-list response, mutation plan or arbitrary JSON. Unsupported structures must
remain errors rather than being displayed as passing results. A report attached
to a work item still needs a source/scope review before it can support a specific
criterion. Preserve unknowns and incomplete evidence.

## Find the existing reports

The selected project's reporter configuration is authoritative. In the bundled
harness, [Playwright configuration](../playwright.config.ts) writes JSON to
`test-results/results.json`, HTML to `playwright-report/`, and runtime artifacts
to `test-results/`. An adopting project may use different reporter paths; attach
its actual JSON output instead of assuming this layout.

The custom mutation runner writes `campaign.json`, `metrics.json` and
`index.html` under `<configured output>/<runId>/`. `output` defaults to
`artifacts/mutations` relative to the mutation configuration file. The portal
imports **`campaign.json`** for detailed fault evidence; the sanitized
`metrics.json` export does not contain the same detail. The self-contained demo
keeps its own private run tree under `artifacts/validation-demo/`.

Private workbench records and intake runs belong under the selected project's
ignored `artifacts/agent-tasks/<work-item>/`; originals and accepted requirements
remain in its private `contexts/tasks/<work-item>/`. Downloading or attaching a
report does not publish it. Public metrics still use a separate explicitly
authorized publication workflow.
Attached report records are stored under
`artifacts/agent-tasks/<work-item>/portal/reports/`; originals are available through
their registered download links. The workbench serves documents as downloads,
not executable HTML pages. Select at most 30 source documents, at most 10 MiB
each and 30 MiB total; an attached JSON report is limited to 5 MiB.

## Which mutation tool is being used?

The current runner is this project's own
[TypeScript/Node implementation](../quality/src/mutation/runner.ts), using
Playwright for execution and independent probes. It applies an explicitly
selected, source-bound behavioral fault in a disposable copy, checks activation,
repeats the suite and checks restoration. TypeScript parses changed source as a
validity check; it is not an automatic catalogue of AST mutation operators.
See [behavioral mutation guidance](../quality/docs/behavioral-mutations.md).

No Stryker dependency is declared in the root or `quality/` manifests/lockfiles,
and `@stryker-mutator/core` is not resolvable from the toolkit, quality module or
optional Code Mode integration in the reviewed installation. The portal adds no
mutation library and runs no campaign as a side effect.

StrykerJS is a separate JavaScript/TypeScript mutation-testing framework. Its
[instrumenter parses and transforms an AST](https://github.com/stryker-mutator/stryker-js/blob/master/packages/instrumenter/src/instrumenter.ts),
and its [supported mutators](https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/)
include boolean, conditional, equality and arithmetic changes. Its source uses
the [Apache-2.0 license](https://github.com/stryker-mutator/stryker-js/blob/master/LICENSE).

| Current behavioral faults | Possible future StrykerJS use |
| --- | --- |
| Selected requirement-linked changes such as removing a read-only banner, with an explicit activation probe. | Generated code-operator mutations across a bounded source set. |
| Existing end-to-end Playwright journeys and repeatable fault outcomes. | A complementary unit/component assertion-sensitivity experiment using a supported test runner. |
| Results stay in the existing campaign schema. | Its own mutation results and denominator; do not relabel them as behavioral campaign results. |

The official [runner plugin list](https://stryker-mutator.io/docs/stryker-js/plugins/)
includes Jest, Vitest, Mocha and others, but does **not** list a native Playwright
plugin. Its [generic command runner](https://stryker-mutator.io/docs/stryker-js/configuration/#testrunner-string)
can invoke a test command, but lacks the coverage/test-selection optimizations
of integrated runners. Using that route for Playwright would require a separate
setup and feasibility check; it has not been implemented or verified here.

**Decision, reviewed 1 November 2026:** keep the current behavioral runner for
this workflow. Consider Stryker only as an explicitly scoped future complement
for suitable unit/component tests. Do not install it automatically, replace the
existing Playwright framework or treat library-generated mutants as independent
business acceptance criteria.
