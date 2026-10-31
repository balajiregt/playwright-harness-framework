import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './context.js';
import { workflowSummary, type WorkflowReport } from './workflow.js';

export function renderLeadReports(reports: WorkflowReport[]) {
  const data = JSON.stringify(reports.map(report => ({ ...report, summary: workflowSummary(report.checks, report.rows, report.gold) })))
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const css = readFileSync(new URL('./lead-style.css', import.meta.url), 'utf8');
  const js = readFileSync(new URL('./lead-client.js', import.meta.url), 'utf8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Model · Lead review</title><style>${css}</style></head><body><main>
  <header><span class="eyebrow">PLAYWRIGHT DECISION BENCH / LEAD REVIEW</span><h1>Does the test verify the requirement?</h1><p>Review scenario coverage, potential duplication and actual assertions. Model findings and reviewer decisions remain separate.</p></header>
  <nav id="report-tabs" aria-label="Saved reports"></nav><p id="run-meta" class="muted"></p>
  <div class="workflow" aria-label="Review workflow"><div><b>1. Context</b><span>Epics · tickets · team instructions</span></div><div><b>2. Scenario review</b><span>Inventory · coverage · duplication</span></div><div><b>3. Implementation review</b><span>Agreed plan · code · run evidence</span></div><div><b>4. Lead decision</b><span>Approve · revise · clarify</span></div></div>
  <div id="summary" class="summary"></div>
  <section><h2>Review stages</h2><p class="muted">Counts show routed recommendations, not test pass rates. Select a stage to inspect its findings.</p><div id="stage-graph" class="stage-graph"></div><div class="legend"><span class="positive">● Supported / distinct</span><span class="negative">● Gap / duplicate candidate</span><span class="neutral">● Human judgment</span></div></section>
  <section><h2>Acceptance criteria → scenarios → assertions</h2><p class="muted">Scenario links are author-supplied hints. The evaluator reads the full supplied inventory and code; a claimed link is not proof.</p><div class="table-scroll"><table><thead><tr><th>Criterion</th><th>Scenario links</th><th>Planning</th><th>Implementation</th></tr></thead><tbody id="coverage"></tbody></table></div></section>
  <section><div class="section-head"><div><h2>Findings and evidence</h2><span id="finding-count" class="muted" aria-live="polite"></span></div><div class="filters"><label>Stage<select id="stage-filter"><option value="all">All stages</option><option value="planning">Scenario planning</option><option value="duplication">Duplication</option><option value="implementation">Implementation</option></select></label><label>Decision<select id="decision-filter"><option value="all">All decisions</option><option value="positive">Supported / distinct</option><option value="negative">Gap / duplicate candidate</option><option value="neutral">Human judgment</option><option value="pending">Errors / not evaluated</option></select></label></div></div>
  <div class="explorer"><div id="findings"></div><article id="detail" aria-live="polite"></article></div></section>
  <footer>Advisory review only. Notes are local templates, not Model-generated explanations. Probabilities are uncalibrated; the threshold is provisional. Synthetic examples contain illustrative run records, not executed Playwright results. No tests are edited, deleted or approved automatically.</footer>
  </main><script id="lead-data" type="application/json">${data}</script><script>${js}</script></body></html>`;
}

export async function buildLeadReports() {
  const reports: WorkflowReport[] = [];
  for (const prefix of ['lead-review', 'workflow-benchmark', 'lead-preview']) {
    const file = path.join(ROOT, 'artifacts', `${prefix}.json`);
    if (!existsSync(file)) continue;
    const report: WorkflowReport = JSON.parse(await readFile(file, 'utf8'));
    reports.push(report);
    await writeFile(path.join(ROOT, 'artifacts', `${prefix}.html`), renderLeadReports([report]));
  }
  if (reports.length) await writeFile(path.join(ROOT, 'artifacts/index.html'), renderLeadReports(reports));
  return reports.length;
}
