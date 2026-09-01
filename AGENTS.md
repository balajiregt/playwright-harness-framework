# Playwright Agentic Framework Instructions

## Project Intent

This project is an isolated prototype for an enterprise Playwright agent
harness. It standardizes AI-assisted Playwright UI automation for Copilot,
official Playwright Test Agents, the global `@playwright/cli` agent CLI, and
normal Playwright test-runner workflows.

The framework must allow coding agents to create, debug, refactor, and verify
Playwright tests by using captured page context, repository context, terminal
output, `playwright-cli` commands, `npx playwright test` commands, reports,
traces, screenshots, videos, and logs. Do not assume access to MCP browser
tools, live browser-control tools, or organization-blocked agent integrations.

This harness is not a replacement for official Playwright planner, generator,
and healer agents. If a team has access to those agents and MCP, they may use
them. This project still controls team conventions for context, file placement,
fixtures, page objects, assertions, tags, evidence, and review gates.

Keep this project self-contained inside `qa-projects/Playwright Agentic Framework`.
Do not couple framework instructions, tests, fixtures, or examples to any other
workspace project unless the user explicitly asks for integration.

V2 adds source-aware graph intelligence. When application source is available,
use `contexts/source-map.yml`, `contexts/test-graph.yml`,
`contexts/coverage-map.yml`, `contexts/duplication-rules.yml`, and the
`npm run graph:*` scripts to identify possible tests, existing coverage,
duplicate risks, and gaps before creating broad new tests.

The source graph consumes a source manifest contract; it must not be hardwired
to the sample CRM app. This repo includes `scripts/source-adapters/sample-crm.mjs`
only as a demo adapter. The common generic scanner at
`scripts/source-adapters/generic-source.mjs` can create a first-pass manifest
from common React, Next, Angular, Vue, HTML, Spring Boot, and .NET source
patterns. For higher precision, teams may provide their own manifest generator
through `SOURCE_MANIFEST_COMMAND`, or their own adapter through
`SOURCE_MANIFEST_ADAPTER`, so routes, auth, roles, actions, states, and test IDs
come from the actual application source model.

V3 adds capture workflows. When a user asks for tests by role or flow, prefer
the capture workflow over asking the user to run individual `playwright-cli`
commands. Read source or manifest context, generate or update
`contexts/capture-recipes.yml`, run the narrowest workflow, and use the curated
captures as reusable page context for test generation and healing. Internally,
capture workflows are stored as YAML recipes for compatibility with existing
commands and scripts.

The demo CRM app under `examples/sample-crm-app` is an example target only. The
harness must remain usable without it.

## Operating Model

Agents work through a repeatable observe-plan-act-verify loop:

1. Read these instructions and any project-local context files.
2. Check whether MCP-enabled official Playwright Agents are available and
   allowed for the current environment.
3. If MCP is available, use official Playwright planner/generator/healer
   capabilities for exploration or repair while keeping all output inside this
   harness's standards.
4. If MCP is unavailable or blocked, use the CLI evidence path: capture workflows,
   curated `playwright-cli` snapshots, screenshots, and test-runner artifacts.
5. Inspect curated page captures under `contexts/captures/` when they exist.
6. Inspect the existing Playwright config, tests, fixtures, page objects,
   assertions, helpers, and test data before changing anything.
7. Build a small hypothesis from code and evidence.
8. Use a capture workflow, or direct `playwright-cli` commands for one-off
   exploration, when page context is missing or stale.
9. Run targeted `npx playwright test` commands to verify executable tests.
10. Analyze terminal output, traces, screenshots, videos, reports, and logs.
11. Make the smallest framework-aligned change.
12. Rerun focused verification.
13. Report changed files, commands run, evidence reviewed, skipped gates, and
   any remaining risk.

Do not skip from a failing symptom directly to a broad rewrite. Let evidence
from the CLI and artifacts drive each change.

## Context Layers

Use context in this order:

1. Project rules: this file and `.github/copilot-instructions.md`.
2. Current task context: user request, issue description, failing command, or
   acceptance criteria.
3. App-under-test context: base URL, environment, auth model, test users,
   feature flags, backend dependencies, and seeded data.
4. Capture context: curated `playwright-cli` YAML snapshots and screenshot
   notes under `contexts/captures/`.
5. Playwright command map: package scripts, `playwright-cli` exploration usage,
   `npx playwright test` usage,
   project names, grep/tag conventions, reporters, trace settings, and artifact
   directories.
6. Framework conventions: tests, page objects, action helpers, assertion
   helpers, fixtures, test data builders, API/request helpers, and custom
   matchers.
7. Evidence artifacts: Playwright HTML reports, traces, screenshots, videos,
   console logs, network logs, and test output.

Use these project-local context files before fuzzy search:

- `contexts/app-under-test.yml` for runtime, auth, and app assumptions.
- `contexts/command-map.yml` for canonical CLI commands.
- `contexts/test-strategy.yml` for tags, coverage strategy, and artifact rules.
- `contexts/flow-graph.yml` for prompt-to-spec-to-test ownership.
- `contexts/agent-loop.yml` for planner, generator, healer, and reviewer states.
- `contexts/capture-map.yml` for `playwright-cli` capture naming, freshness, and
  reuse rules.
- `contexts/source-map.yml` for source-aware graph discovery when source access
  is available.
- `contexts/test-graph.yml`, `contexts/coverage-map.yml`, and
  `contexts/duplication-rules.yml` for V2 coverage and duplicate analysis.
- `contexts/captures/` for curated page/flow snapshots.

Prefer exact paths and commands from those files over fuzzy search.

When source access exists, refresh or check the manifest before graph-driven
planning, broad test creation, and capture workflow generation:

```bash
npm run source:manifest
npm run source:manifest:check
npm run source:manifest -- --root=path/to/app --output=source-manifest.json --url=http://localhost:3000 --name=my-app
npm run source:manifest:crm
```

Project scripts for tests, graph view generation, and capture workflow
generation refresh the sample manifest automatically. External teams should
use `npm run source:manifest` with their own source root when no manifest
exists, then wire the same command to their own manifest producer if they need
exact app semantics. Do not change harness graph consumers for each app.

Treat generic scanner output as baseline discovery. Before generating capture
workflows for business-critical flows, review and enrich auth, roles, dynamic
states, seeded data, feature flags, and intended workflow coverage from source,
existing tests, captures, and graph gaps.

## Prompt Mode Router

For prompts such as `create tests for manager role flow`, choose the operating
mode before collecting page context:

1. Check whether MCP-enabled official Playwright Agents are available and
   allowed.
2. If yes, use the official planner/generator/healer path for live exploration
   or repair.
3. Apply this harness's conventions for specs, fixtures, page objects,
   assertions, test data, tags, captures, graph checks, and review gates.
4. Verify through project-local Playwright commands from `package.json`.
5. If MCP is not available, use source or manifest context to create or update
   capture workflows, run the narrowest workflow, then generate or heal tests from
   curated CLI evidence.

## MCP-Optional Rule

This framework must not require MCPs, but it can coexist with MCP-enabled
Playwright Agents.

Agents may not assume they can inspect a live browser through MCP, click through
an MCP-controlled session, or rely on MCP-only page state until MCP access has
been confirmed for the current project and environment. Use `playwright-cli`
captures, `npx playwright test`, trace viewer artifacts, screenshots, videos,
test output, and repo files as the fallback source of truth.

If a task would be easier with MCP, still provide a CLI-based workflow. If the
CLI evidence is insufficient, state the missing evidence and add a framework
task to collect it through Playwright instrumentation.

When MCP is available, use it as an exploration or official-agent capability,
but keep generated tests aligned with this harness's framework layers, curated
capture policy, and CLI verification rules.

## Playwright Agent CLI Capture Loop

Use global `@playwright/cli` as the preferred no-MCP page exploration layer
when it is installed and approved by the team:

```bash
npm install -g @playwright/cli@latest
playwright-cli --help
```

Use it to create reusable local page context before generating tests:

```bash
playwright-cli open https://example.com --headed
playwright-cli snapshot --filename=contexts/captures/example-home.yml
playwright-cli screenshot --filename=contexts/captures/example-home.png
playwright-cli click e15
playwright-cli snapshot --filename=contexts/captures/example-after-click.yml
playwright-cli state-save playwright/.auth/user.json
```

Snapshots contain an accessibility tree with element refs. Re-snapshot after
navigation or DOM-changing actions because refs are only valid for the current
page state.

Store only curated, reusable captures in `contexts/captures/`. Treat automatic
`.playwright-cli/` snapshots as temporary evidence unless copied or written to
the curated capture folder with a meaningful name.

## Capture Workflow

For repeated role and flow context, use capture workflows so humans and agents
do not need to remember every low-level `playwright-cli` command.

Default sample CRM workflow:

```bash
npm run capture:recipes:generate
npm run capture:recipe -- --list
npm run capture:crm:manager -- --dry-run
npm run capture:crm:manager
```

Operational model:

1. User gives intent, such as manager role flows.
2. Agent reads app source, source manifest, graph context, existing tests, and
   existing captures.
3. Agent identifies accessible and denied routes for the target role.
4. Agent creates or updates the capture workflow.
5. Agent runs the workflow to produce curated YAML snapshots and selected
   screenshots.
6. Agent creates or heals tests using fixtures, page objects, assertions, tags,
   and Playwright test-runner verification.

Day 1: capture the role/page states and create tests.

Day 2: run `npx playwright test`; do not recapture unless page context is
missing or stale.

Later: refresh only affected captures when UI copy, locators, route access, or
failing test evidence indicates stale context.

## Playwright CLI Evidence Loop

Prefer the narrowest test-runner command that answers the current verification
question:

- Run a single spec when debugging one flow.
- Use `--grep` or tags when the framework defines scenario tags.
- Use `--project` when browser or device scope matters.
- Use `--headed`, `--debug`, or `--ui` only when the user allows interactive
  local debugging and the environment supports it.
- Use Playwright traces, screenshots, videos, and HTML reports for failure
  analysis before changing selectors or timing.

Common command patterns:

```bash
npx playwright test
npx playwright test tests/example.spec.ts
npx playwright test --grep "@smoke"
npx playwright test --project=chromium
npx playwright show-report
npx playwright show-trace path/to/trace.zip
```

Use package scripts when they exist. Do not invent commands without checking
`package.json` and Playwright config first.

## Framework Layering Rules

Keep responsibilities separated:

- Specs in `specs/` describe behavior and scenario flow.
- Tests in `tests/` assemble executable flows from framework layers.
- Page objects in `pages/` expose stable user actions and page-level locators.
- Assertion helpers in `assertions/` contain repeated user-visible expectations.
- Fixtures in `fixtures/` own shared setup, browser context configuration, auth state, and
  dependency injection.
- Test data builders in `data/` own generated or reusable test data.
- Request/API helpers own API setup that supports UI tests.
- Configuration owns projects, retries, reporters, artifact policy, and
  environment defaults.

Do not hide important user behavior behind over-abstracted helpers. Prefer
clear tests with well-named framework helpers.

## Locator Rules

Use locators in this priority order:

1. Accessible, user-facing locators: `getByRole`, `getByLabel`,
   `getByPlaceholder`, `getByText`, and `getByAltText`.
2. Stable `getByTestId` selectors for dynamic, repeated, or technical UI.
3. Page-object methods that wrap the above.
4. Stable CSS selectors only when semantic or test-id locators are not
   available.

Avoid XPath, DOM-depth selectors, generated classes, visual styling selectors,
and exact-layout selectors. If a stable locator does not exist, prefer adding
or requesting a stable app-owned test id over building a brittle selector.

## Test Authoring Rules

Before adding a new test, perform a duplicate coverage check:

- Small changes can update the owning Playwright test, page object, assertion
  helper, fixture, or data builder directly. Examples: add one assertion,
  adjust one locator, add one missing tag, or fix one stale expectation.
- New role flows, business workflows, cross-page scenarios, unclear prompts, or
  broad coverage requests should create or update a flow spec first. Use
  `specs/prompt-flow-template.md` as the authoring aid, then save the real flow
  as a concrete spec such as `specs/manager-role-flow.md`.
- If the same flow, setup, action, role, and assertion already exist, do not add
  a duplicate test.
- If the flow exists but one assertion is missing, add the smallest assertion to
  the existing test.
- If the role, route, feature flag, error state, viewport, browser, or workflow
  is genuinely new, add a focused test using existing framework layers.
- If expected behavior is not represented in the app or test environment,
  report a product, app, or test-environment gap.

When source access is available, run or inspect the graph layer before adding
wide coverage:

```bash
npm run graph:view
```

Use the report to prioritize missing route, role, state, validation, and capture
coverage. Do not treat graph suggestions as automatic requirements; they are
candidate tests for human and agent review.

Prefer web-first assertions such as `toBeVisible`, `toHaveText`,
`toContainText`, `toHaveCount`, and `expect.poll` for async derived state.
Avoid fixed sleeps. Use Playwright auto-waiting, explicit app-owned signals,
or web-first assertions.

## Debugging Rules

When debugging a failure:

1. Capture the exact failing command and error.
2. Identify whether the failure is selector, timing, test data, environment,
   browser compatibility, app behavior, or framework setup.
3. Review available traces, screenshots, videos, reports, and logs.
4. Reproduce with the narrowest Playwright CLI command.
5. Change only the layer that owns the failure.
6. Rerun the focused command, then any broader gate required by the change.

Do not fix flaky tests by adding arbitrary waits. Do not update expected
assertions merely to match broken behavior. If behavior changed intentionally,
tie the test update to the new requirement.

## Refactoring Rules

When refactoring selectors, page objects, fixtures, or assertions:

- Preserve behavior unless the user explicitly asks for behavior changes.
- Move repeated selectors/actions into page objects.
- Move repeated expectations into assertion helpers.
- Move repeated setup into fixtures only when it is shared across multiple
  specs or needs typed dependency injection.
- Keep scenario-specific data close to the test until reuse is clear.
- Rerun tests that cover every changed helper or fixture.

## Evidence and Artifact Policy

Playwright reports, traces, screenshots, videos, downloads, and temporary logs
are evidence. Use them for analysis, but do not commit generated artifacts
unless the project explicitly designates an artifact as a fixture or baseline.

Keep generated output directories such as `playwright-report`, `test-results`,
`.playwright`, screenshots, videos, traces, and downloaded files out of Git
unless a future project rule says otherwise.

## Reporting Back

Every completed agent task should report:

- Files changed.
- Commands run.
- Evidence reviewed.
- Tests or gates passed.
- Tests or gates skipped, with reasons.
- Any product, app, environment, or framework gap discovered.

Keep the report short, factual, and tied to the user request.
