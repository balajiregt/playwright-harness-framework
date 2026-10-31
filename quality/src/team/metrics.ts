import {digest} from '../context.js';
import {validateTeamMetrics} from '../../shared/team-metrics.mjs';
import type {TeamReport} from './evaluate.js';
export {validateTeamMetrics};
export function publicMetrics(r:TeamReport){
 const valid=r.cells.filter(c=>c.status==='evaluated'),latency=valid.map(c=>c.elapsedMs!).sort((a,b)=>a-b);
 const p=(q:number)=>latency.length?latency[Math.ceil(q*latency.length)-1]:null;
 const tokens=(key:'inputTokens'|'outputTokens')=>valid.length&&valid.every(c=>c.answer?.[key]!==null)?valid.reduce((s,c)=>s+c.answer![key]!,0):null;
 const rss=valid.flatMap(c=>c.answer?.peakProcessRssBytes?[c.answer.peakProcessRssBytes]:[]);
 const s=r.smoke;
 return validateTeamMetrics({schemaVersion:1,protocol:r.protocol,runId:r.runId,generatedAt:r.generatedAt,provider:r.provider,datasetKind:r.datasetKind,modelConfigHash:digest(JSON.stringify({model:r.providerMetadata.model,revision:r.providerMetadata.revision,kind:r.provider})),hardware:r.hardware,
  counts:{requirements:r.requirements.length,tests:r.inventory.tests.length,runnableTests:r.inventory.tests.filter(t=>t.runnable).length,pairs:r.cells.length,attempted:r.cells.filter(c=>['evaluated','error'].includes(c.status)).length,valid:valid.length,errors:r.cells.filter(c=>c.status==='error').length,excluded:r.cells.filter(c=>c.status==='excluded').length,notRun:r.cells.filter(c=>c.status==='not_run').length},
  coverage:{covered:r.coverage.filter(c=>c.label==='covered').length,partial:r.coverage.filter(c=>c.label==='partial').length,uncovered:r.coverage.filter(c=>c.label==='uncovered').length,needsJudgment:r.coverage.filter(c=>c.label==='needs_judgment').length,reviewed:0},
  smoke:{selectedTests:s.selected.length,mandatoryRequirements:s.mandatoryRequirements.length,estimatedCoveredRequirements:s.estimatedCoveredRequirements.length,missingRequirements:s.missingRequirements.length,dependencyConflicts:s.dependencyConflicts.length,unknownDurationTests:s.unknownDurationTests,insufficientHistoryTests:s.insufficientHistoryTests,unreliableTests:s.unreliableTests.length,budgetMs:s.budgetMs,estimatedSerialMs:s.estimatedSerialMs,withinBudget:s.withinBudget,approved:false,measuredSmokeMs:null,faultRetention:null},
  performance:{...r.performance,modelPeakRssBytes:rss.length?Math.max(...rss):null,latencySamples:valid.length,p50Ms:p(.5),p95Ms:p(.95),inputTokens:tokens('inputTokens'),outputTokens:tokens('outputTokens')},quality:{reviewedLabels:0,accuracy:null}});
}
