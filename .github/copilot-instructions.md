# Copilot Instructions: Playwright Agentic Framework

This project is an isolated prototype for an enterprise Playwright agent
harness. It standardizes AI-assisted Playwright UI automation for Copilot,
official Playwright Test Agents, the global `@playwright/cli` agent CLI, and
normal Playwright test-runner workflows.

Use curated page captures, repository files, terminal output, `playwright-cli`
commands, `npx playwright test` commands, traces, screenshots, videos, reports,
and logs as evidence. Do not assume MCP browser tools, live browser-control
MCPs, or organization-blocked agent integrations are available.

This harness does not replace official Playwright planner, generator, and
healer agents. If the team has access to those agents and MCP, they may be used.
This harness still controls file placement, fixtures, page objects, assertions,
tags, evidence, CLI verification, and review gates.

V2 adds source-aware graph intelligence. When application source is available,
use the graph contexts and `npm run graph:*` scripts to compare possible tests
against existing specs, tests, page objects, assertions, tags, captures, gaps,
and duplicate risks. The sample CRM app in `examples/sample-crm-app` is only a
demo target, not a dependency for teams adopting the harness.

The graph layer consumes a source manifest contract. Do not hardwire framework
logic to the sample CRM app. This repo includes a common generic scanner at
`scripts/source-adapters/generic-source.mjs` for first-pass manifests and a
sample CRM adapter at `scripts/source-adapters/sample-crm.mjs`. Real teams can
start with the scanner, then provide their own generator with
`SOURCE_MANIFEST_COMMAND` or adapter with `SOURCE_MANIFEST_ADAPTER` when exact
auth, role, feature flag, or dynamic-state semantics are needed.

V3 adds capture workflows. For role or flow prompts, generate or update
`contexts/capture-recipes.yml`, run the narrowest workflow, and reuse curated
captures instead of asking the user to manually remember each `playwright-cli`
open, login, snapshot, and screenshot command. Internally, capture workflows
are stored as YAML recipes for compatibility with existing commands and scripts.

## Required Agent Loop

Follow this loop for every Playwright framework task:

1. Read project-local instructions and context.
2. Check whether MCP-enabled official Playwright Agents are available and
   allowed in the current project.
3. If MCP is available, use official Playwright planner/generator/healer
   capabilities for exploration or repair while keeping output inside this
   harness's standards.
4. If MCP is unavailable or blocked, use capture workflows, curated
   `playwright-cli` snapshots, screenshots, and test-runner artifacts.
5. Inspect curated captures under `contexts/captures/` when they exist.
6. Inspect existing Playwright config, tests, fixtures, page objects, helpers,
   assertions, and data before editing.
7. Use a capture workflow, or direct `playwright-cli` commands for one-off
   exploration, when page context is missing or stale.
8. Run the narrowest useful `npx playwright test` verification command.
9. Analyze terminal output and Playwright artifacts.
10. Make the smallest framework-aligned change.
11. Rerun focused verification.
12. Report changed files, commands, evidence, skipped gates, and remaining risk.

## Context Order

Use context in this order:

1. `AGENTS.md` and this file.
2. The user request and acceptance criteria.
3. App-under-test details: base URL, auth, users, flags, dependencies, and data.
4. Curated `playwright-cli` YAML snapshots under `contexts/captures/`.
5. `package.json`, Playwright config, scripts, projects, reporters, and tags.
6. Existing tests, page objects, fixtures, helpers, assertions, and data
   builders.
7. Playwright traces, screenshots, videos, reports, logs, and CLI output.

Use these project-local context files before fuzzy search:

- `contexts/app-under-test.yml`
- `contexts/command-map.yml`
- `contexts/test-strategy.yml`
- `contexts/flow-graph.yml`
- `contexts/agent-loop.yml`
- `contexts/capture-map.yml`
- `contexts/source-map.yml`
- `contexts/test-graph.yml`
- `contexts/coverage-map.yml`
- `contexts/duplication-rules.yml`
- `contexts/captures/`

Prefer exact paths and commands from those files over fuzzy search.

When source access exists, run `npm run source:manifest`,
`npm run source:manifest:check`, or
`npm run source:manifest -- --root=path/to/app --output=source-manifest.json`
before graph-driven planning and broad test work. Project scripts refresh the
sample CRM manifest with `npm run source:manifest:crm` before this repo's demo
tests, graph view generation, and capture workflow generation; external teams
should wire sync to their own app source model when the generic scan is not
precise enough.

Treat generic scanner output as baseline discovery. Before relying on generated
capture workflows, review and enrich auth, roles, seeded data, dynamic states,
feature flags, and workflow intent from source, existing tests, captures, and
graph gaps.

## MCP-Optional Rule

Do not rely on MCP page inspection or MCP browser control until MCP availability
has been confirmed for the current project and environment. If MCP is blocked
and a task needs live browser evidence, collect it through Playwright CLI, trace
artifacts, screenshots, videos, reports, or additional Playwright
instrumentation.

When MCP-enabled Playwright Agents are available, use them only within this
project's harness rules and verify generated or healed tests through the command
map.

## `playwright-cli` Capture Rule

When global `@playwright/cli` is installed and page context is missing or stale,
capture reusable local context before generating tests:

```bash
playwright-cli open https://example.com --headed
playwright-cli snapshot --filename=contexts/captures/example-home.yml
playwright-cli screenshot --filename=contexts/captures/example-home.png
playwright-cli click e15
playwright-cli snapshot --filename=contexts/captures/example-after-click.yml
playwright-cli state-save playwright/.auth/user.json
```

Snapshots are accessibility trees with element refs. Re-snapshot after
navigation or DOM changes. Curate reusable snapshots into `contexts/captures/`;
treat auto-generated `.playwright-cli/` files as temporary evidence.

## Capture Workflow Rule

Prefer workflow commands for repeated role or flow captures:

```bash
npm run capture:recipes:generate
npm run capture:recipe -- --list
npm run capture:crm:manager -- --dry-run
npm run capture:crm:manager
```

Day 1: capture relevant page states and create tests. Day 2: run the Playwright
tests without recapturing. Later: refresh only affected captures when UI,
permissions, or failing evidence show stale page context.

## Playwright CLI Guidance

Prefer package scripts when they exist. Otherwise use targeted Playwright
commands after checking `package.json` and Playwright config.

Useful patterns:

```bash
npx playwright test
npx playwright test tests/example.spec.ts
npx playwright test --grep "@smoke"
npx playwright test --project=chromium
npx playwright show-report
npx playwright show-trace path/to/trace.zip
```

Use the narrowest command that answers the current question.

## Framework Rules

- Specs in `specs/` describe user behavior and scenario flow.
- Tests in `tests/` assemble executable flows from framework layers.
- Page objects in `pages/` own stable locators and user actions.
- Assertion helpers in `assertions/` own repeated user-visible expectations.
- Fixtures in `fixtures/` own shared setup, auth state, context configuration, and dependency
  injection.
- Test data builders in `data/` own reusable or generated data.
- Request/API helpers own backend setup that supports UI tests.
- Config owns projects, retries, reporters, artifact policy, and environment
  defaults.

Do not couple this prototype to other workspace projects unless the user asks.

## Locator Rules

Prefer locators in this order:

1. `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText`, `getByAltText`.
2. Stable `getByTestId` selectors.
3. Page-object methods wrapping semantic or test-id locators.
4. Stable CSS selectors only when necessary.

Avoid XPath, DOM-depth selectors, generated classes, styling selectors, and
exact-layout selectors.

## Test Rules

Before adding a test, check for duplicate coverage:

- Small changes can update the owning Playwright test, page object, assertion
  helper, fixture, or data builder directly.
- New role flows, business workflows, cross-page scenarios, unclear prompts, or
  broad coverage requests should create or update a concrete flow spec first.
  Use `specs/prompt-flow-template.md` as the authoring aid, not as coverage.
- Same flow, setup, action, role, and assertion already covered: do not add a
  duplicate.
- Existing flow missing one expectation: add the smallest assertion.
- New role, route, feature flag, error state, viewport, browser, or workflow:
  add a focused test using existing framework layers.
- Unsupported expected behavior: report a product, app, or environment gap.

When source access exists, run `npm run graph:view` or the narrower
`graph:source`, `graph:tests`, `graph:coverage`, and `graph:duplicates`
commands before generating broad new coverage. Use graph output as planning and
review evidence, not as a replacement for Playwright test verification.

Use web-first assertions and Playwright auto-waiting. Avoid fixed sleeps.

## Debugging Rules

For failures, capture the exact command and error, review available Playwright
artifacts, reproduce with a focused CLI command, change only the owning layer,
and rerun focused verification. Do not add arbitrary waits or rewrite expected
behavior just to make a failing test pass.

## Artifact Policy

Use reports, traces, screenshots, videos, downloads, and temporary logs as
evidence, but do not commit generated artifacts unless the project explicitly
marks them as fixtures or baselines.

Keep `playwright-report`, `test-results`, `.playwright`, traces, screenshots,
videos, downloads, and temporary logs out of Git unless future rules say
otherwise.
