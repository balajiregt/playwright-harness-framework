import {parseProbabilities} from '../bench-adapters.js';
import type {Packet,Answer} from '../bench-domain.js';
import type {LocalProvider} from './providers.js';

export const JEV_INPUT_USD_PER_MILLION=.042;
export function jevRequest(p:Packet,model:string){
 return {model,state:p.input,questions:{decision:{type:'choice',instructions:p.instructions,criteria:p.choices}}};
}
export function parseJev(raw:any,p:Packet,model:string):Answer{
 if(raw?.model!==model||!raw.answers||Object.keys(raw.answers).join()!=='decision')throw Error('invalid_decision');
 const a=raw.answers.decision;
 if(a?.type!=='choice'||!Object.hasOwn(p.choices,a.choice))throw Error('invalid_decision');
 const probabilities=parseProbabilities(a.probabilities,p);
 const tokens=(v:unknown)=>{if(!Number.isSafeInteger(v)||Number(v)<0)throw Error('invalid_decision');return Number(v);};
 if(a.confidence!==undefined&&(typeof a.confidence!=='number'||a.confidence<0||a.confidence>1||!Number.isFinite(a.confidence)))throw Error('invalid_decision');
 return {model,label:a.choice,probabilities,confidence:a.confidence??null,inputTokens:tokens(raw.usage?.input_tokens),outputTokens:tokens(raw.usage?.output_tokens),costUsd:null};
}
export function jevProvider(model:string,key:string,timeoutMs:number,fetcher:typeof fetch=fetch):LocalProvider {
 if(!key)throw Error('TYPESAFE_API_KEY is missing; local evaluation remains available.');
 return {name:'jev',metadata:{model,route:'direct-typesafe',inputUsdPerMillion:JEV_INPUT_USD_PER_MILLION,pricingDate:'2026-10-20'},close(){},async ask(p){
  let response:Response;
  try{response=await fetcher('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(jevRequest(p,model)),redirect:'error',signal:AbortSignal.timeout(timeoutMs)});}
  catch{throw Error('provider_request_failed');}
  if(!response.ok){await response.body?.cancel();throw Error(`http_${response.status}`);}
  let raw:any;try{raw=await response.json();}catch{throw Error('invalid_json');}
  return parseJev(raw,p,model);
 }};
}
