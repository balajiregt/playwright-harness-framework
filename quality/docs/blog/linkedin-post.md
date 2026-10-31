Can a local decision model help review Playwright tests?

I built Playwright Decision Bench around two questions:
• Do the assertions actually cover the requirement?
• Which E2E tests should form the smoke suite?

The flow:
Requirements + test evidence → Laya → typed labels → local suite checks → QA lead review.

We send a Choice question with allowed answers. Laya returns a label and probabilities. Missing evidence or low probability goes to review. Smoke proposals must also preserve critical journeys, dependencies and the runtime budget.

The first result was sobering: across two repetitions, both local Laya and a Qwen + rubric baseline matched only 1/4 held-out coverage labels and 1/3 smoke labels. Both missed meaningful coverage gaps.

That is why I wanted a benchmark before adoption. Working APIs do not establish useful judgment.

Small, author-labeled synthetic pilot; independent review is pending. No claim of Playwright runtime savings. OpenAI Decisions is an optional comparator, still unmeasured. Laya runs locally without Vercel or an API key.

Project: https://github.com/balajiregt/playwright-decision-bench
Graphs: https://framework-benchmarks-balaji.netlify.app/#decision-bench

#Playwright #TestAutomation #QualityEngineering #LocalAI

Draft — not published.
