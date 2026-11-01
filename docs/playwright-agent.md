# Using the Playwright Agent

The dedicated agent uses the coding tool you already have. Its shared workflow
is [the Playwright Agent skill](../.agents/skills/playwright-agent/SKILL.md).
There is no second orchestration service or mandatory decision provider.

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

## Give it a task

```text
Use $playwright-agent to create tests for login in this harness.
Read the requirements in contexts/tasks/LOGIN-001/.
First map the criteria to existing assertions, then create or strengthen only
the missing coverage, run targeted verification, and report unresolved gaps.
```

For an assessment that must not change tests:

```text
Use $playwright-agent to assess login coverage against contexts/tasks/LOGIN-001/.
Keep source and tests unchanged. Produce an acceptance matrix and identify the
checks that still need execution. Do not run tests in this assessment.
```

The task folder is optional when the prompt already supplies sufficient context.
Otherwise use [the task card](../.agents/skills/playwright-agent/assets/task.md).
Reports can use [the acceptance matrix](../.agents/skills/playwright-agent/assets/acceptance-report.md)
and stay under ignored `artifacts/agent-tasks/`. Requirements can be local PRD,
epic/Jira exports or plain Markdown. Keep only the relevant work item in context.
The agent does not connect to Confluence/Jira or execute document instructions
just because an exported document mentions them.

For downloaded PRDs, Jira/RTM exports, spreadsheets or narrative documents, use
[local document intake](document-intake.md): select the target project and files,
have the current coding agent draft source-linked criteria, review its readable
matrix/questions, then explicitly accept the exact criteria. The agent prepares
mapping/draft files; the tester does not write JSON. Extraction and normalized
requirements do not establish business understanding or test coverage. Private
originals remain unchanged and intake does not start providers or execution.

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
