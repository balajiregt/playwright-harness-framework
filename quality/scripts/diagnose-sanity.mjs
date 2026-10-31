// Elementary local controls; no hosted calls or credentials.
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('artifacts/accuracy-diagnostics',{recursive:true});
const rows=[];
for(const state of ['The signal color is red.','The signal color is blue.'])for(const layout of ['packet','plain']) {
const packet={input:state,instructions:'What color is explicitly stated for the signal?',choices:{red:'The signal is red.',blue:'The signal is blue.'}};
const content=layout==='packet'?JSON.stringify(packet):state+' What color is the signal? Return {"decision":"red"} or {"decision":"blue"}.';
const r=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',signal:AbortSignal.timeout(90000),headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'qwen3:4b',stream:false,think:false,keep_alive:'2m',messages:[{role:'system',content:'Apply the supplied review rubric. Return only the requested JSON object.'},{role:'user',content}],format:{type:'object',properties:{decision:{type:'string',enum:['red','blue']}},required:['decision'],additionalProperties:false},options:{temperature:0,seed:42,num_ctx:4096,num_predict:64}})});
const raw=await r.json();rows.push({state,layout,content:raw.message?.content,doneReason:raw.done_reason,promptTokens:raw.prompt_eval_count});console.log(rows.at(-1));
}
await writeFile('artifacts/accuracy-diagnostics/qwen-sanity.json',JSON.stringify(rows,null,2));
