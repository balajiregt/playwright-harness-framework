# Self-contained Playwright Agent validation demo

This demo uses only the bundled Sample CRM, synthetic requirements and the
existing framework and behavioral mutation runner. It needs no sibling
mockserver, customer documents, credentials, decision provider or model server.
The seeded demo accounts are test fixtures, not production identities.

## Setup and browser verification

From the product root, use the documented Node version, then install:

```sh
npm ci
npm ci --prefix quality
npx playwright install chromium
```

Run the complete offline validation:

```sh
npm run demo:prepare
npm run demo:verify
```

Preparation validates the bundled synthetic work item without changing task
documents. Verification includes the existing source → tests → coverage →
duplicate-analysis graph pipeline, six browser tests, acceptance evidence and
the mandatory model-free mutation checks below. It does not start providers or
publish results. `npm run demo:package` prepares the reviewed shareable archive.

For focused browser troubleshooting, use:

```sh
npx playwright test --config examples/validation-demo/playwright.config.ts
```

The dedicated config starts CRM at `http://127.0.0.1:4287`, sets the target for
existing CRM specs, and selects **six tests**: five existing example tests and
one invalid-password test. It has one Chromium project, zero retries, no
template auth-state setup and no reuse of an already running server. A busy
port fails visibly. No separate server terminal or `.env` file is required.

Expected browser evidence is six executed, passing tests with zero skips.
Actual results must be read from the generated JSON report; this README does
not claim those checks have run. Reports and failure traces remain under
ignored `artifacts/validation-demo/browser/`.

## Selected task and acceptance evidence

The tracked [CRM-DEMO-001 task](../../contexts/tasks/CRM-DEMO-001/epic.md)
contains an authored epic, synthetic tickets and normalized requirements. It is
the single shared source used by `mutation.config.json`, Git clones and the
community ZIP. `npm run demo:prepare` validates these existing files without
copying or overwriting documents. Other work items remain private and ignored;
use a separate task ID for real tickets and exports.

| Criterion | Existing demonstration evidence |
| --- | --- |
| Valid admin login | Dashboard and active-role assertions in the CRM example suite |
| Invalid password | Visible exact `Invalid credentials`, retained login URL and absent dashboard |
| Viewer read-only accounts | Read-only banner and disabled export assertion |
| Manager navigation | Enabled allowed buttons and disabled restricted buttons |
| Lead validation and creation | Required-field alert and created lead row |
| Opportunity creation and report retry | Created opportunity and report-ready assertions |
| Open-pipeline value `$842k` | **Known gap:** no value assertion in the current suite |

The six tests cover multiple criteria. A passing browser run does not prove
every requirement is covered, nor does it establish production security or
exhaustive role coverage.

## Inspect the existing graphs

The graph stage reuses this repository's existing graph scripts and interactive
HTML view. It adds no graph framework or model. It checks whether the bundled
CRM source manifest matches its adapter's current output. If stale, it generates
a replacement only in the run's ignored artifacts; it never refreshes tracked
application source or the tracked manifest. The standard ignored `graphs/`
outputs are regenerated and copied into the run snapshot.

The demo report links the run's interactive `graphs/index.html`. Beside it,
`manifest.json` records the actual command receipts, source-manifest freshness,
artifact SHA256 hashes, source/test counts, candidate gaps and duplicate/overlap
counts. A failed graph pipeline fails this validation stage. For a separate
graph-only inspection, choose a fresh ignored output directory:

```sh
node scripts/validation-graphs.mjs --output-dir artifacts/validation-demo/MY-RUN/graphs
```

These graphs discover the **whole repository**, not only the six selected demo
tests. Coverage is inferred from names, routes, roles and helper mentions;
duplicate/overlap findings are review candidates. Graphs do not establish
assertion adequacy, runtime acceptance or actual duplicate behavior. Curated
captures and adapter enrichments can also be stale independently of manifest
freshness. Keep those limitations and all reported gaps visible alongside the
browser and mutation evidence.

## Mandatory model-free mutation evidence

[The config](mutation.config.json) selects only the bundled CRM browser source
and the prepared task folder. [The fixed catalogue](fault-catalogue.json)
cites exact `epic.md` quotes. The validation orchestration binds that catalogue
to the current source and task hashes, then runs the existing mutation runner;
no planner or decision provider is required.

| Fault | Independent observation | Expected suite outcome, pending execution |
| --- | --- | --- |
| Viewer read-only behavior removed | Accounts banner count changes from `1` to `0` | Existing viewer assertion should kill the fault twice |
| Dashboard metric changed to `$0` | Metric text changes from `$842kOpen pipeline` to `$0Open pipeline` | Fault should survive twice, exposing the documented missing value assertion |

The runner uses a disposable source copy. Required evidence includes two green
baselines, an observed change for each fault, two repeatable suite outcomes,
restored green and an unchanged original source tree. Startup errors, missing
activation, unstable failures or skipped checks are inconclusive evidence.
Detailed reports stay under ignored `artifacts/validation-demo/mutations/`.

The intended surviving fault is a validation of the demonstration's ability to
expose a known test gap. It is **not** fulfilled acceptance or a claim that the
suite detects all faults. Keep its missing assertion visible in the acceptance
report. Provider comparisons and publication are separate opt-in work.
