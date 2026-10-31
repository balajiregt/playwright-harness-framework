# Can a Local Decision Model Review Playwright Test Coverage?

A passing Playwright test can still miss the acceptance criterion. And a short
test is not automatically a useful smoke test.

I built **Playwright Decision Bench** to explore two practical review tasks:

- **Requirement coverage:** do the actual assertions verify the requested behavior?
- **Smoke selection:** which tests preserve critical journeys within a runtime budget?

## Where the layer fits

```text
Ticket + requirements → coding agent → test/assertion evidence
                                              ↓
                                  Local Laya review
                                              ↓
                         Coverage labels / smoke candidates
                                              ↓
                  Local dependency, reliability and budget checks
                                              ↓
                              QA lead reviews the proposal
```

The coding agent still writes tests and Playwright executes them. Laya adds a
bounded review step; it does not approve releases or rewrite the suite.

## What we send and receive

Laya receives the evidence as `state`, plus a typed **Choice** question and its
allowed answers. For coverage: `covered`, `partial`, `uncovered`, `needs_judgment`.
For smoke candidates: `include`, `exclude`, `needs_judgment`.

It returns the chosen label and probabilities. Local code validates the response,
keeps raw findings visible, and routes missing evidence or low probability to review.
A provisional 0.8 threshold is a routing rule—not an accuracy guarantee.

Laya also supports `noul` for yes/no probability and `score` for ordered ratings.
Choice fits these tasks because we need explicit categories. Smoke selection then
needs a whole-suite check: individual “include” answers cannot prove that dependencies
and mandatory journeys fit the budget.

## What the first experiment showed

I compared local Laya with the installed Ollama/Qwen model using the same rubric.
This Qwen run is a model proxy, not a full Copilot or Claude agent workflow.

The pilot contains 16 synthetic decisions and two repetitions. On the held-out
cases, both models matched **1 of 4 coverage labels** and **1 of 3 smoke labels**
on each repetition. Both incorrectly treated important coverage gaps as covered.
Laya's threshold routed those answers to human review.

That is the useful result: a working integration is not proof of useful judgment.
The current untuned setup is not ready for unattended decisions.

The labels are author-supplied and need independent review. Actual Playwright runtime
savings and fault-detection retention are unmeasured. OpenAI Decisions remains an
optional direct-API comparator, with no valid measurements yet. Laya needs no Vercel
account or API key.

Next: review the dataset, improve only against development examples, and test again
on fresh held-out requirements.

[Project](https://github.com/balajiregt/playwright-decision-bench) ·
[Graphs and measured limits](https://framework-benchmarks-balaji.netlify.app/#decision-bench)

*Draft — not published.*
