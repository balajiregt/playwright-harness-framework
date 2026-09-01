# Graph Outputs

This directory is the generated output location for V2 source-aware graph
intelligence.

Run:

```bash
npm run graph:view
```

The command regenerates:

- `graphs/data/source-graph.json`
- `graphs/data/test-graph.json`
- `graphs/data/coverage-graph.json`
- `graphs/data/duplicates.json`
- `graphs/index.html`

`graphs/index.html` contains an interactive SVG graph with:

- filter toggles for source, tests, coverage, captures, gaps, and duplicates
- colored node types for routes, roles, components, actions, states, tests,
  tags, captures, page objects, assertions, gaps, and duplicate risks
- click-to-inspect node details and relationship counts
- linked graph inputs for source manifests, specs, tests, captures, page
  objects, and assertion helpers

The source side of the graph is driven by a source manifest contract, not by
sample CRM assumptions. This repo ships a generic scanner for first-pass
manifests and a demo adapter for `examples/sample-crm-app`. Teams can start
with the scanner, then generate the same manifest shape from their own route
config, source files, feature metadata, or app-specific manifest command when
they need more precision.

Useful source commands:

```bash
npm run source:manifest
npm run source:manifest:check
npm run source:manifest -- --root=path/to/app --output=source-manifest.json --url=http://localhost:3000 --name=my-app
npm run source:manifest:crm
```

Use `SOURCE_MANIFEST_COMMAND`, `SOURCE_MANIFEST_ADAPTER`, and
`SOURCE_MANIFEST` to point the graph at a non-sample application. Start with
the generic scanner; use custom commands or adapters only when a project needs
more exact auth, role, feature flag, or dynamic-state semantics.

The graph report should be used with the agent enrichment loop: scan source,
review discovered routes/actions/states, compare with tests and captures, then
curate the capture workflow before generating or healing tests.

Spec templates such as `specs/prompt-flow-template.md` are intentionally
excluded from flow-spec nodes. They are authoring aids, not executable or
coverage-bearing flow specs.

The graph is most useful when concrete new role or business flows have real
spec files. Small changes, such as adding one assertion to an existing flow, can
update the owning test or helper directly and do not need a new spec file.

These files are reproducible reports and are ignored by Git by default. Commit
the scripts and context rules, not transient graph output, unless the team
explicitly promotes a report to a versioned example.
