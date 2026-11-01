# Use Playwright Agent in an existing project

Playwright Agent is a reusable workflow for your coding agent. Keep one toolkit
checkout or extracted source ZIP and connect your existing Playwright project.
Your application tests, fixtures, page objects and configuration stay in their
current repository. The bundled CRM and its evidence demo are supporting proof;
they are not the application you must adopt or a framework to copy.

## Configure the selected repository

Your target must already contain `package.json` declaring `@playwright/test`
and an existing Playwright configuration. From the toolkit root, run:

```sh
npm run agent:configure -- --repo "../my-existing-project"
```

The default config is `playwright.config.ts`. Select another existing file or
just one client explicitly:

```sh
npm run agent:configure -- --repo "../my-existing-project" --playwright-config config/ui.config.ts --client codex
npm run agent:configure -- --repo "../my-existing-project" --client copilot
```

Use the same `--playwright-config` value on repeat runs. The default client is
`both`. The command resolves the selected folder, checks its package/config and
preflights every destination before writing. It creates only:

- `.playwright-agent.local.json`, containing a relative toolkit path and the
  selected existing configuration; that filename is appended to `.gitignore`.
- A local Codex skill shim at `.agents/skills/playwright-agent/SKILL.md` when
  Codex is selected.
- A local Copilot agent shim at `.github/agents/playwright.agent.md` when
  Copilot is selected.

The shims point through relative links to the one canonical toolkit workflow,
while explicitly selecting **your adopter repository** and its own instructions.
Existing `AGENTS.md`, source, tests and package manifests are preserved. Identical
onboarding is idempotent; a different existing local config or selected agent file
causes refusal without conflict-related partial writes. Review and migrate such
files explicitly rather than expecting the command to overwrite them.

Keep the toolkit available at the configured relative location. Moving either
repository requires reviewing its local mapping and shim links. The tool does
not install dependencies, launch browsers or models, configure global skills,
MCP servers or hooks, select requirements, or execute any tests.

## Work in your project

Open the adopter repository in your coding tool. Select its Playwright Agent
skill/agent, read local instructions, and identify the actual ticket, acceptance
criteria or task folder. Existing project context conventions remain valid;
you do not need to recreate the toolkit's sample context maps. For example:

> Using the selected ticket and this repository's Playwright configuration,
> create the missing login coverage. Inspect existing tests and assertions,
> prepare an acceptance matrix, make focused changes, and run the relevant tests.

The workflow supports five common tasks:

| Task | Concrete outcome |
| --- | --- |
| Write tests | Inspect source and requirements, reuse project helpers, create focused missing scenarios and run the selected checks. |
| Update tests | Modify the existing owning test/assertion for the requested behavior; preserve unrelated coverage and report any product gap. |
| Acceptance and test-matrix review | Map criterion/source → scenario → actual test/assertion → supported, partial, missing or unknown; record runtime evidence separately. Keep assess-only requests read-only. |
| Duplicate review | Compare role, preconditions, actions and assertions before proposing reuse or consolidation; matching titles or graph edges alone do not prove duplication. |
| Mutation evidence | Explicitly configure bounded faults for a trusted local target, observe activation and repeated test outcomes, restore green, and retain private evidence. Ordinary onboarding does not start this optional execution. |

The coding agent writes files through its native editing tools and runs your
existing Playwright CLI/package commands. It must check that tests executed;
skips, list commands and unrelated green suites do not establish acceptance.
Keep private work-item documents and raw evidence in your project's ignored
locations. Promote reviewed reusable lessons into its existing documentation.

If requirements arrive as downloaded PRDs, Jira/RTM exports or narrative files,
follow [local document intake](document-intake.md). From the toolkit, select the
adopter with `--repo`, its private `--task` and explicit `--file` inputs. The host
coding agent prepares source-linked criteria and handles any field mapping;
the tester reviews readable criteria and questions rather than authoring JSON.
Accept only after that exact review. Originals, source hashes and provenance
remain private in the adopter's task; intake does not write tests or run them.
After the requested analysis, test changes and checks finish, the host agent
records its findings and attaches actual Playwright JSON and behavioral-mutation
reports through the CLI. It opens the selected adopter's [read-only report
viewer](portal.md) last, including assess-only, failed or partial outcomes.
The viewer shows saved evidence, source quotations and the matrix. Document
intake, interpretation review, file changes and execution stay in the agent
chat and project CLIs; viewing a report does not establish acceptance.

Your host coding agent uses its already selected model. Extra local or hosted
decision models are optional advisory integrations, not a prerequisite for
test authoring, matrix review or duplicate analysis. Optional Code Mode exposes
only its configured quality tools; it does not invent browser exploration or
generic test-writing APIs. See [the canonical workflow](../.agents/skills/playwright-agent/SKILL.md)
and [optional integrations](../.agents/skills/playwright-agent/references/integrations.md).

Use the source ZIP without generated artifacts for onboarding. Run the
[self-contained demo](../examples/validation-demo/README.md) separately when you
want to inspect sample browser, graph and mutation evidence. The demo's synthetic
results and known coverage gap are not claims about your application.
