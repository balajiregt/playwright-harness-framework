import type { Packet, Row, Gold, Dataset, Provider, Task } from './bench-domain.js';
import { selectSmoke } from './bench-domain.js';
const ratio=(n:number,d:number)=>d?n/d:null;
export function percentile(values:number[],q:number){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(q*sorted.length)-1)];}
export function summarize(packets:Packet[],rows:Row[],gold:Gold,dataset:Dataset,repeats:number){
  const labels=new Map(gold.labels.map(x=>[x.id,x.label]));
  const seen=new Set<string>();
  for(const r of rows){const k=`${r.provider}:${r.repeat}:${r.id}`;if(seen.has(k)||!packets.some(p=>p.id===r.id&&p.hash===r.packetHash)||r.repeat<1||r.repeat>repeats)throw Error('invalid_rows');seen.add(k);}
  const providers:Provider[]=['laya','openai','qwen'];
  const tasks:Task[]=['coverage','smoke'];
  const summaries=providers.flatMap(provider=>tasks.flatMap(task=>(['development','heldout'] as const).map(split=>{
    const ps=packets.filter(p=>p.task===task&&p.split===split);const ids=new Set(ps.map(p=>p.id));
    const rs=rows.filter(r=>r.provider===provider&&ids.has(r.id));const valid=rs.filter(r=>r.status==='evaluated'&&r.answer);
    const requested=ps.length*repeats;const matched=valid.filter(r=>r.answer!.label===labels.get(r.id)).length;
    const isGap=(l:string|undefined)=>l==='partial'||l==='uncovered';
    const goldGaps=ps.filter(p=>isGap(labels.get(p.id))).length*repeats;
    const flagged=valid.filter(r=>isGap(r.answer!.label));const trueGaps=flagged.filter(r=>isGap(labels.get(r.id))).length;
    const latency=valid.map(r=>r.elapsedMs!).filter(Number.isFinite);
    const warmLatency=valid.filter(r=>!r.firstCall).map(r=>r.elapsedMs!).filter(Number.isFinite);
    const failures=rs.filter(r=>r.status==='error');const costs=rs.filter(r=>r.answer?.costUsd!==null&&r.answer?.costUsd!==undefined);
    const totalReportedCost=costs.length?costs.reduce((sum,r)=>sum+r.answer!.costUsd!,0):null;
    const stable=ps.map(p=>rs.filter(r=>r.id===p.id&&r.status==='evaluated')).filter(x=>x.length===repeats&&repeats>1);
    return {provider,task,split,requested,uniqueCases:ps.length,valid:valid.length,matched,accuracy:ratio(matched,valid.length),endToEndAccuracy:ratio(matched,requested),
      errors:failures.length,refusals:rs.filter(r=>r.status==='refusal').length,excluded:rs.filter(r=>r.status==='excluded').length,
      notRun:requested-rs.filter(r=>r.status!=='not_run').length,neutral:valid.filter(r=>r.answer!.label==='needs_judgment').length,
      routedReview:valid.filter(r=>r.routedLabel==='needs_judgment').length,
      gapPrecision:task==='coverage'?ratio(trueGaps,flagged.length):null,gapRecall:task==='coverage'&&valid.length?ratio(trueGaps,goldGaps):null,
      includePrecision:task==='smoke'?ratio(valid.filter(r=>r.answer!.label==='include'&&labels.get(r.id)==='include').length,valid.filter(r=>r.answer!.label==='include').length):null,
      includeRecall:task==='smoke'&&valid.length?ratio(valid.filter(r=>r.answer!.label==='include'&&labels.get(r.id)==='include').length,ps.filter(p=>labels.get(p.id)==='include').length*repeats):null,
      detectedGaps:task==='coverage'?trueGaps:null,goldGaps:task==='coverage'?goldGaps:null,
      falseCovered:task==='coverage'?valid.filter(r=>r.answer!.label==='covered'&&isGap(labels.get(r.id))).length:null,
      unknownAsCovered:task==='coverage'?valid.filter(r=>r.answer!.label==='covered'&&labels.get(r.id)==='needs_judgment').length:null,
      confusion:Object.fromEntries([...new Set(ps.map(p=>labels.get(p.id)!))].map(expected=>[expected,Object.fromEntries([...new Set(ps.flatMap(p=>Object.keys(p.choices)))].map(actual=>[actual,valid.filter(r=>labels.get(r.id)===expected&&r.answer!.label===actual).length]))])),
      latencySamples:latency.length,p50Ms:percentile(latency,.5),p95Ms:percentile(latency,.95),warmLatencySamples:warmLatency.length,warmP50Ms:percentile(warmLatency,.5),
      failedLatencyP50Ms:percentile(failures.map(r=>r.elapsedMs!).filter(Number.isFinite),.5),
      reportedCostUsd:totalReportedCost,costReportedCalls:costs.length,costPerValidAnswerUsd:costs.length===valid.length&&valid.length&&failures.length===0?totalReportedCost!/valid.length:null,
      repeatableCases:stable.length,stableCases:stable.filter(x=>new Set(x.map(r=>r.answer!.label)).size===1).length,
      repeatability:ratio(stable.filter(x=>new Set(x.map(r=>r.answer!.label)).size===1).length,stable.length),
      inputTokens:valid.length&&valid.every(r=>r.answer!.inputTokens!==null)?valid.reduce((sum,r)=>sum+r.answer!.inputTokens!,0):null,
      maxProcessRssBytes:Math.max(0,...valid.map(r=>r.answer!.peakProcessRssBytes??0))||null};
  })));
  const suites=providers.flatMap(provider=>Array.from({length:repeats},(_,i)=>dataset.suites.map(s=>({provider,repeat:i+1,split:s.split,...selectSmoke(s,rows.filter(r=>r.provider===provider&&r.repeat===i+1))}))).flat());
  const providerStatus=Object.fromEntries(providers.map(provider=>{const rs=rows.filter(r=>r.provider===provider);return [provider,{valid:rs.filter(r=>r.status==='evaluated').length,attempted:rs.filter(r=>['evaluated','error','refusal'].includes(r.status)).length,errorCodes:[...new Set(rs.filter(r=>r.status==='error').map(r=>r.errorCode))]}];}));
  return {summaries,suites,providerStatus};
}
