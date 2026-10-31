import {randomUUID} from 'node:crypto';
import os from 'node:os';
import {type Config,type Requirement} from './config.js';
import {type Inventory,type TeamTest} from './collect.js';
import {evidencePacket,type Label,type LocalProvider} from './providers.js';
import {type Answer} from '../bench-domain.js';
export interface Cell {requirementId:string;testId:string;status:'evaluated'|'error'|'excluded'|'not_run';label:Label;answer?:Answer;elapsedMs?:number;reason?:string;reviewReasons:string[];packetHash?:string}
export interface Coverage {requirementId:string;label:Label;testIds:string[];reviewRequired:true}
export function coverageMatrix(requirements:Requirement[],inventory:Inventory,cells:Cell[]):Coverage[]{return requirements.map(r=>{
 const rows=cells.filter(c=>c.requirementId===r.id);
 const label:Label=rows.some(c=>c.label==='covered')?'covered':rows.some(c=>c.label==='partial')?'partial':inventory.complete&&rows.length===inventory.tests.filter(t=>t.runnable).length&&rows.length>0&&rows.every(c=>c.status==='evaluated'&&c.label==='uncovered')?'uncovered':'needs_judgment';
 return {requirementId:r.id,label,testIds:rows.filter(c=>['covered','partial'].includes(c.label)).map(c=>c.testId),reviewRequired:true};
});}
export function proposeSmoke(c:Config,requirements:Requirement[],inventory:Inventory,cells:Cell[],strictProbability?:number){
 const critical=requirements.filter(r=>r.critical).map(r=>r.id);
 const required=strictProbability===undefined?(c.smoke.mandatoryRequirementIds.length?c.smoke.mandatoryRequirementIds:critical):[...new Set([...critical,...c.smoke.mandatoryRequirementIds])];
 if(required.some(id=>!requirements.some(r=>r.id===id)))throw Error('Smoke policy references unknown requirement IDs');
 const byId=new Map(inventory.tests.map(t=>[t.id,t]));
 const dependencies=(t:TeamTest)=>[...new Set([...t.dependencies,...(c.smoke.dependencies[t.id]??[])])];
 for(const [id,deps] of Object.entries(c.smoke.dependencies))if(!byId.has(id)||deps.some(d=>!byId.has(d)))throw Error('Smoke dependencies reference unknown test IDs');
 function closure(id:string,stack=new Set<string>()):Set<string>{if(stack.has(id))throw Error('Dependency cycle');const t=byId.get(id);if(!t)throw Error('Missing dependency');const out=new Set([id]);for(const dep of dependencies(t))for(const x of closure(dep,new Set([...stack,id])))out.add(x);return out;}
 const dependencyConflicts:string[]=[];const closures=new Map<string,Set<string>>();
 for(const t of inventory.tests)try{closures.set(t.id,closure(t.id));}catch{dependencyConflicts.push(t.id);}
 const unreliable=inventory.tests.filter(t=>!t.runnable||t.passRate!==null&&t.passRate<c.smoke.minPassRate);
 const blocked=new Set(unreliable.map(t=>t.id));
 const reviewCandidates=inventory.tests.filter(t=>t.durationMs===null||t.runs<c.smoke.minRuns||t.passRate===null||t.evidence.issues.length>0||cells.some(x=>x.testId===t.id&&strictProbability!==undefined&&(x.status!=='evaluated'||x.label==='needs_judgment'||(x.answer?.probabilities?.[x.answer.label]??-1)<strictProbability)));
 if(strictProbability!==undefined)for(const t of inventory.tests)if(t.durationMs===null||t.runs<c.smoke.minRuns||t.passRate===null||t.evidence.issues.length>0)blocked.add(t.id);
 const covers=(ids:Set<string>)=>new Set(cells.filter(x=>ids.has(x.testId)&&x.label==='covered'&&x.status==='evaluated'&&(strictProbability===undefined||(x.answer?.probabilities?.covered??-1)>=strictProbability)&&required.includes(x.requirementId)).map(x=>x.requirementId));
 let selected=new Set<string>(),covered=new Set<string>();
 while(covered.size<required.length){
  let best:Set<string>|undefined,bestScore=0;
  for(const t of inventory.tests){
   const added=closures.get(t.id);if(!added||[...added].some(id=>blocked.has(id)))continue;
   const proposed=new Set([...selected,...added]);const extra=[...covers(proposed)].filter(id=>!covered.has(id)).length;if(!extra)continue;
   const records=[...proposed].map(id=>byId.get(id)!);const known=records.every(t=>t.durationMs!==null);
   const duration=records.reduce((s,t)=>s+(t.durationMs??0),0);if(known&&duration>c.smoke.budgetMs)continue;
   const increment=[...added].filter(id=>!selected.has(id)).reduce((s,id)=>s+(byId.get(id)!.durationMs??1000),0);
   const reliability=strictProbability===undefined?1:Math.min(...records.map(t=>t.passRate??0));
   const score=extra*reliability/Math.max(increment,1);if(score>bestScore){best=proposed;bestScore=score;}
  }
  if(!best)break;selected=best;covered=covers(selected);
 }
 const records=[...selected].map(id=>byId.get(id)!);
 const unknownDuration=records.filter(t=>t.durationMs===null).length;
 const insufficientHistory=records.filter(t=>t.runs<c.smoke.minRuns).length;
 const estimatedSerialMs=records.length&&!unknownDuration?records.reduce((s,t)=>s+t.durationMs!,0):null;
 return {selected:[...selected],reviewCandidates:reviewCandidates.map(t=>t.id),mandatoryRequirements:required,estimatedCoveredRequirements:[...covered],missingRequirements:required.filter(id=>!covered.has(id)),dependencyConflicts,
  unreliableTests:unreliable.map(t=>t.id),unknownDurationTests:unknownDuration,insufficientHistoryTests:insufficientHistory,estimatedSerialMs,budgetMs:c.smoke.budgetMs,
  withinBudget:estimatedSerialMs===null?null:estimatedSerialMs<=c.smoke.budgetMs,approved:false as const,reviewRequired:true,
  warnings:[...(!required.length?['Define critical requirements or mandatoryRequirementIds before selecting smoke tests.']:[]),...(unknownDuration?['Some selected tests lack measured duration; budget is unverified.']:[]),...(insufficientHistory?['Some selected tests lack sufficient execution history.']:[]),'Selection is a greedy proposal, not a proof of the smallest feasible suite.','All coverage links are model estimates and need lead review.']};
}
export async function evaluate(c:Config,requirements:Requirement[],inventory:Inventory,provider:LocalProvider,onProgress?:(n:number,total:number)=>void,strictProbability?:number){
 const started=performance.now(),tests=strictProbability===undefined?inventory.tests.filter(t=>t.runnable):inventory.tests,total=requirements.length*tests.length;
 if(total>c.maxPairs)throw Error(`Evaluation needs ${total} pairs; increase maxPairs explicitly or narrow Playwright projects/requirements. No pairs were silently dropped.`);
 const cells:Cell[]=[];let peakRss=process.memoryUsage().rss,consecutiveErrors=0;
 for(const r of requirements)for(const t of tests){
  const p=evidencePacket(r,t),cell:Cell={requirementId:r.id,testId:t.id,status:'not_run',label:'needs_judgment',reviewReasons:[...t.evidence.issues],packetHash:p.hash};
  if(!t.runnable){cell.status='excluded';cell.reason='test_not_runnable';}
  else if(consecutiveErrors>=3){cell.reason='stopped_after_three_provider_errors';}
  else if(!t.evidence.code){cell.status='excluded';cell.reason='unresolved_test_body';}
  else if(p.input.length>c.provider.maxInputChars){cell.status='excluded';cell.reason='input_exceeds_configured_limit';}
  else{
   const time=performance.now();
   try{cell.answer=await provider.ask(p);consecutiveErrors=0;cell.status='evaluated';cell.label=t.evidence.issues.length?'needs_judgment':cell.answer.label as Label;
    if(cell.answer.probabilities&&cell.answer.probabilities[cell.answer.label]<(strictProbability??.8))cell.reviewReasons.push('low_uncalibrated_probability');
   }catch(e){const message=e instanceof Error?e.message:'';cell.status=message==='input_exceeds_model_window'?'excluded':'error';if(cell.status==='error')consecutiveErrors++;cell.reason=/^(input_exceeds_model_window|invalid_json|invalid_decision|incomplete_response|incomplete_or_unexpected_response|http_\d+)$/.test(message)?message:'provider_request_failed';}
   cell.elapsedMs=performance.now()-time;
  }
  peakRss=Math.max(peakRss,process.memoryUsage().rss);cells.push(cell);onProgress?.(cells.length,total);
 }
 return {version:1 as const,protocol:'team-evaluation-v1' as const,runId:randomUUID(),generatedAt:new Date().toISOString(),provider:provider.name??c.provider.kind,datasetKind:c.datasetKind,providerMetadata:provider.metadata,
  hardware:{platform:os.platform(),arch:os.arch(),ramBytes:os.totalmem()},requirements,inventory,cells,coverage:coverageMatrix(requirements,inventory,cells),smoke:proposeSmoke(c,requirements,inventory,cells,strictProbability),
  performance:{evaluationWallMs:performance.now()-started,clientPeakRssBytes:peakRss},approved:false as const};
}
export type TeamReport=Awaited<ReturnType<typeof evaluate>>;
