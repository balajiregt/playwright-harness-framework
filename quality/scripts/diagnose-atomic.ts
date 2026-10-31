/** Follow-up probe: same development evidence, narrower choice questions. */
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { buildPackets,validateDataset,wirePacket } from '../src/bench-domain.js';
import { LayaWorker,qwen } from '../src/bench-adapters.js';
const packets=buildPackets(validateDataset(JSON.parse(await readFile('benchmarks/decision-pilot/dataset.json','utf8'))));
// Expectations are recorded only after inference, never included in wirePacket.
const probes=[
 ['refund-total','status','Does the supplied test explicitly assert that the order status is refunded?','yes'],
 ['refund-total','amount','Does the supplied test explicitly assert that the refunded amount equals the full paid amount?','no'],
 ['export-rows','export','Does the supplied test explicitly assert that the CSV contains all matching customers?','no'],
 ['export-rows','heading','Does the supplied test explicitly assert that the Customers heading is visible?','yes'],
 ['login-helper','source','Is the implementation source of signInAndVerifyAccount supplied in the evidence?','no'],
 ['login-helper','call','Does the supplied code call signInAndVerifyAccount?','yes'],
 ['checkout-suite:sign-in','journey','Does candidate.journeys contain at least one value listed in mandatoryJourneys?','yes'],
 ['checkout-suite:theme','journey','Does candidate.journeys contain at least one value listed in mandatoryJourneys?','no']
];
const variant=process.argv[2]??'original';
if(!['original','without-requirement'].includes(variant))throw Error('invalid_variant');
const selected=variant==='original'?probes:probes.slice(0,4);
const dir=`artifacts/accuracy-diagnostics/atomic-${variant}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(dir,{recursive:true});const rows:any[]=[];
await writeFile(`${dir}/plan.json`,JSON.stringify({probes:selected,variant,description:'Atomic two-choice extraction; not the original multi-class task.'},null,2));
let worker:LayaWorker|undefined;
try{
 for(const provider of ['qwen','laya']){
  if(provider==='laya'){
   await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'qwen3:4b',keep_alive:0}),signal:AbortSignal.timeout(30000)});
   worker=new LayaWorker();await worker.start();
  }
  for(const [id,name,question,expected] of selected){
   const original=packets.find(p=>p.id===id)!;if(original.split!=='development')throw Error('development_only');
   const state=JSON.parse(original.input);if(variant==='without-requirement')delete state.requirement;
   const p={...original,input:JSON.stringify(state),instructions:question+' Answer from supplied evidence only.',choices:{yes:'Yes.',no:'No.'}};
   const start=performance.now();
   const answer=provider==='laya'?await worker!.predict(p):await qwen(p);
   rows.push({provider,id,name,packet:wirePacket(p),expected,answer,elapsedMs:performance.now()-start});
   await writeFile(`${dir}/report.json`,JSON.stringify({description:'Atomic choice probes, not adoption accuracy',variant,rows},null,2));
   console.log(JSON.stringify({provider,id,name,expected,actual:answer.label}));
  }
 }
}finally{worker?.close();}
console.log(dir);
