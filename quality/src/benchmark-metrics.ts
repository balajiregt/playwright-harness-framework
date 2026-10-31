import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './context.js';
import { stages, outcomes, stageOutcomes, type WorkflowReport } from './workflow.js';
const issue = (finding: string) => ['coverage_gap','assertion_gap','duplicate_candidate'].includes(finding);
export function benchmarkMetrics(report: WorkflowReport) {
  const ids = report.checks.map(c=>c.id);
  if (new Set(ids).size !== ids.length || new Set(report.rows.map(r=>r.checkId)).size !== report.rows.length || report.rows.some(r=>!ids.includes(r.checkId))) throw Error('Invalid or duplicate check identity');
  if (!report.gold || new Set(report.gold.map(g=>g.checkId)).size !== report.gold.length || report.gold.length!==ids.length || report.gold.some(g=>!ids.includes(g.checkId))) throw Error('Metrics require complete unique gold for the selected checks');
  for (const row of report.rows) if (row.status==='evaluated') {
    const check=report.checks.find(c=>c.id===row.checkId)!;
    if (!row.rawFinding || !stageOutcomes[check.stage].includes(row.rawFinding)) throw Error('Invalid finding for stage');
  }
  const calculated = (stage?: string) => {
    const checks=report.checks.filter(c=>!stage||c.stage===stage);
    const rows=report.mode==='live' ? report.rows.filter(r=>checks.some(c=>c.id===r.checkId)&&r.status==='evaluated') : [];
    if (!rows.length) return { requested:checks.length,evaluated:0,metrics:null,reason:report.mode==='preview'?'Preview is not model evidence':'No evaluated model responses' };
    const gold=report.gold!.filter(g=>checks.some(c=>c.id===g.checkId));
    const expectedIssues=gold.filter(g=>issue(g.finding)).length;
    let tp=0,fp=0,fn=0,tn=0,exact=0,routedTp=0,routedFp=0;
    for(const g of gold) {
      const r=rows.find(r=>r.checkId===g.checkId);
      if(r?.rawFinding===g.finding)exact++;
      if(issue(g.finding)) {if(r&&issue(r.rawFinding!))tp++;else fn++;}
      else if(r) {if(issue(r.rawFinding!))fp++;else tn++;}
      if(r?.decision==='negative'){if(issue(g.finding))routedTp++;else routedFp++;}
    }
    const usableTimes=rows.filter(r=>Number.isFinite(r.elapsedMs)).map(r=>r.elapsedMs!);
    return {requested:checks.length,evaluated:rows.length,metrics:{truePositive:tp,falsePositive:fp,falseNegative:fn,trueNegative:tn,
      precision:tp+fp?tp/(tp+fp):null,recall:expectedIssues?tp/expectedIssues:null,missedIssueRate:expectedIssues?fn/expectedIssues:null,
      falseAlarmRate:fp+tn?fp/(fp+tn):null,exactFindingAccuracy:exact/rows.length,evaluationCoverage:rows.length/checks.length,
      routedIssuePrecision:routedTp+routedFp?routedTp/(routedTp+routedFp):null,routedIssueRecall:expectedIssues?routedTp/expectedIssues:null,
      latencySamples:usableTimes.length,totalEvaluatedMs:usableTimes.length?usableTimes.reduce((a,b)=>a+b,0):null,
      tokens:null,cost:null,humanReviewMs:null}};
  };
  return {schemaVersion:1,benchmark:'crm-review-scaffold-v2',mode:report.mode,rubricVersion:report.rubricVersion,runId:report.runId,inputHash:report.inputHash,
    overall:calculated(),stages:Object.fromEntries(stages.map(s=>[s,calculated(s)])),
    limitations:['Gold labels remain evaluator-only. Authored synthetic CRM evidence is not production evidence.','Issue detection and exact finding classification are separate metrics.','Failed/unrun checks count as undetected expected issues in end-to-end recall; exact accuracy is conditional on evaluated rows.','Raw findings and confidence-routed findings are separate. Null means unmeasured. No cost or human-time inference.']};
}
if (process.argv[1]===fileURLToPath(import.meta.url)) {
 try {const file=process.argv[2]??'artifacts/workflow-benchmark.json';const raw=readFileSync(file,'utf8');const metrics={...benchmarkMetrics(JSON.parse(raw)),reportSha256:digest(raw)};mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/crm-benchmark-metrics.json',JSON.stringify(metrics,null,2)+'\n');console.log(JSON.stringify(metrics,null,2));}catch(e){console.error(e instanceof Error?e.message:'Metrics failed');process.exitCode=1;}
}
