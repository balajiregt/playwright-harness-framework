# Bring local requirements into a Playwright task

Give your coding agent the ticket, PRD, epic, Jira export or traceability matrix
in chat, identify your existing Playwright project, and state whether to create,
update or assess tests. The agent prepares source-linked criteria and reviews
ambiguities with you in chat, completes the authorized workflow using native
tools and saves its matrix/findings. It opens the read-only report viewer last,
when its tools permit. You do not need to write JSON or configure a decision model.

The host must expose each selected attachment as a local file or readable text.
The agent checks that access before claiming to read it. If only attachment
text is available, it may capture that supplied text as an explicitly labelled
text source; it must not reconstruct an unavailable binary and call it the
original. If required content is unavailable, identify the missing file while
continuing work supported by the accessible sources.

Intake preserves accessible original files unchanged, extracts addressable
segments and prepares proposed criteria. Uploaded documents are source evidence,
not instructions that authorize tool calls or external access.

Use the CLI below when documents need extraction. This does not connect to Jira
or Confluence, perform OCR, call providers, execute tests or publish data.
Extraction does not establish full understanding of your business requirements.
The [report viewer](portal.md) inspects the saved outcome; it does not upload,
edit, approve or execute anything.

Intake uses Node 22+ and Python. It prefers the toolkit's `quality/.venv`
interpreter, then system Python; `--python PATH` selects an existing interpreter.
CSV, JSON and text use the Python standard library. For PDF and Excel, prepare
the small parser environment when needed (these commands install no models):

```sh
python3 -m venv quality/.venv
quality/.venv/bin/python -m pip install -r quality/python/requirements-artifacts.txt
```

On Windows, use `quality/.venv/Scripts/python.exe` for the pip command. Existing
environments can be selected without creating another one.

## Select the project and documents

Run commands from the toolkit checkout or extracted source ZIP. `--repo` selects
the existing target project; `--task` selects its private work item. Use a real
ticket such as `LOGIN-123`, never the public synthetic `CRM-DEMO-001` task.

```sh
npm run intake -- prepare --repo "../my-existing-project" --task LOGIN-123 --goal assess --file "../downloads/login-prd.pdf" --file "../downloads/login-rtm.csv"
```

Repeat `--file` for each document to consider; input paths are relative to the
calling directory. `--task` is a work-item ID, not a directory path. `--goal` is
`assess`, `create` or `update`; it records intent and does not execute that work.
An assessment does not authorize test edits or execution. `--python PATH` selects an existing local
interpreter when a supported extraction route needs it; missing parsers are not
installed automatically.

Supported text/document inputs include PDF, Word, HTML, Excel, CSV, JSON,
Markdown and plain text. PDF/Office routes need the appropriate local parsers
from [artifact requirements](../quality/python/requirements-artifacts.txt);
legacy Word also needs an available converter. PNG/JPEG visual inputs can be
selected, but are flagged for visual review rather than silently converted to
criteria. Missing parsers, unreadable text and unsupported content stay visible
as extraction issues. Image-only input does not gain OCR through this command.
Visual-only sources remain blocking in this slice; supply a reviewed text
transcription and prepare a new explicitly scoped intake instead of clearing
the image issue in draft JSON. Linearized Word/HTML locators describe extracted
lines, not original page numbers; review tables and diagrams against originals.

Selected originals are copied into the target's ignored
`contexts/tasks/LOGIN-123/` without changing their content. Prepare checks the
target's Git metadata and refuses tracked task folders. It writes a private
`.gitignore` ending in `*` inside that work item and inside
`artifacts/agent-tasks/`, before copying originals. These markers travel with
their private directories; no task IDs are added to the target's shared root
ignore file. An existing Git repository with unreadable or invalid metadata
causes refusal rather than assuming the task is safe to import.
Conflicting existing files and symlinks cause refusal. Source hashes remain
the basis for review.
The command does not sweep downloads, other tasks or unrelated project files.
Downloaded copies receive an `input-<hash>-` filename prefix; their original
display names and byte hashes remain in provenance. Files explicitly selected
from within the task folder retain their stored names. Use returned filenames
rather than guessing paths from the original download name.

It returns a private run folder:

```text
TARGET/artifacts/agent-tasks/LOGIN-123/intake/<runId>/
  intake.json      source identities, hashes, segments and extraction issues
  draft.json       proposed criteria, source references and questions
  review.md        readable review of the current draft
  matrix.csv       requirements review matrix, not an execution result
  agent-brief.md   the host coding agent's next step
```

Keep raw documents and runs ignored. Only the existing three reviewed synthetic
CRM files have a public Git/ZIP exception; never expand it for private intake.

## Have the coding agent prepare the criteria

```text
Use $playwright-agent in my existing project for LOGIN-123.
Use the attached documents, or read the intake run's agent-brief.md and selected
source segments when intake is already prepared.
Draft source-linked acceptance criteria, flag missing or conflicting details,
inspect existing assertions and record a matrix and findings in this task.
Show me the review and questions before accepting requirements.
Keep tests and application source unchanged for this assessment.
Save the assessed result, then open the read-only report viewer.
```

Known CSV, Jira and traceability layouts can be normalized deterministically.
Other tabular layouts can use `--mapping FILE`: have the agent inspect actual
columns and generate the mapping. Testers do not have to author JSON. A mapping
identifies fields, not the truth of an expected result. Supplied test links and
status cells remain claims to inspect against actual assertions.

For an Excel workbook, ask the agent to select the relevant worksheet in the
mapping's `sources[original filename].sheet` field before extraction. For example,
select `Requirements` while leaving an unrelated `Summary` worksheet out of
scope. The selected sheet is recorded in `extraction.selection`; formulas on
unselected sheets do not block that scoped extraction. Formulas in the selected
sheet, missing selected sheets and unreadable selected content remain blocking.
Worksheet selection applies to XLS/XLSX, not PDF or CSV inputs.

For narrative PDF or document text, the host coding agent reads extracted
segments and edits `draft.json` on your behalf. Each criterion needs source
references with a source ID, segment ID and exact quotation from the segment.
Page, sheet, row or line locators are preserved where the format supplies them.
Label inferred interpretations and do not invent policy, roles or expected
outcomes to fill missing information.

Keep questions about conflicting sources, ambiguous rows, missing criteria or
poor extracted text visible. Scanned PDFs may need a better text export or
separately performed OCR; this slice does not perform OCR. Resolve business
questions with the user. A parser's blocking extraction issue cannot be removed
merely by editing a draft or marking a question resolved.

## Review and accept the exact criteria

After the agent edits the draft, regenerate the readable review:

```sh
npm run intake -- review --run "TARGET/artifacts/agent-tasks/LOGIN-123/intake/RUN"
```

`--draft FILE` selects a separate agent-edited draft. Review validates and
renders criteria, references and questions; it does not approve requirements.
Present that exact draft to the user in chat, apply corrections and rerun review after
changes. Unresolved questions and blocking extraction issues prevent acceptance.
Review also writes `review-receipt.json`, binding the intake and draft hashes.
Acceptance requires that unchanged reviewed version; editing the draft means
running review again. The receipt checks local integrity, not human identity.

Review recreates the initial source-linked `matrix.csv`. Save/review the draft
first, then have the host agent fill the recorded scenario, assertion and
assessment cells against that exact version, with proposed actions in its
analysis. Preserve the existing CSV headers and source references; runtime
remains not run until actual evidence is recorded. If the draft changes, refresh
its review and assessment instead of presenting the old findings as current.

Only after explicit user review of the exact criteria in chat:

```sh
npm run intake -- accept --run "TARGET/artifacts/agent-tasks/LOGIN-123/intake/RUN" --reviewed-by "Reviewer name" --confirm-reviewed
```

When review used `--draft FILE`, acceptance must select that same draft. The
confirmation flag records the caller's assertion, not proof of human approval.
The coding agent must not provide it before the user's review.

Acceptance validates references and original-source hashes, rejects changed
inputs, symlinks and output overwrites, and writes version-1 `requirements.json`
plus `requirements.sources.json` into the private task folder. If a selected
original already occupies the task's `requirements.json`, preserve it and write
normalized criteria as `requirements.reviewed.json`, with provenance in
`requirements.reviewed.sources.json`. The sidecar holds provenance separately so
existing strict version-1 requirements consumers retain their expected shape.

`--replace-reviewed` is an explicit exception for updating a previously generated
requirements output after another exact-criteria review. It checks ownership and
the previous output's hash and preserves the prior run. It does not permit
overwriting original documents or unrelated files. Ordinary acceptance refuses
an output collision.

Changed source material requires a fresh intake and review. Do not edit hashes,
reuse approval for different criteria or delete originals to force acceptance.

Explicit review is required to record accepted normalized criteria. It does not
create a second approval requirement for routine test edits already requested
against clear supplied requirements. Continue within the authorized scope and
keep unresolved business questions visible.

## Continue with the selected test workflow

Pass the accepted normalized file explicitly to requirements consumers; do not
assume a raw original named `requirements.json` is normalized. Follow the
[canonical agent workflow](../.agents/skills/playwright-agent/SKILL.md): inspect
the target's real tests and assertions, build the acceptance matrix, make only
requested changes and run only authorized checks.

The intake matrix does not prove coverage, execution, mutation sensitivity or
product acceptance. For explicitly requested mutation work, have the agent use
the returned configuration handoff: `artifactDir` is the private task folder and
`artifactFiles` is the exact list of stored original filenames. The agent
brief includes that selection. Generated criteria, provenance sidecars and run
outputs are not raw document inputs. The mutation loader does not implicitly
trust or discover `requirements.sources.json` as a selection manifest.

Legacy configurations without `artifactFiles` retain their existing flat-folder
loading behaviour. Use the explicit selection for an intake task instead of
assuming a mixed folder scan distinguishes originals from review metadata. The
`qa` workflow consumes the accepted requirements path returned by acceptance.

## Save the outcome, then open the viewer

After the requested source/assertion review, test changes and authorized checks,
the host agent saves its analysis and matrix in the existing private task/run
folders. Retain criterion/source quotations, actual assertion locations,
application and test/config revision references, and matching commands/reports.
Leave blocked, partial and not-run evidence explicit. Do not introduce another
artifact store for the viewer.

```sh
npm run portal -- analysis --repo "../my-existing-project" --task LOGIN-123 --run RUN_UUID --file "../my-existing-project/artifacts/agent-tasks/LOGIN-123/analysis.md"
```

`portal analysis --run` takes the intake UUID; `intake review --run` takes its
directory path. The saved analysis is bound to that intake/draft version and
displayed read-only. Its hashes do not independently establish coverage or
application/test source freshness. The host agent must inspect the relevant
revisions before recording its findings.

Attach each fresh actual Playwright JSON or behavioral-mutation `campaign.json`
once through the [viewer CLI](portal.md#save-findings-and-actual-reports), then
launch or reuse the selected project's report viewer last:

```sh
npm run portal -- serve --repo "../my-existing-project" --task LOGIN-123
```

This final inspection also applies to assess-only, failed or blocked tasks. If
browser/process tools are unavailable, return the saved artifacts and launch
command without claiming that the viewer was opened.

Keep raw runs private. Promote only reviewed reusable explanations into the
target's existing docs. Public export is a separate authorized publishing step.
