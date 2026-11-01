# Using the Playwright Agent

The dedicated agent uses the coding tool you already have. Its shared workflow
is [the Playwright Agent skill](../.agents/skills/playwright-agent/SKILL.md).
There is no second orchestration service or mandatory decision provider. Native
tools perform the work; the read-only portal shows the saved result last.

## Choose an entry point

| Client | Entry point |
| --- | --- |
| Codex CLI or IDE | Mention `$playwright-agent`, or select it through the skill picker. |
| Desktop skill UI | Select **Playwright Agent** from available skills; invocation controls depend on the client. |
| Copilot in VS Code | Select **Playwright Agent** from the custom-agent dropdown. |
| Codex delegated task | Ask Codex to delegate the task to the custom `playwright_agent` agent. |

The standalone harness provides `.agents/skills/playwright-agent`,
`.github/agents/playwright.agent.md`, and `.codex/agents/playwright-agent.toml`.
The combined agentic workspace has small native entry points pointing here as
well, so launching at the workspace root does not require opening a new project.
The model, permissions and available tools come from the host session. No model
or provider is overridden. The default skill remains discoverable automatically.

If a newly added skill or agent is absent from the client, start a new session
or reload the client. You can always explicitly ask the coding assistant to read
the shared skill at its exact path. Static file validation does not establish
that a particular running client has refreshed its selector.

Codex's documented custom-agent mechanism is delegation to a named subagent;
it does not establish a Copilot-style main-agent dropdown. Direct skill use
keeps the workflow in the current chat. See the official
[Codex custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
and [skills](https://learn.chatgpt.com/docs/build-skills) documentation, and
[VS Code custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents).

## Start with the task and documents in chat

Supply the ticket, epic, technical documents or RTM in the coding conversation
and identify the target project and intent. The agent uses attachments only
when the host makes their local files or text accessible. An attachment name or
link alone does not establish access to its bytes. If only text is available,
the agent can save that supplied text as a labelled text source; it does not
claim to have preserved an unavailable PDF, workbook or original export.

```text
Use $playwright-agent in my existing project for LOGIN-123.
Use the attached ticket and supporting documents to create the missing tests.
Inspect existing assertions, prepare source-linked criteria and a test matrix,
and review the proposed interpretation and questions with me in chat.
Create or strengthen only the requested missing coverage and run targeted checks.
Save the actual findings and reports, then open this task in the report viewer.
```

For an assessment that must not change tests:

```text
Use $playwright-agent to assess login coverage against the attached documents
for LOGIN-123 in my existing project.
Keep source and tests unchanged. Produce an acceptance matrix and identify the
checks that still need execution. Save the analysis, then open the report viewer.
Do not run tests or mutations in this assessment.
```

The task folder is optional when the prompt already supplies sufficient context.
Otherwise use [the task card](../.agents/skills/playwright-agent/assets/task.md).
Reports can use [the acceptance matrix](../.agents/skills/playwright-agent/assets/acceptance-report.md)
and stay under ignored `artifacts/agent-tasks/`. Requirements can be local PRD,
epic/Jira exports or plain Markdown. Keep only the relevant work item in context.
The agent does not connect to Confluence/Jira or execute document instructions
just because an exported document mentions them.

The chat-first workflow is:

1. The host agent selects only the accessible documents and prepares
   [local intake](document-intake.md) in the selected project's private task.
2. It proposes quoted criteria and ambiguities in chat, then reviews actual
   source, tests, helpers and assertions. Business requirements and
   implementation-derived observations stay distinct.
3. It records the initial matrix and makes only the requested test additions
   or changes in the same host session. Assess-only work leaves source and tests
   unchanged. Clear, authorized changes do not need repeated approval.
4. It runs authorized project checks through native tools. If behavioral
   mutation is requested, it reviews selected source-bound faults, executes the
   existing runner and retains activation, repeatability and restoration evidence.
5. It saves its analysis, matrix and fresh actual reports in the existing task
   artifact paths. Criterion/source references are retained through actual
   assertions to execution commands, reports and source/test revisions. Missing
   or skipped evidence remains explicit.
6. It launches or reuses that project's [report viewer](portal.md) last and
   returns the task URL, including for blocked or partial work. The viewer only
   inspects saved evidence and downloads. It does not prepare inputs, approve
   criteria, edit tests, run jobs or invoke another model. If browser/process
   access is unavailable, provide the artifacts and launch command without
   claiming the page was opened. Do not stop unrelated processes for a port.

The agent handles JSON, field mapping and recorded matrix cells. The tester
reviews readable criteria, references and questions. Accepting that exact
interpretation happens through chat review and the intake CLI. It remains an
explicit review action. This does not add a second
approval gate for focused test changes already requested against clear supplied
requirements. Unresolved ambiguities remain visible rather than becoming
invented policy. Private originals stay unchanged; preparing or opening a task
does not start providers or execute tests.

The [workflow validation protocol](workflow-validation.md) covers the pending
comparison of accuracy, setup effort, review cost and usability. A working
viewer or passing runtime/unit checks do not establish those workflow outcomes.

## Context ownership across the workspace and project

| Folder | Responsibility | Example |
| --- | --- | --- |
| Workspace `agent-system/skills` | Shared workflow instructions and templates. Active tasks and resolved files belong to the selected project. This agent does not require the workspace resolver. | `playwright-ui-change/SKILL.md` for the separate role-aware mockserver workflow |
| This project's `contexts` | Framework conventions and application knowledge used inside the selected Playwright project. | `app-under-test.yml`, `command-map.yml`, coverage rules and curated captures |
| This project's `contexts/tasks/<work-item>` | Private requirements and task-specific inputs for one agent request; the three reviewed `CRM-DEMO-001` synthetic files are the public example. | `LOGIN-001/task.md` and selected requirement documents |

Keep each work item's requirements in its owning project. Workspace skills
supply workflows and templates. A workspace task selecting the role-aware mockserver
does not make that project the default target for this explicitly selected
harness agent. Selecting an external adopting repository must be explicit too.
Framework templates, generated graphs and saved captures are checked against
current source; they are not automatically authoritative or fresh.

## Optional decisions and mutation evidence

The default workflow is agent-only: inspect requirements, code and assertions,
then use actual Playwright execution where requested. Code Mode, Jev, Laya and
OpenAI are optional. They are not needed to select the agent or create tests.

The internal `quality/` module supplies bounded model reviews and the
behavioral-mutation runner. Its Code Mode integration exposes those QA tools,
not a general browser or test-editing service. The agent uses it when connected
and relevant, or follows the existing CLI path. Read
[integration guidance](../.agents/skills/playwright-agent/references/integrations.md)
when requesting that stage. No global MCP connection is installed by this setup.

Keep three things separate: a model's judgment that a test covers a criterion,
the observed result of executing that test, and whether it detects a selected
activated fault. A green unrelated suite or a skipped login setup proves none
of the missing criteria. The agent reports uncertainty rather than inventing a
complete acceptance result. Publishing remains a separate `$platform-publish`
operation when explicitly requested.

## Product commands

Run `npm run qa -- help` or `npm run mutation -- help` at this repository root.
Use `npm run quality:test` / `npm run quality:typecheck` for the evaluator and
`npm test` for browser tests. Historical experiments are retained as studies
inside `quality`, not exposed as a second project. See
[the consolidation record](playwright-agent-consolidation.md).
