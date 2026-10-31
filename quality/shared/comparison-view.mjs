const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=x=>typeof x==='number'?`${(x*100).toFixed(1)}%`:'Unavailable';
export function validatePrivateComparison(r){
 if(r?.kind!=='playwright-decision-comparison'||r.version!==2||!Array.isArray(r.requirements)||!Array.isArray(r.inventory?.tests)||!r.runs||Object.keys(r.runs).some(k=>!['laya','jev'].includes(k)))throw Error('Unsupported comparison report');
 const nonnegative=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 const count=x=>Number.isSafeInteger(x)&&x>=0;
 const rate=x=>nonnegative(x)&&x<=1;
 if(!r.policy||!rate(r.policy.minProbability)||!rate(r.policy.minPassRate)||!count(r.policy.minRuns)||!nonnegative(r.policy.budgetMs))throw Error('Invalid comparison policy metrics');
 for(const t of r.inventory.tests){if(t.runs!=null&&(!count(t.runs)||(t.runs>0&&!rate(t.passRate))))throw Error('Invalid comparison history metrics');}
 for(const execution of Object.values(r.smokeExecutions??{})){if(!execution||!['passed','failed','skipped'].every(k=>count(execution[k]))||!nonnegative(execution.wallMs))throw Error('Invalid comparison execution metrics');}
 const tests=new Set(r.inventory.tests.map(t=>t.id)),reqs=new Set(r.requirements.map(x=>x.id));
 if(tests.size!==r.inventory.tests.length||reqs.size!==r.requirements.length||r.inventory.tests.length*r.requirements.length>10000)throw Error('Invalid comparison inventory');
 for(const run of Object.values(r.runs)){
  if(!Array.isArray(run.cells)||run.cells.length>10000||!Array.isArray(run.smoke?.selected)||!Array.isArray(run.smoke?.reviewCandidates))throw Error('Invalid comparison run');
  for(const key of ['estimatedCoveredRequirements','mandatoryRequirements','missingRequirements']){if(!Array.isArray(run.smoke[key]))throw Error('Invalid comparison smoke metrics');}
  const pairs=new Set();
  for(const c of run.cells){const k=JSON.stringify([c.requirementId,c.testId]);if(pairs.has(k)||!tests.has(c.testId)||!reqs.has(c.requirementId)||!['covered','partial','uncovered','needs_judgment'].includes(c.label)||!['evaluated','excluded','error','not_run'].includes(c.status))throw Error('Invalid comparison cell');pairs.add(k);}
 }
 return r;
}
export function renderComparison(r,disagreementsOnly=false){
 validatePrivateComparison(r);
 const providers=['laya','jev'],key=(r,t)=>JSON.stringify([r,t]);
 const maps=Object.fromEntries(providers.map(p=>[p,new Map((r.runs[p]?.cells??[]).map(c=>[key(c.requirementId,c.testId),c]))]));
 const reviews=new Map((r.reviews?.labels??[]).map(l=>[key(l.requirementId,l.testId),l]));
 const decision=(c)=>!c?'Not run':`${esc(c.label)}<br><small>${esc(c.status)}${c.reason?` · ${esc(c.reason)}`:''}${c.answer&&c.answer.label!==c.label?` · raw model: ${esc(c.answer.label)}`:''}</small>`;
 const probability=c=>c?.answer?.probabilities?.[c.answer.label];
 const rows=[];
 for(const req of r.requirements)for(const t of r.inventory.tests){
  const k=key(req.id,t.id),a=maps.laya.get(k),b=maps.jev.get(k),review=reviews.get(k);
  const disagree=a?.status==='evaluated'&&b?.status==='evaluated'&&a.answer?.label!==b.answer?.label;
  if(disagreementsOnly&&!disagree)continue;
  const status=t.results?.at(-1)?.status??'Not recorded';
  rows.push(`<tr><td>${esc(t.title)}<br><small>${esc(t.project)} · ${esc(t.file)}:${esc(t.line)}</small></td><td><span class="execution ${status==='passed'?'passed':status==='failed'||status==='timedOut'?'failed':'unknown'}">${esc(status)}</span></td><td><strong>${esc(req.id)}</strong><p>${esc(req.criterion)}</p>${req.critical?'Critical':''}</td><td>${decision(a)}</td><td>${pct(probability(a))}</td><td>${decision(b)}</td><td>${pct(probability(b))}</td><td>${t.runs?`${Math.round(t.passRate*t.runs)}/${esc(t.runs)} · ${pct(t.passRate)}`:'No history'}</td><td>${providers.map(p=>`${p}: ${!r.runs[p]?'Not run':r.runs[p].smoke.selected.includes(t.id)?'Selected draft; review required':r.runs[p].smoke.reviewCandidates.includes(t.id)?'Review candidate':'Not selected'}`).join('<br>')}</td><td>${disagree?'<strong>Disagreement</strong><br>':''}${review?`${esc(review.label)}<br>${esc(review.reviewer)} · ${esc(review.reviewedAt)}<p>${esc(review.notes??'')}</p>`:'Not reviewed'}<details><summary>Inspect evidence and review identifiers</summary><p>Test ID: ${esc(t.id)}<br>Packet hash: ${esc(a?.packetHash??b?.packetHash)}</p><pre>${esc(t.evidence?.code)}</pre>${(t.evidence?.sources??[]).map(s=>`<pre>${esc(s.code)}</pre>`).join('')}<p>${esc(t.evidence?.issues?.join(', '))}</p></details></td></tr>`);
 }
 return `<h1>Jev / Laya · Playwright review</h1><p>Private report · ${esc(r.datasetKind)} · ${esc(r.generatedAt)} · ${r.inventory.tests.length} tests · ${r.requirements.length} criteria</p><p class="notice">Execution success, model-estimated coverage and selected-label probability are separate signals. All smoke proposals require review. Percentages are not calibrated safety guarantees.</p><div class="comparison-cards">${providers.map(p=>{
  const run=r.runs[p];if(!run)return `<section><h2>${p}</h2><p>Not run. No result inferred.</p></section>`;
  const valid=run.cells.filter(c=>c.status==='evaluated').length,s=run.smoke,execution=r.smokeExecutions?.[p];
  return `<section><h2>${p} · ${esc(run.providerMetadata?.model)}</h2><small>${esc(run.providerMetadata?.revision??'')} ${esc(run.providerMetadata?.device??'Hosted TypeSafe API')}</small><p>${valid}/${run.cells.length} assessments completed</p><progress max="${run.cells.length||1}" value="${valid}"></progress><p>${s.selected.length} draft smoke tests · ${s.estimatedCoveredRequirements.length}/${s.mandatoryRequirements.length} critical criteria estimated covered</p><progress max="${s.mandatoryRequirements.length||1}" value="${s.estimatedCoveredRequirements.length}"></progress><p>Missing: ${esc(s.missingRequirements.join(', ')||'None estimated')}</p><p>${execution?`Executed: ${esc(execution.passed)} passed, ${esc(execution.failed)} failed, ${esc(execution.skipped)} skipped · ${(execution.wallMs/1000).toFixed(2)}s`:'Smoke subset not executed'}</p></section>`;
 }).join('')}</div><p>Policy: model probability ≥ ${pct(r.policy.minProbability)}, first-attempt pass rate ≥ ${pct(r.policy.minPassRate)}, ${esc(r.policy.minRuns)} runs, ${esc(r.policy.budgetMs/1000)}s budget.</p><div class="table-wrap"><table><thead><tr>${['Test','Execution','Requirement','Laya coverage','Laya probability','Jev coverage','Jev probability','Historical pass rate','Smoke proposal','Review / evidence'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
export const comparisonCss=`body{font:15px system-ui;color:#172c46;background:#f4f7fb;margin:0;padding:24px}h1{font-size:28px}.notice{padding:16px;border-left:4px solid #b57600;background:#fff5dc}.comparison-cards{display:flex;gap:16px;flex-wrap:wrap}.comparison-cards section{flex:1;min-width:240px;background:white;padding:20px;border:1px solid #dce4ed;border-radius:10px}progress{width:100%;accent-color:#3569a1}.table-wrap{overflow:auto}table{border-collapse:collapse;background:white;width:100%}th,td{text-align:left;vertical-align:top;padding:12px;border:1px solid #dce4ed;min-width:100px}small{color:#53657d}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:650px}details{min-width:190px}summary{cursor:pointer}.execution{font-weight:600}`;
