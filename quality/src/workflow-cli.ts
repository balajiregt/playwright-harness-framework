import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, confinedFile, digest, resolveContext } from './context.js';
import { workItemsSchema, buildChecks, workflowVersion, type WorkflowReport } from './workflow.js';
import { renderLeadReports } from './lead-report.js';

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    input: { type: 'string', default: 'examples/lead-review.json' }
  } });
  if (positionals.length !== 1 || !['resolve', 'preview'].includes(positionals[0])) throw new Error('Only offline resolve and preview are available.');
  if (positionals[0] === 'resolve') { await resolveContext(); console.log('Resolved offline evidence context.'); return; }
  const input = await readFile(await confinedFile(ROOT, values.input!), 'utf8');
  const items = workItemsSchema.parse(JSON.parse(input));
  const checks = buildChecks(items);
  const report: WorkflowReport = { runId: digest(input), mode: 'preview', generatedAt: new Date().toISOString(),
    rubricVersion: workflowVersion, minimum: .8, inputPath: values.input!, inputHash: digest(input), items, checks, rows: [], decisions: [] };
  await mkdir(path.join(ROOT, 'artifacts'), { recursive: true });
  await writeFile(path.join(ROOT, 'artifacts/lead-preview.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(ROOT, 'artifacts/lead-preview.html'), renderLeadReports([report]));
  console.log(`Offline scaffold: ${checks.length} checks; no model calls or measured results. artifacts/lead-preview.html`);
}
main().catch(() => { console.error('Preview failed: check command, schema and input path.'); process.exitCode = 1; });
