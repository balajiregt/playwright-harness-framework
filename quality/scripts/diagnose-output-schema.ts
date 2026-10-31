/** Isolate the output enum constraint without changing evidence or questions. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {buildPackets,validateDataset,validateGold,wirePacket} from '../src/bench-domain.js';
import {parseQwen} from '../src/bench-adapters.js';
const all=buildPackets(validateDataset(JSON.parse(await readFile('benchmarks/decision-pilot/dataset.json','utf8'))));
const gold=validateGold(JSON.parse(await readFile('benchmarks/decision-pilot/gold.json','utf8')),all);
const ids=['viewer-delete','refund-total','export-rows','login-helper','checkout-suite:sign-in','checkout-suite:theme'];
const dir=`artifacts/accuracy-diagnostics/schema-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(dir,{recursive:true});const rows:any[]=[];
const variants=process.argv[2]?[process.argv[2]]:['without-enum','schema-in-prompt','prose-message'];
if(variants.some(v=>!['without-enum','schema-in-prompt','prose-message'].includes(v)))throw Error('invalid_variant');
await writeFile(`${dir}/plan.json`,JSON.stringify({ids,variants,changes:['Remove decision.enum only.','Keep enum but include output schema in the user message.','Keep enum and express unchanged evidence, instructions and choices as prose sections.']},null,2));
for(const variant of variants)for(const id of ids){
 const p=all.find(x=>x.id===id)!;if(p.split!=='development')throw Error('development_only');
 const start=performance.now();
 const format={type:'object',properties:{decision:{type:'string',...(variant!=='without-enum'?{enum:Object.keys(p.choices)}:{})}},required:['decision'],additionalProperties:false};
 const content=variant==='prose-message'?`${p.instructions}\n\nEvidence:\n${JSON.stringify(JSON.parse(p.input),null,2)}\n\nAllowed decisions:\n${JSON.stringify(p.choices,null,2)}`:JSON.stringify(wirePacket(p))+(variant==='schema-in-prompt'?'\nReturn JSON matching this schema: '+JSON.stringify(format):'');
 const r=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),body:JSON.stringify({model:'qwen3:4b',stream:false,think:false,keep_alive:'2m',messages:[{role:'system',content:'Apply the supplied review rubric. Return only the requested JSON object.'},{role:'user',content}],format,options:{temperature:0,seed:42,num_ctx:4096,num_predict:64}})});
 if(!r.ok)throw Error(`local_http_${r.status}`);
 const raw=await r.json() as any;let answer,error;
 try{if(raw.done_reason!=='stop')throw Error('incomplete');answer=parseQwen(raw,p);}catch{error='invalid_or_incomplete_output';}
 rows.push({variant,id,expected:gold.labels.find(g=>g.id===id)!.label,packet:wirePacket(p),answer,error,doneReason:raw.done_reason,promptTokens:raw.prompt_eval_count,generatedTokens:raw.eval_count,elapsedMs:performance.now()-start});
 await writeFile(`${dir}/report.json`,JSON.stringify({description:'Qwen output schema ablation',rows},null,2));
 console.log(JSON.stringify({variant,id,actual:answer?.label,error}));
}
console.log(dir);
