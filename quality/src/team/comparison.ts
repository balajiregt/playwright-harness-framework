import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadEnvFile} from 'node:process';
import {z} from 'zod';
import {ROOT,digest} from '../context.js';
import {type Config,type Requirement} from './config.js';
import {collect,applyHistory,type Inventory} from './collect.js';
import {importRequirements} from './requirements.js';
import {makeProvider,evidencePacket,type LocalProvider} from './providers.js';
import {evaluate,type TeamReport} from './evaluate.js';
import {jevProvider,jevRequest,JEV_INPUT_USD_PER_MILLION} from './jev.js';
import {renderComparison,comparisonCss} from '../../shared/comparison-view.mjs';
import {validateComparisonMetrics} from '../../shared/comparison-metrics.mjs';

export type ComparisonProvider='laya'|'jev';
export const reviewSchema=z.object({version:z.literal(1),inventoryHash:z.string(),requirementsHash:z.string(),labels:z.array(z.object({
 requirementId:z.string(),testId:z.string(),packetHash:z.string(),label:z.enum(['covered','partial','uncovered','needs_judgment']),
 reviewer:z.string().min(1).max(120),reviewedAt:z.string().datetime(),notes:z.string().max(2000).optional()
}).strict())}).strict();
export type Reviews=z.infer<typeof reviewSchema>;
export interface Comparison {
 version:2;datasetKind:'repository'|'synthetic-fixture';kind:'playwright-decision-comparison';runId:string;generatedAt:string;
 inventoryHash:string;requirementsHash:string;requirements:Requirement[];inventory:Inventory;
 policy:{minProbability:number;minPassRate:number;minRuns:number;budgetMs:number};
 runs:Partial<Record<ComparisonProvider,TeamReport>>;reviews:Reviews|null;
 smokeExecutions:Partial<Record<ComparisonProvider,{wallMs:number;passed:number;failed:number;skipped:number;selected:number;recordedAt:string}>>;
}
export const inventoryHash=(inv:Inventory)=>digest(JSON.stringify(inv.tests.map(t=>[t.id,t.evidence.fingerprint,t.dependencies,t.runnable])));
export function attachReviews(report:Comparison,input:unknown){
 const r=reviewSchema.parse(input);
 if(r.inventoryHash!==report.inventoryHash||r.requirementsHash!==report.requirementsHash)throw Error('Reviewer labels refer to different inputs');
 const seen=new Set<string>();
 for(const l of r.labels){
  const key=JSON.stringify([l.requirementId,l.testId]);if(seen.has(key))throw Error('Duplicate reviewed pair');seen.add(key);
  const req=report.requirements.find(x=>x.id===l.requirementId),t=report.inventory.tests.find(x=>x.id===l.testId);
  if(!req||!t||evidencePacket(req,t).hash!==l.packetHash)throw Error('Stale or unknown reviewed pair');
 }
 report.reviews={...r,labels:[...(report.reviews?.labels??[]).filter(l=>!seen.has(JSON.stringify([l.requirementId,l.testId]))),...r.labels]};
}
export async function runComparison(c:Config,providers:ComparisonProvider[],allowHosted:boolean,reviewsFile?:string,factory?:(name:ComparisonProvider)=>Promise<LocalProvider>){
 if(!providers.length||new Set(providers).size!==providers.length||providers.some(p=>!['laya','jev'].includes(p)))throw Error('Choose laya, jev or laya,jev');
 if(providers.includes('jev')&&!allowHosted)throw Error('Jev sends test evidence to TypeSafe. Explicitly pass --allow-hosted.');
 if(providers.includes('jev')&&!factory){try{loadEnvFile(path.join(ROOT,'.env.local'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Cannot load .env.local');}
  if(!process.env.TYPESAFE_API_KEY)throw Error('TYPESAFE_API_KEY is missing. Add it to .env.local, or select --providers laya.');
 }
 const requirements=(await importRequirements(c.requirements,c.python)).requirements;
 const inventory=await applyHistory(await collect(c,false,true),c.history);
 const tests=inventory.tests.filter(t=>t.runnable);
 if(requirements.length*inventory.tests.length>c.maxPairs)throw Error('Comparison exceeds configured maxPairs; no provider was called');
 // Conservative pre-call byte budget; actual usage is reported separately, never a billed-cost claim.
 const upperTokens=requirements.reduce((n,r)=>n+tests.reduce((s,t)=>s+Buffer.byteLength(JSON.stringify(jevRequest(evidencePacket(r,t),c.comparison.jevModel)))+2048,0),0);
 if(providers.includes('jev')&&upperTokens*JEV_INPUT_USD_PER_MILLION/1e6>c.comparison.maxCostUsd)throw Error('Conservative Jev input estimate exceeds comparison.maxCostUsd; narrow scope or raise the cap explicitly');
 const report:Comparison={version:2,datasetKind:c.datasetKind,kind:'playwright-decision-comparison',runId:randomUUID(),generatedAt:new Date().toISOString(),inventoryHash:inventoryHash(inventory),requirementsHash:digest(JSON.stringify(requirements)),requirements,inventory,policy:{minProbability:c.comparison.minProbability,minPassRate:c.smoke.minPassRate,minRuns:c.comparison.minRuns,budgetMs:c.smoke.budgetMs},runs:{},reviews:null,smokeExecutions:{}};
 const dir=path.join(c.output,report.runId);await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,'inputs.json'),JSON.stringify({inventory,requirements},null,2));
 for(const name of providers){
  const config:Config={...c,provider:{...c.provider,kind:'laya'},smoke:{...c.smoke,minRuns:c.comparison.minRuns}};
  let provider:LocalProvider;
  try{provider=factory?await factory(name):name==='laya'?await makeProvider(config):jevProvider(c.comparison.jevModel,process.env.TYPESAFE_API_KEY!,c.provider.timeoutMs);}
  catch{
   provider={name:name==='jev'?'jev':undefined,metadata:{model:name==='jev'?c.comparison.jevModel:'convaiinnovations/laya',initialization:'failed'},async ask(){throw Error('provider_request_failed');},close(){}};
  }
  try{report.runs[name]=await evaluate(config,requirements,inventory,provider,(n,total)=>{if(n%10===0||n===total)console.log(`${name}: ${n}/${total} pairs`);},c.comparison.minProbability);}
  finally{provider.close();}
  await saveComparison(dir,report);
 }
 if(reviewsFile)attachReviews(report,JSON.parse(await readFile(reviewsFile,'utf8')));
 await saveComparison(dir,report);return {dir,report};
}
export function comparisonMetrics(r:Comparison){
 const key=(c:{requirementId:string;testId:string})=>JSON.stringify([c.requirementId,c.testId]);
 const laya=r.runs.laya?.cells.filter(c=>c.status==='evaluated')??[],jev=r.runs.jev?.cells.filter(c=>c.status==='evaluated')??[];
 const j=new Map(jev.map(c=>[key(c),c]));const common=laya.filter(c=>j.get(key(c))?.packetHash===c.packetHash);
 const commonKeys=new Set(common.map(key)),labels=new Map(r.reviews?.labels.map(l=>[key(l),l.label])??[]);
 const ratio=(n:number,d:number)=>d?n/d:null;
 const quality=(cells:typeof laya)=>{const labelled=cells.filter(c=>labels.has(key(c))),covered=labelled.filter(c=>c.answer?.label==='covered'),gold=labelled.filter(c=>labels.get(key(c))==='covered'),trueCovered=covered.filter(c=>labels.get(key(c))==='covered'),correct=labelled.filter(c=>c.answer?.label===labels.get(key(c)));
  return {reviewedPairs:labelled.length,correct:correct.length,accuracy:ratio(correct.length,labelled.length),predictedCovered:covered.length,referenceCovered:gold.length,trueCovered:trueCovered.length,falseCovered:covered.length-trueCovered.length,precision:ratio(trueCovered.length,covered.length),recall:ratio(trueCovered.length,gold.length)};};
 const providers=Object.fromEntries(Object.entries(r.runs).map(([name,run])=>{
  const valid=run.cells.filter(c=>c.status==='evaluated'),times=valid.map(c=>c.elapsedMs!).sort((a,b)=>a-b),p=(q:number)=>times.length?times[Math.ceil(q*times.length)-1]:null;
  const tokens=valid.every(c=>c.answer?.inputTokens!==null)?valid.reduce((n,c)=>n+(c.answer?.inputTokens??0),0):null;
  const probs=valid.filter(c=>c.answer?.probabilities&&(c.answer.probabilities[c.answer.label]<r.policy.minProbability));
  const rss=valid.flatMap(c=>c.answer?.peakProcessRssBytes?[c.answer.peakProcessRssBytes]:[]);
  const s=run.smoke;
  const modelVersion=run.providerMetadata.initialization==='failed'?'unverified':name==='laya'&&run.providerMetadata.revision==='7b928d828b7b0e022f929d9bd2e44165aa270148'?'laya-7b928d828b7b':name==='jev'&&['jev-1.13.0','jev-1.14.0'].includes(String(run.providerMetadata.model))?String(run.providerMetadata.model):'unverified';
  return [name,{modelVersion,modelConfigHash:digest(JSON.stringify({model:run.providerMetadata.model,revision:run.providerMetadata.revision,device:run.providerMetadata.device,runtime:run.providerMetadata.runtime})),counts:{pairs:run.cells.length,valid:valid.length,excluded:run.cells.filter(c=>c.status==='excluded').length,errors:run.cells.filter(c=>c.status==='error').length,notRun:run.cells.filter(c=>c.status==='not_run').length,uncertain:valid.filter(c=>c.label==='needs_judgment').length,lowProbability:probs.length},
   performance:{startupMs:typeof run.providerMetadata.startupMs==='number'?run.providerMetadata.startupMs:null,wallMs:run.performance.evaluationWallMs,p50Ms:p(.5),p95Ms:p(.95),modelPeakRssBytes:rss.length?Math.max(...rss):null,inputTokens:tokens,outputTokens:valid.length&&valid.every(c=>c.answer?.outputTokens!==null)?valid.reduce((n,c)=>n+(c.answer?.outputTokens??0),0):null,estimatedApiCostUsd:name==='jev'&&tokens!==null?tokens*JEV_INPUT_USD_PER_MILLION/1e6:null},
   quality:quality(valid),commonQuality:quality(valid.filter(c=>commonKeys.has(key(c)))),
   smoke:{selected:s.selected.length,reviewCandidates:s.reviewCandidates?.length??0,critical:s.mandatoryRequirements.length,estimatedCovered:s.estimatedCoveredRequirements.length,missing:s.missingRequirements.length,dependencyConflicts:s.dependencyConflicts.length,estimatedSerialMs:s.estimatedSerialMs,execution:r.smokeExecutions[name as ComparisonProvider]??null,approved:false}}];
 }));
 return validateComparisonMetrics({schemaVersion:2,protocol:'jev-laya-comparison-v1',datasetKind:r.datasetKind,runId:r.runId,generatedAt:r.generatedAt,inventoryHash:r.inventoryHash,requirementsHash:r.requirementsHash,requirements:r.requirements.length,tests:r.inventory.tests.length,hardware:Object.values(r.runs)[0].hardware,policy:r.policy,commonPairs:common.length,disagreements:common.filter(c=>c.answer?.label!==j.get(key(c))?.answer?.label).length,providers});
}
export async function saveComparison(dir:string,r:Comparison){
 await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jev / Laya comparison</title><style>${comparisonCss}</style>${renderComparison(r)}</html>`);
 await writeFile(path.join(dir,'comparison.json'),JSON.stringify(r,null,2));
 await writeFile(path.join(dir,'metrics.json'),JSON.stringify(comparisonMetrics(r),null,2));
 try{await writeFile(path.join(dir,'review-template.json'),JSON.stringify({version:1,inventoryHash:r.inventoryHash,requirementsHash:r.requirementsHash,labels:[]},null,2),{flag:'wx'});}
 catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
 for(const [name,run] of Object.entries(r.runs)){
  await writeFile(path.join(dir,`${name}-smoke.json`),JSON.stringify(run.smoke,null,2));
  const selected=new Set(run.smoke.selected);
  await writeFile(path.join(dir,`${name}-smoke-list.txt`),r.inventory.tests.filter(t=>selected.has(t.id)).map(t=>`[${t.project}] › ${t.title}`).join('\n')+'\n');
 }
}
export async function executeSmoke(c:Config,report:Comparison,name:ComparisonProvider,dir:string){
 const run=report.runs[name];if(!run?.smoke.selected.length)throw Error('No eligible smoke subset; inspect review candidates and missing critical requirements');
 const fresh=await collect(c,false,true);if(inventoryHash(fresh)!==report.inventoryHash)throw Error('Repository evidence changed; create a fresh comparison before execution');
 const wanted=new Set(run.smoke.selected);
 const list=path.join(dir,`${name}-smoke-list.txt`);
 const selection=await collect(c,false,true,list);
 if(selection.tests.length!==wanted.size||selection.tests.some(t=>!wanted.has(t.id)))throw Error('Smoke test list differs from the proposal; no tests were executed');
 const recorded=await collect(c,true,true,list);
 if(recorded.tests.length!==wanted.size||recorded.tests.some(t=>!wanted.has(t.id)))throw Error('Executed subset does not match the proposal');
 const outcomes=recorded.tests.map(t=>t.results.at(-1)?.status);
 report.smokeExecutions[name]={wallMs:recorded.wallMs!,selected:wanted.size,passed:outcomes.filter(s=>s==='passed').length,failed:outcomes.filter(s=>s!=='passed'&&s!=='skipped').length,skipped:outcomes.filter(s=>s==='skipped').length,recordedAt:new Date().toISOString()};
 await writeFile(path.join(dir,`${name}-smoke-execution.json`),JSON.stringify(recorded,null,2));
 await saveComparison(dir,report);
 return recorded.executionStatus==='passed';
}
