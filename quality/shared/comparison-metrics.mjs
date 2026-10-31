const exact=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join()!==keys.slice().sort().join())throw Error('Unexpected comparison fields');};
const count=x=>Number.isSafeInteger(x)&&x>=0;
const measure=x=>x===null||typeof x==='number'&&Number.isFinite(x)&&x>=0;
const ratio=(n,d)=>d?n/d:null;
function quality(q,max){
 exact(q,['reviewedPairs','correct','accuracy','predictedCovered','referenceCovered','trueCovered','falseCovered','precision','recall']);
 for(const k of ['reviewedPairs','correct','predictedCovered','referenceCovered','trueCovered','falseCovered'])if(!count(q[k])||q[k]>q.reviewedPairs)throw Error('Invalid quality count');
 if(q.reviewedPairs>max||q.trueCovered>Math.min(q.predictedCovered,q.referenceCovered)||q.falseCovered!==q.predictedCovered-q.trueCovered||q.accuracy!==ratio(q.correct,q.reviewedPairs)||q.precision!==ratio(q.trueCovered,q.predictedCovered)||q.recall!==ratio(q.trueCovered,q.referenceCovered))throw Error('Invalid quality denominator');
}
export function validateComparisonMetrics(d){
 exact(d,['schemaVersion','protocol','datasetKind','runId','generatedAt','inventoryHash','requirementsHash','requirements','tests','hardware','policy','commonPairs','disagreements','providers']);
 if(!['repository','synthetic-fixture'].includes(d.datasetKind)||d.schemaVersion!==2||d.protocol!=='jev-laya-comparison-v1'||!/^[a-f0-9-]{36}$/.test(d.runId)||!Number.isFinite(Date.parse(d.generatedAt))||!/^20\d\d-\d\d-\d\dT[\d:.]+Z$/.test(d.generatedAt))throw Error('Invalid comparison metadata');
 for(const k of ['inventoryHash','requirementsHash'])if(!/^[a-f0-9]{64}$/.test(d[k]))throw Error('Invalid input hash');
 for(const k of ['requirements','tests','commonPairs','disagreements'])if(!count(d[k]))throw Error('Invalid comparison count');
 exact(d.hardware,['platform','arch','ramBytes']);
 if(!['darwin','linux','win32','freebsd','aix','openbsd','sunos'].includes(d.hardware.platform)||!['arm64','x64','arm','ia32','ppc64','s390x','riscv64'].includes(d.hardware.arch)||!count(d.hardware.ramBytes))throw Error('Invalid hardware');
 exact(d.policy,['minProbability','minPassRate','minRuns','budgetMs']);
 for(const k of ['minProbability','minPassRate'])if(typeof d.policy[k]!=='number'||!Number.isFinite(d.policy[k])||d.policy[k]<0||d.policy[k]>1)throw Error('Invalid policy');
 if(!count(d.policy.minRuns)||d.policy.minRuns<1||!measure(d.policy.budgetMs)||!d.policy.budgetMs)throw Error('Invalid policy');
 if(!d.providers||!Object.keys(d.providers).length||Object.keys(d.providers).some(k=>!['laya','jev'].includes(k)))throw Error('Invalid comparison providers');
 for(const p of Object.values(d.providers)){
  exact(p,['modelVersion','modelConfigHash','counts','performance','quality','commonQuality','smoke']);
  if(!['laya-7b928d828b7b','jev-1.13.0','jev-1.14.0','unverified'].includes(p.modelVersion)||!/^[a-f0-9]{64}$/.test(p.modelConfigHash))throw Error('Invalid model hash');
  const c=p.counts;exact(c,['pairs','valid','excluded','errors','notRun','uncertain','lowProbability']);
  if(Object.values(c).some(x=>!count(x))||c.pairs>d.requirements*d.tests||c.pairs!==c.valid+c.excluded+c.errors+c.notRun||c.uncertain>c.valid||c.lowProbability>c.valid)throw Error('Invalid assessment counts');
  const f=p.performance;exact(f,['startupMs','wallMs','p50Ms','p95Ms','modelPeakRssBytes','inputTokens','outputTokens','estimatedApiCostUsd']);
  if(Object.values(f).some(x=>!measure(x))||f.wallMs===null||(c.valid?(f.p50Ms===null||f.p95Ms===null||f.p95Ms<f.p50Ms):(f.p50Ms!==null||f.p95Ms!==null)))throw Error('Invalid performance');
  quality(p.quality,c.valid);quality(p.commonQuality,d.commonPairs);
  const s=p.smoke;exact(s,['selected','reviewCandidates','critical','estimatedCovered','missing','dependencyConflicts','estimatedSerialMs','execution','approved']);
  for(const k of ['selected','reviewCandidates','critical','estimatedCovered','missing','dependencyConflicts'])if(!count(s[k]))throw Error('Invalid smoke count');
  if(s.approved!==false||s.selected>d.tests||s.reviewCandidates>d.tests||s.dependencyConflicts>d.tests||s.critical>d.requirements||s.critical!==s.estimatedCovered+s.missing||!measure(s.estimatedSerialMs))throw Error('Invalid smoke proposal');
  if(s.execution!==null){const e=s.execution;exact(e,['wallMs','passed','failed','skipped','selected','recordedAt']);
   if(!measure(e.wallMs)||e.wallMs===null||['passed','failed','skipped','selected'].some(k=>!count(e[k]))||e.selected!==s.selected||e.selected!==e.passed+e.failed+e.skipped||!/^20\d\d-\d\d-\d\dT[\d:.]+Z$/.test(e.recordedAt))throw Error('Invalid smoke execution');}
 }
 if(d.disagreements>d.commonPairs||Object.keys(d.providers).length<2&&d.commonPairs!==0||Object.values(d.providers).some(p=>d.commonPairs>p.counts.valid))throw Error('Invalid matched comparison');
 return d;
}
