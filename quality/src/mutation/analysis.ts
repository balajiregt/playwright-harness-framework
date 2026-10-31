import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {digest} from '../context.js';
import {type MutationConfig} from './schema.js';
import {readWorkload,assertFresh,validateWorkload,decisionSchema,type Workload} from './workload.js';
import {evaluateEngine,layaEngine,codexEngine,type EngineRun,type Prediction} from './engines.js';
import {runCampaign,healthy,classify,type Campaign} from './runner.js';
import {saveAnalysisReport} from './analysis-report.js';

export interface AnalysisComparison {version:1;protocol:'independent-mutation-analysis-v1';runId:string;startedAt:string;completedAt:string;workload:Workload;engines:EngineRun[];campaign:Campaign|null}
export function validateAnalysis(input:unknown):AnalysisComparison{
 const r=input as AnalysisComparison;
 if(r.version!==1||r.protocol!=='independent-mutation-analysis-v1'||!Array.isArray(r.engines)||!r.engines.length||new Set(r.engines.map(e=>e.engine)).size!==r.engines.length)throw Error('Invalid independent analysis');
 validateWorkload(r.workload);
 for(const e of r.engines){
  if(e.workloadHash!==r.workload.hash||e.cells.length!==r.workload.pairs.length||new Set(e.cells.map(c=>c.pairId)).size!==e.cells.length)throw Error('Engine denominator or workload differs');
  for(const c of e.cells)if(r.workload.pairs.find(p=>p.id===c.pairId)?.packet.hash!==c.packetHash||!['evaluated','excluded','error','not_run'].includes(c.status)||c.status==='evaluated'&&!decisionSchema.safeParse(c.decision).success||c.status!=='evaluated'&&c.decision!==null)throw Error('Invalid prediction or packet binding');
 }
 if(r.campaign)bindCampaign(r.workload,r.campaign);return r;
}
export function bindCampaign(w:Workload,c:Campaign){
 if(c.kind!=='playwright-behavioral-mutations'||c.contextHash!==w.context.hash||c.repositoryHash!==w.repositoryHash||c.planHash!==digest(JSON.stringify(w.plan))||c.scopeHash!==w.scopeHash||!c.originalUnchanged)throw Error('Campaign does not prove execution on the frozen inputs');
 const ids=new Set(w.plan.mutations.map(m=>m.id));if(c.faults.length!==ids.size||new Set(c.faults.map(f=>f.id)).size!==ids.size||c.faults.some(f=>!ids.has(f.id)))throw Error('Campaign fault inventory differs');
 if(digest(JSON.stringify(c.plan))!==c.planHash)throw Error('Executed plan was modified');
 for(const f of c.faults)if(['killed','survived'].includes(f.status)){
  const plan=w.plan.mutations.find(m=>m.id===f.id)!;
  if(c.baseline.length<2||!c.baseline.every(healthy)||!c.restored||!healthy(c.restored)||f.baselineProbe!==plan.probe.expected||f.mutantProbe===undefined||f.mutantProbe===f.baselineProbe||classify(f.attempts,c.baseline[0]).status!==f.status)throw Error('Conclusive fault lacks baseline, activation or repeated assertion evidence');
 }
}
export function observedPairs(w:Workload,campaign:Campaign|null){
 if(campaign)bindCampaign(w,campaign);
 return new Map(w.pairs.map(p=>{
  const f=campaign?.faults.find(f=>f.id===p.mutationId);let value:'detected'|'missed'|null=null;
  if(f&&['killed','survived'].includes(f.status)&&f.attempts.length===2){
   const rows=f.attempts.map(e=>e.tests.filter(t=>t.project===p.project&&t.file.replace(/\\/g,'/').endsWith('/'+p.testFile)&&t.title.endsWith(' › '+p.testTitle)));
   if(rows.every(r=>r.length===1&&r[0].results.length===1)){
    if(rows.every(r=>r[0].results[0].status==='passed'))value='missed';
    else if(rows.every(r=>r[0].results[0].status==='failed'&&r[0].results[0].assertionFailure))value='detected';
   }
  }
  return [p.id,value] as const;
 }));
}
export function analysisMetrics(r:AnalysisComparison){
 const observed=observedPairs(r.workload,r.campaign),maps=r.engines.map(e=>new Map(e.cells.map(c=>[c.pairId,c])));
 const eligible=new Set(r.workload.pairs.filter(p=>p.runnable&&!p.issues.length&&observed.get(p.id)!==null).map(p=>p.id));
 const common=r.engines.length<2?new Set<string>():new Set([...eligible].filter(id=>maps.every(m=>m.get(id)?.status==='evaluated')));
 function quality(cells:Prediction[]){const rows=cells.filter(c=>c.status==='evaluated'&&eligible.has(c.pairId)),positive=rows.filter(c=>c.decision==='detected'),truth=rows.filter(c=>observed.get(c.pairId)==='detected'),tp=positive.filter(c=>observed.get(c.pairId)==='detected').length,correct=rows.filter(c=>c.decision===observed.get(c.pairId)).length;
  return {pairs:rows.length,correct,matchRate:rows.length?correct/rows.length:null,trueDetected:tp,falseDetected:positive.length-tp,referenceDetected:truth.length,predictedDetected:positive.length,precision:positive.length?tp/positive.length:null,recall:truth.length?tp/truth.length:null};}
 const providers=Object.fromEntries(r.engines.map(e=>{
  const valid=e.cells.filter(c=>c.status==='evaluated'),latencies=valid.flatMap(c=>c.elapsedMs===null?[]:[c.elapsedMs]).sort((a,b)=>a-b),percentile=(q:number)=>latencies.length?latencies[Math.ceil(q*latencies.length)-1]:null;
  const sum=(key:'inputTokens'|'outputTokens'|'cachedInputTokens'|'agentToolCalls'|'contextBytes')=>valid.length&&valid.every(c=>c[key]!==null)?valid.reduce((n,c)=>n+c[key]!,0):null;
  return [e.engine,{requested:e.cells.length,completed:valid.length,excluded:e.cells.filter(c=>c.status==='excluded').length,errors:e.cells.filter(c=>c.status==='error').length,notRun:e.cells.filter(c=>c.status==='not_run').length,uncertain:valid.filter(c=>c.decision==='needs_judgment').length,quality:quality(e.cells),commonQuality:quality(e.cells.filter(c=>common.has(c.pairId))),wallMs:e.wallMs,startupMs:typeof e.metadata.engineStartupMs==='number'?e.metadata.engineStartupMs:null,p50Ms:percentile(.5),p95Ms:percentile(.95),inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),cachedInputTokens:sum('cachedInputTokens'),agentToolCalls:sum('agentToolCalls'),contextBytes:sum('contextBytes'),costUsd:null}];
 }));
 const faults=r.campaign?.faults??[];
 return {runId:r.runId,workloadHash:r.workload.hash,requestedPairs:r.workload.pairs.length,commonPairs:common.size,disagreements:[...common].filter(id=>new Set(maps.map(m=>m.get(id)!.decision)).size>1).length,providers,execution:{requested:r.workload.plan.mutations.length,killed:faults.filter(f=>f.status==='killed').length,survived:faults.filter(f=>f.status==='survived').length,unknown:r.workload.plan.mutations.length-faults.filter(f=>['killed','survived'].includes(f.status)).length,wallMs:r.campaign?.wallMs??null}};
}
const predictionImport=z.object({engine:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),workloadHash:z.string(),model:z.string().min(1).max(120),cells:z.array(z.object({pairId:z.string(),packetHash:z.string(),decision:decisionSchema}).strict())}).strict();
export function importEngine(input:unknown,w:Workload):EngineRun{
 const raw=predictionImport.parse(input);if(['laya','codex'].includes(raw.engine)||raw.workloadHash!==w.hash||new Set(raw.cells.map(c=>c.pairId)).size!==raw.cells.length)throw Error('Imported engine has invalid identity or workload binding');
 for(const c of raw.cells)if(w.pairs.find(p=>p.id===c.pairId)?.packet.hash!==c.packetHash)throw Error('Imported prediction has a stale or unknown packet');
 const now=new Date().toISOString();
 return {engine:raw.engine,workloadHash:w.hash,metadata:{model:raw.model,imported:true,provenance:'externally-supplied-not-instrumented'},startedAt:now,completedAt:now,wallMs:null,cells:w.pairs.map(p=>{const row=raw.cells.find(c=>c.pairId===p.id);return {pairId:p.id,packetHash:p.packet.hash,status:row?'evaluated':'not_run',decision:row?.decision??null,probabilities:null,reason:row?null:'not_supplied',elapsedMs:null,contextMs:null,inputTokens:null,outputTokens:null,cachedInputTokens:null,agentToolCalls:null,contextBytes:null};})};
}
export async function compareAnalysis(c:MutationConfig,file:string,engines:string[],options:{allowHosted:boolean;allowRun:boolean;campaignFile?:string;imports?:string[];previousFile?:string}){
 if(!engines.length&&!options.imports?.length||new Set(engines).size!==engines.length||engines.some(e=>!['laya','codex'].includes(e)))throw Error('Choose laya, codex or supply imported agent results');
 if(engines.includes('codex')&&!options.allowHosted)throw Error('Codex analysis sends the selected evidence to your signed-in provider; pass --allow-hosted');
 const w=await readWorkload(file);await assertFresh(c,w);
 const startedAt=new Date().toISOString(),r:AnalysisComparison={version:1,protocol:'independent-mutation-analysis-v1',runId:randomUUID(),startedAt,completedAt:startedAt,workload:w,engines:[],campaign:null};
 const dir=path.join(c.output,'comparisons',r.runId);await mkdir(dir,{recursive:true});
 if(options.previousFile){const previous=validateAnalysis(JSON.parse(await readFile(options.previousFile,'utf8')));if(previous.workload.hash!==w.hash||previous.engines.some(e=>engines.includes(e.engine)))throw Error('Previous comparison has different inputs or duplicate engines');r.engines=previous.engines;r.campaign=previous.campaign;}
 for(const engine of engines){
  r.engines.push(await evaluateEngine(w,engine,()=>engine==='laya'?layaEngine(c,file):codexEngine(c,file),(n,total)=>console.log(`${engine}: ${n}/${total}`)));
  r.completedAt=new Date().toISOString();await saveAnalysisReport(dir,r);
 }
 for(const f of options.imports??[]){const run=importEngine(JSON.parse(await readFile(f,'utf8')),w);if(r.engines.some(e=>e.engine===run.engine))throw Error('Duplicate imported engine');r.engines.push(run);}
 await assertFresh(c,w);
 if(options.campaignFile){const campaign=JSON.parse(await readFile(options.campaignFile,'utf8'));bindCampaign(w,campaign);r.campaign=campaign;}
 else if(options.allowRun&&!r.campaign){r.campaign=(await runCampaign(c,w.plan)).report;bindCampaign(w,r.campaign);}
 r.completedAt=new Date().toISOString();await saveAnalysisReport(dir,r);return {dir,report:r,metrics:analysisMetrics(r)};
}
