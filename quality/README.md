# Playwright Agent — quality module

This is an internal capability of Playwright Agent. The product root is the
parent repository, `qa-projects/Playwright Agentic Framework` in the workspace.
It owns requirement assessment, optional decision adapters, behavioral mutation
execution and evidence reporting. There is no separate decision-bench product.

From the product root:

```sh
npm ci --prefix quality
npm run qa -- help
npm run mutation -- help
npm run quality:typecheck
npm run quality:test
```

Paths supplied to root commands are relative to the caller's working directory.
For example, select `quality/examples/mutation/role-aware.config.json` from the
product root. That sample still targets the existing role-aware mockserver;
it is not a configured mutation campaign for the CRM login flow.

- [Mutation workflow](docs/behavioral-mutations.md)
- [Independent analysis](docs/independent-mutation-analysis.md)
- [Optional Code Mode](integrations/code-mode/README.md) — Node 22 for native dependencies
- [Team assessment](docs/team-quickstart.md)
- [Recorded studies](docs/independent-mutation-validation.md)
- [Earlier coverage/smoke experiments](docs/legacy-decision-bench-readme.md)
- [Consolidation and provenance](../docs/playwright-agent-consolidation.md)

The `src` modules and tests retain their existing interfaces and evidence rules.
The `bench:*` commands, fixtures and study documents are historical experiment
interfaces, not additional products. No model runs or publication are part of
setup or ordinary offline verification. Generated reports stay under ignored
`quality/artifacts`; canonical private tickets, epics and PRDs belong in the
parent `contexts/tasks/<work-item>/` folder. Select existing requirements explicitly
for `qa` and mutation `artifactDir`; do not create a second import folder here.
Mutation config paths resolve relative to the config file; CLI-supplied config
paths resolve relative to the caller's working directory.

Optional local-model environments are configured separately. Do not copy an old
virtual environment, credentials or model cache into source control. Existing
public feeds retain their historical identity; future standard exports use the
parent Playwright Agent identity and the unchanged platform-publish contract.

Feature knowledge and work-item requirements remain in the parent `contexts/`
and ignored `contexts/tasks/<work-item>/` folders; see
[context ownership](../contexts/README.md). Root `npm run quality:context` reads
`quality/fixtures/task-preview.yml`, an offline rubric-preview fixture rather
than an active ticket. Mutation configurations point to the selected requirements
folder; do not duplicate feature documents here. Selecting context does not
enable providers, workloads or publication.
