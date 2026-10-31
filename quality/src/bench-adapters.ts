import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { ROOT } from './context.js';
import { wirePacket, type Packet, type Answer } from './bench-domain.js';
export const layaRevision='7b928d828b7b0e022f929d9bd2e44165aa270148';
export class ProviderError extends Error { constructor(public code:string,public stop=false){super(code);} }
export function parseProbabilities(value:unknown,p:Packet):Record<string,number> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ProviderError('invalid_probabilities');
  const entries=Object.entries(value);
  if(entries.length!==Object.keys(p.choices).length||entries.some(([k,v])=>!Object.hasOwn(p.choices,k)||typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)||Math.abs(entries.reduce((s,[,v])=>s+(v as number),0)-1)>.01) throw new ProviderError('invalid_probabilities');
  return value as Record<string,number>;
}
function label(value:unknown,p:Packet):string {if(typeof value!=='string'||!Object.hasOwn(p.choices,value))throw new ProviderError('invalid_label');return value;}
const number=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
function probability(v:unknown):number|null{const n=number(v);if(n!==null&&n>1)throw new ProviderError('invalid_confidence');return n;}
export function parseOpenAI(raw:any,p:Packet,expectedModel:string):Answer {
  if(raw?.model!==expectedModel)throw new ProviderError('unexpected_model',true);
  if(!Array.isArray(raw.answers)||raw.answers.length!==1||raw.answers[0].name!=='decision')throw new ProviderError('invalid_response');
  const a=raw.answers[0];if(a.type==='refusal')throw new ProviderError('refusal');
  if(a.type!=='choice'||!Array.isArray(a.probabilities)||new Set(a.probabilities.map((x:any)=>x.value)).size!==a.probabilities.length)throw new ProviderError('invalid_response');
  const probs=parseProbabilities(Object.fromEntries(a.probabilities.map((x:any)=>[x.value,x.probability])),p);
  const rawCost=raw.provider_metadata?.gateway?.cost;
  return {label:label(a.choice,p),probabilities:probs,confidence:probability(a.confidence),
    costUsd:rawCost===undefined||rawCost===''?null:number(Number(rawCost)),inputTokens:number(raw.usage?.input_tokens),outputTokens:number(raw.usage?.output_tokens),model:raw.model};
}
async function post(url:string,body:unknown,key?:string,timeout=90000):Promise<any>{
  let response:Response;
  try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});}
  catch(e){throw new ProviderError(e instanceof Error&&['TimeoutError','AbortError'].includes(e.name)?'timeout':'transport_error',true);}
  if(!response.ok){await response.body?.cancel();throw new ProviderError(`http_${response.status}`,[400,401,402,403,404,429].includes(response.status));}
  try{return await response.json();}catch{throw new ProviderError('invalid_json');}
}
export async function openai(p:Packet):Promise<Answer>{
  const key=process.env.OPENAI_API_KEY;
  if(!key)throw new ProviderError('missing_openai_key',true);
  const model='gpt-6-luna';
  const raw=await post('https://api.openai.com/v1/decisions',
    {model,input:p.input,questions:[{type:'choice',name:'decision',instructions:p.instructions,
      choices:Object.entries(p.choices).map(([value,description])=>({value,description}))}]},key);
  return parseOpenAI(raw,p,model);
}
export function parseQwen(raw:any,p:Packet):Answer {
  if(raw.model!=='qwen3:4b'||raw.done!==true)throw new ProviderError('unexpected_or_incomplete_model',true);
  let result:any;try{result=JSON.parse(raw.message.content);}catch{throw new ProviderError('invalid_json');}
  if(Object.keys(result).length!==1)throw new ProviderError('invalid_response');
  return {label:label(result.decision,p),probabilities:null,confidence:null,costUsd:null,
    inputTokens:number(raw.prompt_eval_count),outputTokens:number(raw.eval_count),model:raw.model,
    inferenceMs:number(raw.eval_duration)!/1e6};
}
export async function qwen(p:Packet):Promise<Answer>{
  // Explicit loopback only: cannot accidentally send evidence to a configured remote server.
  const raw=await post('http://127.0.0.1:11434/api/chat',{
    model:'qwen3:4b',stream:false,think:false,keep_alive:'2m',
    messages:[{role:'system',content:'Apply the supplied review rubric. Return only the requested JSON object.'},
      {role:'user',content:JSON.stringify(wirePacket(p))}],
    format:{type:'object',properties:{decision:{type:'string',enum:Object.keys(p.choices)}},required:['decision'],additionalProperties:false},
    options:{temperature:0,seed:42,num_ctx:4096,num_predict:64}},undefined,90000);
  return parseQwen(raw,p);
}
export class LayaWorker {
  child:ChildProcessWithoutNullStreams; private waiting?:{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout};
  ready:Promise<any>; metadata:any;
  constructor(options: {python?:string;device?:string} = {}){
    this.child=spawn(options.python ?? path.join(ROOT,'.venv/bin/python'),[path.join(ROOT,'python/laya_worker.py')],{
      cwd:ROOT,env:{PATH:process.env.PATH,HOME:process.env.HOME,HF_HOME:path.join(ROOT,'artifacts/hf'),
        LAYA_REVISION:layaRevision,LAYA_DEVICE:options.device??process.env.LAYA_DEVICE??'mps',TOKENIZERS_PARALLELISM:'false'},stdio:'pipe'});
    this.child.stderr.resume(); // Provider diagnostic strings are deliberately not copied to reports.
    this.ready=this.next(240000);
    createInterface({input:this.child.stdout}).on('line',line=>{try{this.finish(JSON.parse(line));}catch{this.fail(new ProviderError('invalid_laya_json'));}});
    this.child.on('error',()=>this.fail(new ProviderError('laya_start_failed',true)));
    this.child.on('exit',()=>this.fail(new ProviderError('laya_stopped',true)));
  }
  private finish(v:any){const w=this.waiting;if(w){clearTimeout(w.timer);this.waiting=undefined;w.resolve(v);}}
  private fail(e:Error){const w=this.waiting;if(w){clearTimeout(w.timer);this.waiting=undefined;w.reject(e);}}
  private next(timeout:number){return new Promise<any>((resolve,reject)=>{this.waiting={resolve,reject,timer:setTimeout(()=>{this.fail(new ProviderError('laya_timeout',true));this.close();},timeout)};});}
  async start(){const m=await this.ready;if(!m.ready)throw new ProviderError(m.errorCode??'laya_start_failed',true);this.metadata=m;return m;}
  async request(action:string,p:Packet){const pending=this.next(90000);this.child.stdin.write(JSON.stringify({action,packet:wirePacket(p)})+'\n');return pending;}
  async predict(p:Packet):Promise<Answer>{
    const raw=await this.request('predict',p);if(raw.errorCode)throw new ProviderError(raw.errorCode);
    const a=raw.answer;if(a?.type!=='choice')throw new ProviderError('invalid_response');
    return {label:label(a.choice,p),probabilities:parseProbabilities(a.probabilities,p),confidence:probability(a.confidence),
      costUsd:null,inputTokens:number(raw.usage?.input_tokens),outputTokens:number(raw.usage?.output_tokens),
      model:'convaiinnovations/laya',inferenceMs:number(raw.inferenceMs)??undefined,peakProcessRssBytes:number(raw.peakProcessRssBytes)??undefined};
  }
  close(){this.child.stdin.end();this.child.kill();}
}
