# Optional UTCP Code Mode experiment

The linked [MCP vs Code Mode artifact](https://claude.ai/artifact/GXqK2CGJi3Qj5STPMj3eEh)
motivates this project-local experiment. It uses the real
[`@utcp/code-mode` library](https://github.com/universal-tool-calling-protocol/code-mode)
and the official MCP SDK to call this project's existing mutation tools.

Install separately from the evaluator. Native `isolated-vm` was verified with
**Node 22**, which is recommended for this optional integration. The main evaluator
also ran under Node 26. Never install this integration globally.

```bash
cd integrations/code-mode
npm ci
npm run check -- --config ../../examples/mutation/role-aware.config.json
node --no-node-snapshot check-mcp.mjs --config ../../examples/mutation/role-aware.config.json
node --no-node-snapshot check-mcp.mjs --config ../../examples/mutation/role-aware.config.json --read-only
npm start -- --config ../../examples/mutation/role-aware.config.json
```

Run the sample `mutation plan` command first so `inspect` has a valid plan.
`check` verifies classic and Code Mode tool results match. `check-mcp.mjs`
verifies the full outer MCP → sandbox → inner mutation MCP chain.
`start` serves two MCP tools: `interfaces` and `call_tool_chain`.

For the independent benchmark, use a frozen workload instead of `--config`:

```bash
node --no-node-snapshot server.mjs --workload /absolute/path/to/workload.json
```

This assessment-only mode exposes `qa.analysis_packet({pairId: "..."})` through
Code Mode. Add `--pair` to restrict an invocation to one pair. There are no
execution, planning or observed-result tools in this scope. The local Laya
orchestrator retrieves this packet before calling Python; Codex retrieves it
through its MCP client. See the
[independent workflow](../../docs/independent-mutation-analysis.md).

An example code body after reading `interfaces`:

```js
const context = qa.context({});
const plan = qa.inspect({});
return {
  artifacts: context.artifacts.length,
  criteria: plan.requirements.length,
  faults: plan.mutations.map(m => ({id: m.id, criterion: m.requirementId}))
};
```

To connect your Codex/other MCP client, use a **project-local** configuration with
an absolute path and your Node 22 binary:

```toml
[mcp_servers.playwright_mutation_code_mode]
command = "/absolute/path/to/node"
args = ["--no-node-snapshot", "/absolute/path/to/project/integrations/code-mode/server.mjs", "--config", "/absolute/path/to/mutation.config.local.json"]
```

`--allow-hosted` exposes Codex planning; `--allow-run` exposes isolated fault
execution. Both flags must be explicitly supplied when starting the server.
Use `--read-only` to expose only context/evidence and existing plan inspection;
model assessment, planning and fault execution are then unavailable through code.
Calls to `qa.assess({})` run the local Laya workload. The sandbox can reach only
this configured MCP catalogue; arbitrary manuals, shell/network/HTTP plugins and
dynamic server registration are not exposed. Limits: 128 MiB isolate, 20,000
code characters and 100,000 result characters. Timeout bounds the code chain;
it does not cancel a tool operation already running in the host.

Versions are pinned in package-lock.json: Code Mode 1.2.13 (MPL-2.0), SDK 1.1.0,
isolated-vm 6.2.0 and official MCP SDK 1.32.2. Upstream provenance:
[Code Mode source](https://github.com/universal-tool-calling-protocol/code-mode/tree/main/typescript-library).
The upstream `@utcp/mcp` adapter was tested but not retained: its bundled legacy
Zod conflicted with the patched validator. A narrow adapter uses the official
MCP client directly and supplies its real tool catalogue to Code Mode's public
`getTools` / `callTool` methods. The scoped SDK Zod 4.6.7 override is covered by
both round-trip checks. Dependency audit was clean on 31 October 2026.

The signed-in default Codex CLI was also tested against this actual MCP server
with `--read-only`: it read `interfaces`, made one `call_tool_chain` request batching
context/plan inspection, and returned the correct three criteria and three faults.
No global MCP entry was installed. This checks compatibility, not efficiency.

The external artifact's savings are not our measurements. No installed global
hooks, MCP changes, publication, paid API calls or Jira/Confluence connections
are caused by installing this experiment.
