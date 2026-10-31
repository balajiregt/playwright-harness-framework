# Evaluate your Playwright suite locally

For paired Jev versus Laya evaluation and the private QA viewer, use the
[Jev / Laya comparison guide](jev-laya-comparison.md). This page documents the
existing local-only `qa run` workflow.

Point the evaluator at an existing repository and requirements file. It produces
a **draft coverage matrix**, **draft smoke proposal**, and **metrics-only export**.
Laya and Qwen use separate local runtimes. No hosted AI key is needed.

## 1. Install once

```bash
git clone https://github.com/balajiregt/playwright-decision-bench.git
cd playwright-decision-bench
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r python/requirements-import.txt
```

Install the target Playwright repository's own dependencies normally. The evaluator
uses that installed runner; it does not add or rewrite tests. Collection loads
that repository's Playwright config and test modules, so use a repository you trust.
Node 22+ is required. On Windows use `.venv\Scripts\python.exe` and configure that
path; on macOS/Linux use `.venv/bin/python`.

Choose a model:

- **Qwen through Ollama:** start Ollama with your installed Qwen model. Default:
  `http://127.0.0.1:11434`, model `qwen3:4b`.
- **Qwen through llama.cpp:** start `llama-server` with your local Qwen GGUF,
  an explicit model alias and a sufficient context size. Configure `kind: "llamacpp"`,
  `endpoint: "http://127.0.0.1:8080"` and that alias as `model`. The adapter checks
  `/props` and `/v1/models`; it refuses inputs that exceed a conservative context bound.
  Use a current llama.cpp build with its Jinja template and thinking disabled:
  `llama-server --model /path/to/qwen.gguf --alias qwen3:4b --host 127.0.0.1 --port 8080 --ctx-size 16384 --jinja --reasoning off`.
- **Laya:** also install `.venv/bin/python -m pip install -r python/requirements.txt`.
  Configure `kind: "laya"` and `device: "mps"` on Apple Silicon, `cpu` otherwise,
  or `cuda` on a configured CUDA machine. Its first use downloads the pinned
  checkpoint; later runs use the local cache. Laya does not run inside Qwen.

Some Qwen GGUFs contain an older thinking-only template. The adapter refuses that
configuration before evaluation. For **Qwen3-4B**, run
`node scripts/fetch-qwen-template.mjs` once, then add
`--chat-template-file artifacts/models/qwen3-4b.jinja` to the server command.
This downloads the [official Qwen3-4B template](https://huggingface.co/Qwen/Qwen3-4B/blob/main/tokenizer_config.json),
not new weights. Use the matching vendor template for other models.

## 2. Supply requirements

Copy a [JSON](../examples/team/requirements.json), [XLS](../examples/team/requirements.xls),
[XLSX](../examples/team/requirements.xlsx), [DOCX](../examples/team/requirements.docx)
or [DOC](../examples/team/requirements.doc) template.

| Field | Meaning |
|---|---|
| `id` | Unique acceptance-criterion ID, such as `CHECKOUT-1` |
| `criterion` | One testable expected outcome |
| `journey` | Business journey, such as `checkout` |
| `critical` | `true` if smoke must cover this criterion |

Excel files require a **Requirements** sheet with these column names. Use literal
values; XLSX formulas are rejected. Legacy XLS reads stored cell values, including
cached formula results, so replace formulas with reviewed values before importing.
JSON uses `{ "version": 1, "requirements": [...] }`.

Word files use repeated labelled paragraph blocks:

```text
ID: CHECKOUT-1
Criterion: After checkout, the order status is Confirmed.
Journey: checkout
Critical: true
```

DOCX works without Word. Legacy DOC requires macOS `textutil`, or `antiword` on
Linux/Windows; Linux installation is commonly `sudo apt-get install antiword`.
Unsupported/free-form layouts are rejected; the tool does not invent criteria from
prose. Files are limited to 10 MiB and 2,000 requirements. Review the normalized import.

## 3. Configure and run

```bash
npm run qa -- init --repo /path/to/playwright-repo \
  --requirements /path/to/requirements.xlsx \
  --playwright-config playwright.config.ts
npm run qa -- import
npm run qa -- collect
npm run qa -- run
```

`init` creates an ignored `decision-bench.config.local.json`. Paths are resolved
relative to that config, and the generated defaults use absolute paths. Configure
`projects` to select Playwright projects, `provider`, and `smoke.budgetMs` as needed.
Custom config files use `--config /path/to/config.json` on every command.

The collector includes the target test and local helper/fixture imports, excluding
unrelated test declarations from model context. Dynamic imports, unresolved external
helpers, ambiguous parameterized bindings and size limits remain explicit unknowns.
Large evidence is excluded rather than silently truncated. Requirement IDs and local
source filenames are not sent as model metadata; source code still contains its own
literals and identifiers. All inference endpoints are restricted to loopback HTTP.

Every requirement is checked against every runnable collected test. The default
`maxPairs: 200` refuses a larger run before inference. Narrow projects/requirements
or explicitly raise this limit (maximum 10,000). No unassessed pair becomes a gap.
Three consecutive provider errors stop further inference; remaining pairs stay
explicitly unassessed in the report and metrics.

Outputs under the configured `output` directory, in a unique run folder:

- `index.html`: local graph report and inspectable source evidence.
- `coverage.csv`: requirement-to-test matrix with locations and review flags.
- `smoke.json`: draft selected test IDs, dependency closure and unresolved criteria.
- `report.json`: private evidence, per-test decisions and operational failures.
- `metrics.json`: the only file intended for dashboard import or publication.

Open `index.html` locally, or serve the output directory with a local HTTP server.
These are model estimates. Missing helper evidence overrides a raw positive. Laya
probabilities are recorded with a provisional low-probability warning, not treated
as calibrated correctness. All proposals need lead review. Multiple partial tests
are not automatically promoted to full coverage without an explicit complete match.

## 4. Add execution history for smoke selection

```bash
npm run qa -- record
```

This command **executes the configured Playwright suite**, including its normal
setup and web servers. It records durations, first-attempt outcomes and retry costs.
Add the printed `history-*.json` paths to the config's `history` array, then rerun.
Existing test results are not inferred from passing source code.

Selection covers critical criteria (or `smoke.mandatoryRequirementIds`), includes
Playwright project dependencies plus `smoke.dependencies` keyed by collected test
IDs, and avoids known unreliable tests. `minPassRate` defaults to 0.98 and `minRuns`
to 1; choose a meaningful history minimum for your team. Histories must match test
source fingerprints. Unknown duration/history remains visible; it is never zero.
Duration sums are estimates, not Playwright wall-clock savings. Selection is greedy;
a missing proposal is not proof that no other feasible subset exists.

Review `smoke.json` and use the listed test locations in your existing workflow.
The tool does not change tags or execute a proposed smoke suite automatically.
If a selected project depends on an uncollected setup project, its smoke candidates
are blocked with a dependency conflict; include the setup project in collection.

## 5. Import or publish only metrics

Open the dashboard's [Team suite evaluations](https://framework-benchmarks-balaji.netlify.app/#team-evaluations)
panel and select `metrics.json`. This validates and displays the file **in your
browser only**; it does not upload private artifacts or persist a shared result.

For shared publication, configure Git HTTPS authentication with write access to
the results repository (the same credential helper used for `git push`), then:

```bash
npm run qa -- validate-metrics --metrics /path/to/run/metrics.json
npm run qa -- publish --metrics /path/to/run/metrics.json
```

The command uses a temporary Git checkout and updates only `team-metrics.json` on the existing `benchmark-results` branch
of `balajiregt/playwright-decision-bench`; the dashboard refreshes it. It keeps the
latest 100 run aggregates. `--repository owner/repo` supports a team's own results
repository, provided its `benchmark-results` branch exists. The shared dashboard
reads the configured shared repository, not arbitrary private repositories. Teams
without shared-repository access can import locally or contribute a metrics file
for a maintainer to publish. There is no anonymous upload endpoint.

Only closed-schema counts, timing/token/resource measurements, model-configuration
hash and broad hardware metadata are accepted. Extra fields anywhere are rejected.
Test names, paths, tickets, source, prompts, responses and reviewer notes stay local.
Model accuracy remains unavailable without independently reviewed labels. Reports
also distinguish real repository inputs from synthetic integration fixtures.
