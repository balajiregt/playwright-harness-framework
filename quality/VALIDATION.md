# Validation — October 20, 2026

The two-use-case synthetic pilot is implemented and ran locally. 16 cases × two
repetitions produced 32 Laya and 32 Qwen answers. One initial hosted request failed
with HTTP 403; 31 remaining hosted rows were not run. The old Gateway route was
then removed. Direct OpenAI is optional and not yet measured.

Passed: `npm run typecheck`, `npm test` (40 tests), `npm run context:resolve`,
`npm run review:preview`, `npm run compare:preview`, `npm run benchmark:crm:preview`,
`npm run bench:preview`, `npm run bench:preflight` (16/16 packets without truncation),
`npm run bench:report`, and Python syntax compilation. `bench:live -- 2` recorded
real local responses; errors and unrun requests stayed distinct from valid answers.
The exact authored input and gold hashes are attached to the report. No held-out
labels or prompts were changed after seeing the results.

The shared dashboard passed 37 Python and 36 JavaScript tests and its static build.
Browser inspection confirmed chart layout, unavailable OpenAI measurements and
suite-constraint details. Public output contains aggregates only.

Skipped: actual application Playwright execution, fault-retention experiments,
independent human label review and timed reviewer study. The existing harness was
not changed. The workspace UI resolver was attempted but references the missing
`projects/ui-automation/role-aware-mockserver` directory; this blocks that old
harness context, not the isolated synthetic decision pilot.

Local state: project-specific `.venv`, pinned Laya cache and raw reports remain
ignored. Existing secrets were not printed or published. The current adapters
never consume the old Gateway credential. Medium and LinkedIn remain drafts.
