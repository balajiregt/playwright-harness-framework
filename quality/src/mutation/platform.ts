import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../context.js';
import {analysisMetrics,validateAnalysis,type AnalysisComparison} from './analysis.js';
import {runProcess} from './process.js';

type Measurement={value:number|null;state:'measured'|'unavailable';sampleSize:number|null};
const measurement=(value:number|null|undefined,n:number|null):Measurement=>value===null||value===undefined?{value:null,state:'unavailable',sampleSize:null}:{value,state:'measured',sampleSize:n&&n>0?n:1};
export function platformMeasurements(r:AnalysisComparison,definitions:{id:string}[]){
 validateAnalysis(r);const m=analysisMetrics(r),all:Record<string,Measurement>={
  'faults-requested':measurement(m.execution.requested,m.execution.requested),
  'faults-killed':r.campaign?measurement(m.execution.killed,m.execution.requested):measurement(null,null),
  'faults-survived':r.campaign?measurement(m.execution.survived,m.execution.requested):measurement(null,null),
  'faults-unknown':r.campaign?measurement(m.execution.unknown,m.execution.requested):measurement(null,null),
  'mutation-runtime':measurement(m.execution.wallMs,1),
  'common-pairs':measurement(m.commonPairs,m.requestedPairs),
  'model-disagreements':m.commonPairs?measurement(m.disagreements,m.commonPairs):measurement(null,null)
 };
 for(const engine of new Set(['laya','codex',...r.engines.map(e=>e.engine)])){
  const p=m.providers[engine];
  const fields:Record<string,Measurement>={
   requested:measurement(p?.requested,p?.requested??null),completed:measurement(p?.completed,p?.requested??null),excluded:measurement(p?.excluded,p?.requested??null),errors:measurement(p?.errors,p?.requested??null),'not-run':measurement(p?.notRun,p?.requested??null),uncertain:measurement(p?.uncertain,p?.completed??null),
   'common-match-rate':measurement(p?.commonQuality.matchRate,p?.commonQuality.pairs??null),'false-detected':p?.commonQuality.pairs?measurement(p.commonQuality.falseDetected,p.commonQuality.pairs):measurement(null,null),
   precision:measurement(p?.commonQuality.precision,p?.commonQuality.predictedDetected??null),recall:measurement(p?.commonQuality.recall,p?.commonQuality.referenceDetected??null),
   'whole-match-rate':measurement(p?.quality.matchRate,p?.quality.pairs??null),
   startup:measurement(p?.startupMs,1),duration:measurement(p?.wallMs,1),p50:measurement(p?.p50Ms,p?.completed??null),p95:measurement(p?.p95Ms,p?.completed??null),
   'input-tokens':measurement(p?.inputTokens,p?.completed??null),'output-tokens':measurement(p?.outputTokens,p?.completed??null),'cached-input-tokens':measurement(p?.cachedInputTokens,p?.completed??null),'agent-tool-calls':measurement(p?.agentToolCalls,p?.completed??null),'context-bytes':measurement(p?.contextBytes,p?.completed??null),'actual-cost':measurement(null,null)
  };
  for(const [field,value] of Object.entries(fields))all[engine+'-'+field]=value;
 }
 for(const d of definitions)if(!Object.hasOwn(all,d.id))throw Error('Publication policy contains an unmapped metric');
 return {observedAt:r.completedAt,revision:null,dirty:true,status:r.campaign&&m.execution.unknown===0&&r.engines.every(e=>e.cells.every(c=>c.status==='evaluated'))?'completed':'partial',values:Object.fromEntries(definitions.map(d=>[d.id,all[d.id]]))};
}
export async function exportPlatform(reportFile:string,policyFile:string){
 const r=validateAnalysis(JSON.parse(await readFile(reportFile,'utf8'))),policy=JSON.parse(await readFile(policyFile,'utf8'));
 if(policy.scope!==r.workload.scope)throw Error('Publication policy scope does not match the observed dataset');
 const data=platformMeasurements(r,policy.metrics),dir=path.dirname(path.resolve(reportFile)),input=path.join(dir,'platform-measurements.json'),output=path.join(dir,'prepared-metrics.json');
 await writeFile(input,JSON.stringify(data,null,2),{flag:'wx'});
 const cli=path.join(ROOT,'.agents/skills/platform-publish/scripts/cli.mjs');
 for(const args of [['prepare','--config',path.resolve(policyFile),'--input',input,'--output',output],['validate','--config',path.resolve(policyFile),'--input',output]]){
  const result=await runProcess(process.execPath,[cli,...args],ROOT,{PATH:process.env.PATH,HOME:process.env.HOME},30000);
  if(result.code!==0)throw Error('Shared platform publisher rejected the aggregate or policy; see its CLI validation');
 }
 return {prepared:output,scope:policy.scope,destination:policy.repository+'/'+policy.branch+'/'+policy.feedPath,published:false};
}
