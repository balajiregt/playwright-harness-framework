# Bounded workflow comparison

This is the protocol and local readiness record for a small, private comparison
of Playwright Agent, official Playwright Test Agents, and one close platform.
Detailed measured results stay in the selected task's private receipts. The portal is a final report viewer; the host
coding agent performs inspection, authoring and execution through its existing
tools. Keep detailed task material and receipts private.

## Current readiness

Checked on 1 November 2026:

| Item | Status and evidence |
| --- | --- |
| Selected target | The user selected the separate `qa-projects/ui-automation/role-aware-mockserver` project and authorized creating a new requirement and updating its tests. The proposed task below is agent-authored; it is not an external customer ticket or independently human-reviewed requirement. `test-1` remains separate. |
| Local Playwright prerequisite | The canonical mockserver remains installed/locked to 1.60.0, whose setup command lacks a Codex loop. A separate common runtime uses the already installed product's Playwright 1.62.1 for every trial arm, without installing or upgrading canonical dependencies. |
| Official agent definitions | The 1.62.1 setup generated the three official TOML definitions and local MCP discovery succeeded. The fresh native authoring attempt stopped incomplete because its exposed `spawn_agent` interface lacked an `agent_type` selector for the official roles. No substitute tests were authored. |
| Runtime | The common target uses Node 22.23.4, loopback ports 5273/3433, zero retries and no server reuse. Its six original feature/error checks passed twice; those old assertions do not establish the new criteria. |
| Close platform | Supercheck is the provisional trial candidate. Its documented Playwright authoring, requirements traceability and execution reporting make it relevant. Those capabilities have not been runtime validated here. |
| Platform prerequisites | Docker client 28.4.0 is present; the daemon was unreachable. More decisively, Supercheck's current supported self-hosting path requires Linux and explicitly excludes macOS/Docker Desktop. No supported platform instance or approved account has been verified. |
| Independent tester | No independent human completion receipt exists. A subagent, scripted check, original author or self-review cannot fill this role. |
| Comparison results | The fresh official attempt is incomplete; the Playwright Agent attempt authored tests and passed typecheck but browser startup was blocked inside its native sandbox. Separate host grading verified the frozen original and authored test artifacts, with actual results retained privately. This does not establish completed native execution, a completed three-way quality comparison or independent human completion. |

Primary references, checked 1 November 2026:

- [Official Playwright Test Agents](https://playwright.dev/docs/test-agents)
  documents planner, generator and healer plus `init-agents --loop=codex`.
- [Supercheck source and repository overview](https://github.com/supercheck-io/supercheck)
  documents its Playwright and traceability scope. The app/worker are
  AGPL-3.0-only; the CLI from 0.3.1 and recorder are Apache-2.0. Keep a platform
  trial separate from this product; do not copy its code into this repository.
- [Supercheck self-hosting prerequisites](https://supercheck.io/docs/app/deployment/self-hosted)
  specify Linux, at least 2 vCPU/4 GB RAM and the supported installer path.

No installation, login, provider change, model startup, global MCP registration,
hooks or external platform execution was performed. The later authorized Codex
readiness request is recorded below. Source/documentation claims and readiness
checks are setup evidence, not comparison scores.

## Selected mockserver pilot

The selected UI repository owns its app, mockserver and Playwright tests. Its
`AGENTS.md` and existing resolved `UI-ROLE-001` map establish the file ownership;
that sanitized adoption task is not the new feature's requirements. The distinct
private task is `contexts/tasks/UI-WORKSPACE-REFRESH-001.yml`, with its own
regenerated resolved map. Preserve this nested repository's existing changes.

**New requirement: failed session refresh must clear stale workspace actions,
and a later successful refresh must restore the current role cleanly.**

| Criterion | Proposed expected behavior |
| --- | --- |
| REFRESH-ERROR | If initial load or session refresh fails, show `Mockserver error` and the returned error message; show workspace title `Workspace unavailable`, no action cards and `0 actions`. |
| REFRESH-CLEAR | After a successful workspace has displayed role actions, a failed refresh removes those previous actions and successful title. An error label alone must not leave a stale successful workspace visible. |
| REFRESH-RECOVER | When the failure condition is removed and Refresh session is clicked again, show `Mockserver connected`, the selected role's expected title and exact action catalogue/count, and replace the error message without duplicated cards. |

These criteria are authored for this local demo and technically grounded in the
source inspection. The task and the bounded app implementation received a second
agent's source review; that is technical review only. They have not received independent human requirement review
or independent gold-label review. Do not present them as business-approved or
as an independent real-ticket study.

Source inspection found the refresh button already calls `loadSession()` in
`app/public/app.js`. Failure handlers update the status and summary but leave the
previous title/cards/count. `mockserver/src/backend/endpoints/v1/workspace.js`
already returns a controlled 503 when the `downstream-error` header is true.
No new endpoint, production auth policy or backend behavior is needed.

Reuse `playwright/helpers/api-mock.ts` for real request continuation with that
header. Strengthen the existing initial-error case in
`playwright/tests/feature-flags.spec.ts` and add one focused success → failed
refresh → successful refresh journey. Use the existing page object and assertion
layers for repeated controls. Current role coverage in
`playwright/tests/role-ui.spec.ts` supplies the catalogue regression check.
No OpenAPI/Swagger document was found in this UI project; do not infer a service
contract or modify the separate RestAssured projects.

For a fair authoring comparison, first implement the requested app behavior and
verify it independently, then freeze that healthy app revision with the original
tests `T0`. Every arm receives those same app bytes, criteria and original test
snapshot; only its own tests may change. Do not give later arms the first arm's
new tests. If the initial-error assertion is strengthened while implementing the
feature, preserve and identify the pre-change `T0` explicitly for all arms.

Existing refresh-failure gaps and prospective faults such as omitting action
clearing or leaving an incorrect count are **visible development cases** once
described to the authoring agent. They can validate the harness, but are not a
hidden holdout. An independent reviewer must supply unseen requirement-breaking
faults/probes after seeing only the frozen intended behavior, before generation.
Without that separation, label results development-fault sensitivity.

Run the selected UI project's focused browser checks with its actual config,
then `npm run test:roles` and `npx tsc -p playwright/tsconfig.json --noEmit` when
TypeScript changes. Use retries disabled and isolated servers for grading. The
existing config defaults to reusing local servers outside CI, so record the
actual isolated runner/config rather than assuming the normal command isolates
copies. This protocol does not claim these checks have run.

## Isolated runtime receipts

The private `artifacts/portal-insights-validation-20261101/workflow-trial/`
directory holds one common source/runtime freeze and separate disposable arm
copies. `common-freeze.json` binds the 25 selected app/backend/test/config/card
files, seven unchanged original Playwright files, installed package versions,
full Playwright package-tree hashes, Node executable hash and grading config.
The app/card hashes match the app-only implementation freeze. The source manifest
SHA256 is `a80e5bc9a357bf5c51d50d0ee2fcbc50b5d15b69b157523d0c6f056faa438046`.

Only `@playwright/test`, `playwright` and `playwright-core` are overlaid from the
already installed 1.62.1 product packages. Other dependencies resolve to the
selected mockserver's installed modules. All six backend dependency imports and
the Playwright import succeeded. The retained original lockfile describes the
canonical 1.60.0 target, not this overlay; the freeze records the difference.
No package installation was run.

The original config remains unchanged. An identical root grading config/alias
selects the existing supported 5273/3433 server environment with no reuse,
one worker and zero retries. Its SHA256 is
`c75dd06c78f6d8563813d544af7078619030913a02a2670b2bdbc502e86bbd8c`.
Every arm/run sets its own `TRIAL_REPORT_PATH` and `TRIAL_OUTPUT_DIR` so evidence
is not overwritten. The generated empty seed test is setup scaffolding, not an
acceptance check, and is excluded from scored execution.

The two original feature/error runs each passed **6/6**, with zero skipped,
unexpected or flaky results. An earlier default-sandbox attempt failed before
tests because it could not bind port 3433; its receipt remains separate. The
successful runs used ordinary approved host execution for local browser/server
processes. They establish runtime compatibility, not new requirement coverage.

Installed Codex CLI 0.164.0-alpha.11.1 reports an existing ChatGPT login. No
credentials were read or printed. A minimal read-only readiness request initially
failed during in-process client initialization under the outer workspace sandbox.
One ordinary approved host-execution retry, retaining the child's read-only
sandbox and approval policy, returned `READY` in 6.964 seconds. Its actual CLI
usage receipt reported 18,614 input tokens, including 12,288 cached input tokens,
and 5 output tokens. The default resolved model and actual billed spend were not
emitted; they remain unavailable. This was an access check, not authoring.

The two-arm authoring trial pins the existing user configuration's allowlisted
`gpt-6.1-sol`/`high` settings for both fresh sessions, with other user configuration
ignored. Both receive the same local MCP and shell capabilities, workspace-write
sandbox and 600-second cap. The official arm must actually invoke official agent
types; reading their definitions is insufficient. Retain aborted attempts and
actual usage, and do not assume parent turn usage includes spawned-agent usage
unless the evidence establishes it.

The current pilot's shared packet includes the three authored refresh criteria
and two regression controls, `REGRESSION-ERROR-MESSAGE` and
`REGRESSION-ADMIN-CATALOG`, so an assessment has opportunities to report false
alarms as well as new coverage gaps. Both copies receive exactly the same
`regression-controls.md`; it adds no exact total-card-count expectation to the
admin control. All five decisions must be frozen before test changes. The
controls/prompts/input manifests are bound separately in
`authoring-packet-freeze.json`; the earlier common source/runtime freeze remains
byte-identical. This is a technically reviewed, authored local-demo pilot, not
an independently human-reviewed customer-ticket study.

The first fresh five-criterion official attempt took 87.664 seconds and returned
an incomplete report without changing tests or frozen inputs. Its successful
CLI process exit does not establish task completion. The required official
agent types could not be selected through that session's exposed native
collaboration interface. A cleanup MCP call was also rejected because it
required approval while the child approval policy was `never`. Keep these native
tool-boundary failures distinct from test-quality findings. A later experiment
using copied instructions or generic subagents must be labelled an adaptation,
not a native official-agent run.

The fresh Playwright Agent attempt took 223.381 seconds. Its assessment was
observed before the first test edit and retained unchanged. It changed only the
existing feature/error and role specs plus their page-object/assertion files;
app/backend/card/config/package/reference hashes stayed unchanged. Typecheck
passed. Both focused and full browser attempts stopped before test execution
because the child's sandbox denied the backend bind to port 3433. Each run
recorded one setup error and zero executed tests. A separate collection-only
report listed 24 non-seed cases; its listed/skipped records are not runtime
passes or runtime skips.

The immutable outputs are bound in `post-official-freeze.json` and
`post-playwright-agent-freeze.json`. Separate approved host grading must use
fresh copies or external output paths and label its execution separately from
the native authoring attempt. No comparative quality verdict is made here.

The CLI-reported usage was 264,269 input tokens (228,096 cached), 5,785 output
tokens and 364 reasoning output tokens for the incomplete official coordinator
attempt; the Playwright Agent attempt reported 509,403 input (458,880 cached),
10,456 output and 1,699 reasoning output tokens. These are reported counters,
not billed spend; do not add reasoning tokens to output without knowing the
provider's accounting definition. The earlier aborted attempt remains retained
and must not silently vanish from setup/cost accounting. Human active time and
actual billed cost are unavailable. Unequal incomplete tasks cannot establish
a speedup, cost saving or native official-agent quality score.

The grading material is withheld from authoring inputs. Directory separation
does not establish an operating-system read boundary; inspect retained tool
calls for out-of-scope access and report that limitation. Without an enforced
boundary, the strongest supported statement is "withheld from authoring inputs;
no observed oracle access," if the tool record supports it.

No Supercheck connector or verified account was found. Browser inventory could
not inspect existing sessions because the browser access host was unavailable.
This remains missing supported-instance/account access; no login or signup was
attempted.

## Freeze one fair task before generation

Start with one real, trusted non-production work item with a small coherent
flow. If real requirements or access are unavailable, an explicitly synthetic
practice run may check the instruments, but cannot substitute for the real
comparison or independent tester trial.

Before any arm generates findings or tests, a human reviewer approves the exact
source-linked criteria and adjudicates the original suite's coverage. Preserve
unknown or conflicting requirements. Existing intake acceptance does not prove
that the comparison's labels were independently reviewed. Retain:

- Immutable target Git commit, plus SHA256 manifest of the selected source,
  requirements, original tests/helpers/fixtures, Playwright config, lockfile and
  source files. Include selected uncommitted inputs explicitly; do not hide a
  dirty tree behind a commit identifier.
- Original requirements and reviewed criterion IDs with exact source location,
  relevant role/state/action/outcome and accepted/excluded/unknown status.
- Frozen original test snapshot `T0`, explicit test/project selection, seed and
  auth setup, browser/OS/Node/Playwright versions, data reset and runner commands.
- Independently reviewed coverage labels for every in-scope criterion:
  supported, partial, missing or unknown, with assertion/helper evidence.
  Predefine which partial cases count as actionable gaps and why.
- Exact common task prompt, evidence allowlist, output rubric, permitted edits,
  completion checks, time/token/spend limits and allowed repair policy.
- Separate visible development faults and hidden holdout fault catalogue,
  each bound to a criterion and independently observable behavioral change.

Hashes bind records; they do not by themselves establish fairness. Store the
frozen packet and human review receipt under the selected task's ignored
artifacts. Never send reviewer gold labels, fault patches, hidden probes or
other arms' output to an authoring arm. Keep the holdout outside every arm's
readable workspace and tools. If this cannot be enforced, report leakage and
do not claim a hidden evaluation.

## Three arms, separate assessment and authoring

Use disposable clean copies of the same frozen target and `T0` for:

| Arm | Intended workflow |
| --- | --- |
| Playwright Agent | Host coding agent with this product's existing local skill, assertion review and final evidence report. Optional providers stay disabled unless separately selected in the common protocol. |
| Official Playwright Test Agents | Official definitions generated by the pinned installed Playwright in the disposable copy; use planner/generator and bounded healer with the same expected behavior. Do not replace the official arm with this product's custom agent file. |
| Supercheck | A verified supported instance, using the same reviewed requirements, original tests and accessible target. First check whether tests/helpers and results can be imported/exported without changing semantics. |

Ask each arm to assess the unchanged `T0` against the reviewed requirements
first. Freeze its criterion-level findings before revealing the reviewer labels
or allowing test changes. A platform without an equivalent assessment interface
is recorded as unsupported/unavailable for that task; do not invent a native
coverage feature or replace it with an unlabelled custom evaluator.

Then allow each arm the same bounded test-authoring/update task from its own
clean `T0` copy. Produce `T1-arm`, record its diff/hash, and freeze it before
holdout evaluation. Reuse helpers and preserve requirement expectations. App
edits, skipped tests, weakened assertions and out-of-scope changes are review
findings, not successful completion. Healer repair must obey the same rule.

Match model/provider/version, source and browser access, permissions, machine
and execution settings, time/token/spend limits and reviewer support where
possible. Record installed definition/version hashes and each model actually
resolved. If a platform requires another provider, machine, evidence format,
remote target or budget, describe that difference before the run and label it a
workflow comparison with confounders. Do not attribute an observed difference
to the framework alone. Never change providers or export private source merely
to make an arm runnable.

Resolve the target's Playwright 1.60.0 versus Codex-loop prerequisite before the
official arm: use a supported, actually available loop or explicitly select one
common dependency snapshot for every isolated arm that supports the chosen
loop. Do not silently initialize with this product's 1.62.1 while claiming a
target-pinned 1.60.0 comparison. An isolated dependency change needs its own
lockfile/version provenance and baseline checks; the source checkout's installed
dependencies stay unchanged by this preflight.

The first pilot is one task and one attempt per available arm with equal limits
fixed before the first attempt; choose the limits from the selected task. Stop
on the declared budget rather than extending a favored arm. Record failures and
unfinished work. Repeat only after the instruments work, using at least three
paired repeats and rotated arm order for any comparative efficiency claim.

## Gap correctness and traceable acceptance

Blind the reviewer to arm identity where practical. Score the frozen assessment
against the previously reviewed `T0` labels, using one decision per criterion.
Deduplicate repeated prose findings. Retain incorrect support claims as well as
missed gaps. Unknown reviewer labels are unscored and shown separately.

| Measure | Numerator / denominator |
| --- | --- |
| Correct gap findings | True actionable gaps identified / all actionable gaps reported on reviewer-conclusive criteria (gap precision). |
| False alarms | Reported actionable gaps where coverage is supported / all reported actionable gaps on reviewer-conclusive criteria. Also show the raw count. |
| Gap recall | True actionable gaps identified / all reviewer-confirmed actionable gaps. |
| Assessment completion | Criteria with an explicit decision / all in-scope criteria; abstentions, unsupported tasks and missing outputs remain visible. |

Always show counts and denominators. A zero denominator is unavailable, not
100%. Unknown requirements, unsupported platform tasks and missing output do
not silently disappear into a favorable score. Separately list product gaps,
environment gaps and assertion gaps so a missing product behavior is not
mistaken for a test defect. Report unresolved disagreements and their reason.

For both `T0` and `T1-arm`, retain a compact evidence chain:

`criterion/source revision → scenario/role/state → test + assertion/helper at test revision → exact selected run + report hash → observed outcome`

Test names, static graph matches, a model opinion or a green suite alone do not
establish coverage. If an assertion or requirement changes, the earlier chain
does not validate the later revision. Keep assertion assessment, actual runtime
and fault sensitivity in distinct columns in the final report.

## Fault detection before and after test changes

Reuse the existing [behavioral mutation runner](../quality/docs/behavioral-mutations.md)
and its [frozen evidence workflow](../quality/docs/independent-mutation-analysis.md)
where their interface fits. Inspect a different target's existing setup and
runner first. Unsupported authentication/probes or source layouts are explicit
adapter blockers, not permission to invent application behavior or build a new
benchmark engine before a pilot.

Use a small reviewed catalogue, initially about three meaningful faults, rather
than broad random mutation. A reviewer other than the authoring agent selects
requirement-breaking faults and independent probes before generation. Visible
development faults may calibrate the harness and help development; exclude them
from the hidden evaluation and label any learned fixes. The hidden holdout must
remain unchanged and unseen until all `T1-arm` snapshots are frozen. Avoid
near-duplicate faults and show the criterion/fault selection limits.

Run the same reviewed faults against `T0` and each `T1-arm`, one fault at a
time in disposable copies. Require two complete green baselines, a separate
baseline/mutant activation observation, two fault runs with retries disabled,
and restored green. Keep app/config/data and test selection matched. Freeze
tests during grading; repairing a test after seeing a hidden fault contaminates
that holdout and requires a new unseen set for further claims.

- **Detected:** activation was observed and the relevant assertion fails
  repeatably on both fault runs. Unrelated infrastructure failure is not a kill.
- **Survived:** activation was observed and both complete selected runs pass.
- **Inconclusive/not activated/not run:** flaky disagreement, startup failure,
  missing probe, activation failure, baseline failure or restoration failure.
  Retain the reason and all scheduled-fault counts; these are not detections.

Report detected / activated-conclusive faults for each snapshot, with every
excluded fault and reason. The headline before/after comparison uses only the
same holdout faults conclusive for `T0` and every compared `T1-arm`; show each
arm's full scheduled completion separately. Also show paired counts of newly
detected, still missed and lost detections. No common conclusive faults means
the comparison is unavailable. A tiny selected holdout cannot establish general
fault-detection accuracy or release readiness.

## Effort, cost and independent completion

Record actual UTC start/finish receipts for setup, agent work, browser execution,
review and correction. Measure human active minutes using a timer/log, with
interruptions paused; record questions, interventions, incorrect changes and
repair cycles. Separate one-time installation/account/import setup from recurring
per-task work. A wall-clock agent duration is not reviewer effort.

Keep provider usage receipts when available, with model/version, input/output/
cached tokens, evidence source and any failed paid attempts. Actual billed spend
requires billing evidence. A dated public token-price calculation is a labelled
estimate; subscription-equivalent token cost is not incremental API spend.
Unreported usage, reviewer time, setup time, hosting cost and local compute cost
remain `null`/unavailable, never zero. Show these missing measures beside quality
and completion, not as a fabricated savings percentage.

An independent tester must be a real other human, not the original workflow,
task or fault author and not an AI/subagent or scripted install. Record their
role/prior familiarity privately and give them the frozen task, clean setup
instructions and the same declared limits. They should install/open the product,
select the task, assess/update tests, run the required checks and reach the final
report from the written workflow. Retain actual completion or stop receipts,
active setup/task time, all help requested and blockers. Record any coaching as
assistance. Do not contact or enroll a person without the user's instruction;
until a real participant performs it, independent completion is **not run**.

## Reuse instruments; keep the pilot local

In the agentic workspace, the optional shared collector at
`evaluation/benchmarks` already defines frozen hashes, real timestamps, null
unknown costs and evidence kinds. It is workspace tooling, not a dependency of
the standalone source ZIP. Reuse its metadata and collector only where the
existing task/arm schema fits. Keep a small private evidence table for additional arms rather than
silently relabelling them baseline/framework or expanding schemas prematurely.
The local [benchmark guidance](../benchmarks/README.md) and mutation reports
remain separate from product acceptance.

Do not invoke automatic benchmark/publication runners merely to collect this
pilot. Some existing trial commands publish by default; inspect their flags and
use a verified local-only path. Keep raw task documents, labels, prompts, source,
fault patches, human notes and reports private. Publishing needs a separately
reviewed aggregate payload and explicit authorization.

The next concrete trial action is to verify the selected mockserver app behavior
and freeze the app, original tests, reviewed inputs and independent probe before
comparing authoring arms. Initialize the
official definitions only in its disposable comparison copy using the installed
version and actual config. For Supercheck, obtain a supported Linux instance or
an already approved service, verify import/export and target reachability, then
record model/data-access differences before authoring. Starting Docker Desktop
on this Mac does not satisfy its documented supported deployment requirement.

Finish with a report that labels each arm ready, blocked, attempted/incomplete
or completed; includes the criterion/assertion/run evidence and all denominators;
and lists measured effort/cost plus unavailable fields. A preflight, synthetic
practice run or documentation/source inspection never becomes a completed
three-arm comparison or independent human validation.
