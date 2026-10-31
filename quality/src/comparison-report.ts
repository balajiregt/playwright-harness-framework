import { comparisonMetrics, decisionRequest, evidenceHash, models, providers, type ComparisonReport, type ComparisonRow } from './comparison.js';
import { stages } from './workflow.js';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const percent = (n: number | null | undefined) => n == null ? '—' : `${(n * 100).toFixed(1)}%`;
function result(row?: ComparisonRow) {
  if (!row || row.status !== 'evaluated') return `<strong>${escape(row?.status ?? 'not_run')}</strong><p>${escape(row?.errorCode ?? 'No usable finding')}</p>`;
  return `<strong class="${row.decision}">${escape(row.rawFinding)}</strong><p>Route: ${row.decision} · selected probability ${percent(row.probability)}</p>
    <p>Provider confidence: ${percent(row.confidence)} · ${escape(row.routingReason)}</p>
    <details><summary>Distribution and metadata</summary><pre>${escape(JSON.stringify(row, null, 2))}</pre></details>`;
}
export function renderComparison(report: ComparisonReport) {
  const metrics = comparisonMetrics(report);
  const cards = providers.map(p => {
    const m = metrics.providers[p];
    return `<article><h2>${p === 'laya' ? 'Local Laya' : 'OpenAI Decisions'}</h2><code>${models[p]}</code>
    <div class="score">${!m.completed ? 'Unavailable' : m.matched === null ? '—' : `${m.matched}/${m.requested}`}</div><p>Exact gold matches / requested checks</p>
    <p>Accuracy on completed: ${percent(m.accuracy)} · issue recall: ${percent(m.issueRecall)}</p>
    <p>${m.completed} completed · ${m.errors} errors · ${m.refusals} refusals · ${m.notRun} not run</p>
    <p>Unsafe positive findings: ${m.unsafePositive ?? '—'} · needs human review: ${m.humanReview ?? '—'}</p>
    <p>Observed median request: ${m.medianMs === null ? '—' : `${m.medianMs} ms`} · reported cost: ${m.reportedCostUsd === null ? 'unavailable' : `$${m.reportedCostUsd.toFixed(6)} (${m.costReportedCalls} calls)`}</p>
    <p>Provisional probability threshold: ${report.thresholds[p]}</p>
    ${stages.map(stage => {
      const counts = m.stages[stage];
      const total = report.checks.filter(c => c.stage === stage).length;
      return `<h3>${stage}</h3><div class="bar" aria-label="${stage}: ${counts.positive} positive, ${counts.negative} negative, ${counts.neutral} neutral out of ${total}">
        ${(['positive', 'negative', 'neutral'] as const).map(d => `<span class="${d}" style="width:${total ? counts[d] / total * 100 : 0}%"></span>`).join('')}</div>
        <small>${counts.positive} positive / ${counts.negative} negative / ${counts.neutral} neutral / ${total - counts.positive - counts.negative - counts.neutral} unavailable</small>`;
    }).join('')}</article>`;
  }).join('');
  const rows = report.checks.map(check => {
    const pair = providers.map(p => report.rows.find(r => r.checkId === check.id && r.provider === p));
    const paired = pair.every(r => r?.status === 'evaluated');
    const agreement = !paired ? 'unavailable' : pair[0]!.rawFinding === pair[1]!.rawFinding ? 'agree' : 'disagree';
    const gold = report.gold?.find(g => g.checkId === check.id);
    return `<section class="check" data-stage="${check.stage}" data-comparison="${agreement}"><h2>${escape(check.subject)}</h2>
      <p>${check.stage} · ${escape(check.id)} · <b>${agreement}</b>${gold ? ` · expected: ${escape(gold.finding)}` : ''}</p>
      ${gold ? `<p>Local gold rationale: ${escape(gold.rationale)}</p>` : ''}
      <div class="grid">${pair.map((row, i) => `<article><h3>${providers[i]}</h3>${result(row)}</article>`).join('')}</div>
      <details><summary>Shared evidence and normalized question contract</summary><p>Shared packet SHA-256: ${evidenceHash(check)}</p>
      <pre>${escape(JSON.stringify(JSON.parse(check.request.state), null, 2))}</pre><pre>${escape(JSON.stringify(decisionRequest(check, 'laya').questions, null, 2))}</pre></details></section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Playwright review · Laya vs OpenAI</title>
  <style>body{font:16px/1.55 system-ui,sans-serif;margin:0;background:#f3f6fa;color:#17283c}main{max-width:1180px;margin:auto;padding:36px 20px}h1{font-size:clamp(28px,4vw,44px);line-height:1.15}h2{font-size:22px}h3{font-size:16px;margin-bottom:8px}article,.check{padding:22px;background:white;border:1px solid #d5dfe9;border-radius:14px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.check{margin-top:18px}.score{font-size:42px;font-weight:750;margin-top:18px}p{margin:10px 0}code,pre{font:13px/1.6 ui-monospace,monospace}pre{overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6f9;padding:16px;border-radius:8px}code{overflow-wrap:anywhere}.bar{display:flex;background:#dfe5ed;height:16px;border-radius:8px;overflow:hidden}.bar .positive{background:#16856a}.bar .negative{background:#d84d4f}.bar .neutral{background:#d9a225}.positive{color:#067052}.negative{color:#ae242c}.neutral{color:#795500}small{font-size:12px}summary{cursor:pointer;margin-top:16px}select{font:inherit;padding:8px;margin:0 16px 0 8px}header{margin-bottom:24px}.flow{padding:18px;background:#17283c;color:white;border-radius:12px}.notice{border-left:4px solid #d9a225;padding-left:14px}.filters{margin:25px 0}[hidden]{display:none!important}@media(max-width:740px){.grid{grid-template-columns:1fr}main{padding:20px 12px}}</style></head>
  <body><main><header><p>PLAYWRIGHT QUALITY REVIEW · ${report.mode.toUpperCase()}</p><h1>Same evidence. Two planned decision models.</h1>
  <p class="flow">Ticket + scenarios → paired planning review → lead agrees plan → Playwright test/helper evidence → paired assertion review → lead decision</p>
  <p>${escape(report.generatedAt)} · rubric ${escape(report.rubricVersion)} · ${report.checks.length} checks</p>
  <p class="notice">${report.mode === 'preview' ? 'Offline preview: no model calls or measured performance.' : !metrics.pairedCompleted ? 'No completed model pairs. Comparison unavailable; inspect access errors and unrun checks below.' : 'One observation per model/check. This run does not establish a general winner or a calibrated production gate.'} Passing test status is separate from assertion adequacy. Notes and gold rationales are local, not model explanations.</p></header>
  <div class="grid">${cards}</div><p><b>${metrics.agreements} agreements / ${metrics.pairedCompleted} completed pairs</b> · ${metrics.disagreements} disagreements. Agreement does not establish correctness. Gray chart space means unavailable.</p>
  <p>Issue recall counts gold-negative checks detected as negative, including unrun/error checks in the denominator. Unsafe positive means a raw positive on gold-negative or gold-neutral evidence. Errors and refusals need review; they are not neutral model answers. Cost is only the sum of explicitly returned values, not an invoice.</p>
  <div class="filters"><label>Stage<select id="stage"><option value="all">All</option>${stages.map(s => `<option>${s}</option>`).join('')}</select></label><label>Comparison<select id="comparison"><option value="all">All</option><option>disagree</option><option>agree</option><option>unavailable</option></select></label></div>${rows}
  <footer><p>Run ${escape(report.runId)} · input SHA-256 ${report.inputHash}</p><p>Transport: ${endpointLabel(report.endpoint)}. No test execution, deletion or release approval occurs here.</p></footer></main>
  <script>const filters=['stage','comparison'];for(const id of filters)document.getElementById(id).addEventListener('change',()=>{for(const row of document.querySelectorAll('.check'))row.hidden=filters.some(key=>{const value=document.getElementById(key).value;return value!=='all'&&row.dataset[key]!==value})});</script></body></html>`;
}
const endpointLabel = escape;
