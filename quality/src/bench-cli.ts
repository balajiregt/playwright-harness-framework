import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadEnvFile } from 'node:process';
import { ROOT,digest } from './context.js';
import { validateDataset,buildPackets,validateGold,route,protocol,type Row,type Provider } from './bench-domain.js';
import { LayaWorker,openai,qwen,ProviderError,layaRevision } from './bench-adapters.js';
import { summarize } from './bench-metrics.js';
import { renderBenchReport } from './bench-report.js';

async function main(){
  const mode=process.argv[2]??'preview';if(!['preview','live','preflight'].includes(mode))throw Error('Use preview, preflight or live.');
  const repeats=Number(process.argv[3]??2);if(!Number.isInteger(repeats)||repeats<1||repeats>3)throw Error('Use 1–3 repeats.');
  const datasetText=await readFile(path.join(ROOT,'benchmarks/decision-pilot/dataset.json'),'utf8');
  const goldText=await readFile(path.join(ROOT,'benchmarks/decision-pilot/gold.json'),'utf8');
  const dataset=validateDataset(JSON.parse(datasetText));const packets=buildPackets(dataset);const gold=validateGold(JSON.parse(goldText),packets);
  if(packets.length*repeats*3>150)throw Error('Pilot cap: at most 150 assessments.');
  const rows:Row[]=[];const metadata:Record<string,unknown>={host:{platform:os.platform(),arch:os.arch(),totalMemoryBytes:os.totalmem()},
    openai:{route:'direct OpenAI API',model:'gpt-6-luna'},providerOrder:['laya','openai','qwen'],orderReason:'Provider blocks avoid loading two local models together on an 8 GiB host.',
    thresholds:{laya:.8,openai:.8,qwen:null},thresholdStatus:'Provisional, not calibrated on this pilot.',
    qwenBaseline:'qwen3:4b with identical evidence and rubric, JSON-only output, temperature 0, seed 42; not a full coding-agent baseline.'};
  const preflight:Record<string,any>={};let worker:LayaWorker|undefined;
  const runId=new Date().toISOString().replace(/[:.]/g,'-');const dir=path.join(ROOT,'artifacts','decision-bench',runId);
  await mkdir(dir,{recursive:true});
  async function save(){
    const metrics=summarize(packets,rows,gold,dataset,repeats);
    const report={schemaVersion:1,project:'playwright-decision-bench',protocol,mode,runId,generatedAt:new Date().toISOString(),
      repeats,datasetHash:digest(datasetText),goldHash:digest(goldText),goldStatus:gold.status,metadata,preflight,packets,rows,metrics};
    await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));
    const html=renderBenchReport(report);await writeFile(path.join(dir,'index.html'),html);await writeFile(path.join(ROOT,'artifacts/decision-bench.html'),html);
    const publicReport={schemaVersion:1,project:report.project,protocol,mode,runId,generatedAt:report.generatedAt,repeats,
      datasetHash:report.datasetHash,goldHash:report.goldHash,goldStatus:report.goldStatus,metadata,
      evidencePreflight:{checked:Object.keys(preflight).length,excluded:Object.values(preflight).filter(x=>!x.ok).length},
      metrics,limitations:['Synthetic author-labeled pilot; independent human review pending.','Repeated calls do not increase independent sample size.',
        'No actual Playwright runtime, fault-retention or reviewer-effort measurements.',
        'Qwen is a rubric-following model proxy, not a full Copilot/Claude agent workflow.',
        'Local MPS and hosted network latency describe different deployments. Provider calls run in blocks.',
        'Probability threshold 0.8 is provisional; confidence is not accuracy.','Local hardware and electricity cost are unmeasured; missing cost stays null.']};
    await writeFile(path.join(dir,'public.json'),JSON.stringify(publicReport,null,2));
    await writeFile(path.join(ROOT,'artifacts/decision-public.json'),JSON.stringify(publicReport,null,2));
    return report;
  }
  try{
    if(mode!=='preview'){
      if(mode==='live'){try{loadEnvFile(path.join(ROOT,'.env.local'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('env_load_failed');}}
      worker=new LayaWorker();metadata.laya=await worker.start();
      for(const p of packets)preflight[p.id]=await worker.request('preflight',p);
      await writeFile(path.join(dir,'preflight.json'),JSON.stringify(preflight,null,2));
      console.log(`Input preflight: ${Object.values(preflight).filter(x=>x.ok).length}/${packets.length} fit without truncation.`);
      if(mode==='preflight'){console.log(dir);return;}
      for(const provider of ['laya','openai','qwen'] as Provider[]){
        if(provider==='openai'){worker!.close();worker=undefined;}
        if(provider==='qwen'){try{const tags=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000)}).then(r=>r.json()) as any;const version=await fetch('http://127.0.0.1:11434/api/version',{signal:AbortSignal.timeout(5000)}).then(r=>r.json()) as any;metadata.qwen={model:'qwen3:4b',digest:tags.models.find((m:any)=>m.name==='qwen3:4b')?.digest,ollamaVersion:version.version,keepAlive:'2m',contextTokens:4096,temperature:0,seed:42,thinking:false,maxOutputTokens:64};}catch{metadata.qwen={model:'qwen3:4b',runtimeIdentity:'unavailable'};}}
        let stopped=false,first=true;
        for(let repeat=1;repeat<=repeats;repeat++)for(const p of repeat%2?packets:[...packets].reverse()){
          const row:Row={provider,id:p.id,repeat,task:p.task,split:p.split,packetHash:p.hash,status:'not_run'};
          if(!preflight[p.id].ok){row.status='excluded';row.errorCode='shared_input_limit';}
          else if(stopped)row.errorCode='provider_stopped';
          else{
            const start=performance.now();row.firstCall=first;first=false;
            try{
              row.answer=await (provider==='laya'?worker!.predict(p):provider==='openai'?openai(p):qwen(p));
              row.status='evaluated';Object.assign(row,route(p,row.answer,.8));
            }catch(e){const error=e instanceof ProviderError?e:new ProviderError('adapter_error');row.status=error.code==='refusal'?'refusal':'error';row.errorCode=error.code;stopped=error.stop;}
            row.elapsedMs=performance.now()-start;
          }
          rows.push(row);await save();console.log(`${provider} ${repeat}/${repeats} ${p.id}: ${row.status}${row.errorCode?' ('+row.errorCode+')':''}`);
        }
      }
    }
    const report=await save();console.log(`Saved ${rows.length} rows to ${dir}`);
    console.log(JSON.stringify(report.metrics.summaries.filter(s=>s.split==='heldout').map(s=>({provider:s.provider,task:s.task,matched:s.matched,requested:s.requested,valid:s.valid,errors:s.errors})),null,2));
  }finally{worker?.close();}
}
main().catch(e=>{console.error(e instanceof ProviderError?e.code:'Benchmark could not complete; no success is claimed.');process.exitCode=1;});
