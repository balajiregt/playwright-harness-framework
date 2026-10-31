import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, confinedFile, digest } from './context.js';
import { buildChecks, workItemsSchema, workflowVersion } from './workflow.js';
import { models, providers, decisionRequest, evidenceHash, type ComparisonReport } from './comparison.js';
import { renderComparison } from './comparison-report.js';

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    input: { type: 'string', default: 'examples/lead-review.json' }
  } });
  if (positionals.length !== 1 || positionals[0] !== 'preview') throw new Error('Only offline preview is available; provider integration is pending.');
  const input = await readFile(await confinedFile(ROOT, values.input!), 'utf8');
  const checks = buildChecks(workItemsSchema.parse(JSON.parse(input)));
  const report: ComparisonReport = { version: 'paired-decisions-v1', runId: digest(input), generatedAt: new Date().toISOString(),
    mode: 'preview', rubricVersion: workflowVersion, inputHash: digest(input), inputPath: values.input!,
    endpoint: 'Offline normalized contract; provider adapters pending', models, thresholds: { laya: .8, openai: .8 }, checks, rows: [] };
  const artifacts = path.join(ROOT, 'artifacts'); await mkdir(artifacts, { recursive: true });
  await writeFile(path.join(artifacts, 'comparison-preview.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(artifacts, 'comparison-requests-preview.json'), JSON.stringify({
    status: 'offline_normalized_contract', notice: 'Not verified provider wire requests. No API calls.',
    checks: checks.map(check => ({ checkId: check.id, evidenceHash: evidenceHash(check), packets: providers.map(p => decisionRequest(check, p)) }))
  }, null, 2));
  await writeFile(path.join(artifacts, 'comparison-preview.html'), renderComparison(report));
  console.log(`Offline comparison scaffold: ${checks.length} shared evidence packets; no model calls. artifacts/comparison-preview.html`);
}
main().catch(() => { console.error('Only offline preview is available; check the command and input schema.'); process.exitCode = 1; });
