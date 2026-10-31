import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDataset,buildPackets,validateGold,selectSmoke,route,wirePacket,type Row,type Answer } from '../src/bench-domain.js';
import { parseOpenAI,parseProbabilities,parseQwen } from '../src/bench-adapters.js';
import { summarize,percentile } from '../src/bench-metrics.js';
import { renderBenchReport } from '../src/bench-report.js';
const raw=JSON.parse(await readFile(new URL('../benchmarks/decision-pilot/dataset.json',import.meta.url),'utf8'));
const dataset=validateDataset(raw),packets=buildPackets(dataset);
const gold=validateGold(JSON.parse(await readFile(new URL('../benchmarks/decision-pilot/gold.json',import.meta.url),'utf8')),packets);
function row(id:string,label:string,probability=1):Row {
 const p=packets.find(p=>p.id===id)!;
 const answer:Answer={label,probabilities:Object.fromEntries(Object.keys(p.choices).map(k=>[k,k===label?probability:(1-probability)/(Object.keys(p.choices).length-1)])),confidence:probability,costUsd:null,inputTokens:1,outputTokens:0,model:'test'};
 return {provider:'laya',id,repeat:1,task:p.task,split:p.split,packetHash:p.hash,status:'evaluated',answer,elapsedMs:10,...route(p,answer,.8)};
}
test('author labels cover all cases without crossing group splits',()=>{
 assert.equal(packets.length,16);assert.equal(gold.labels.length,16);
 const bad=structuredClone(raw);bad.coverage[1].group=bad.coverage[4].group;
 assert.throws(()=>validateDataset(bad),/group_split/);
});
test('wire packets exclude gold, local provenance, IDs and split; full evidence is preserved',()=>{
 for(const p of packets){const s=JSON.stringify(wirePacket(p));assert.ok(!s.includes(p.id));assert.ok(!s.includes('synthetic/'));assert.ok(!s.includes('rationale'));assert.ok(!s.includes('heldout'));}
 const p=packets[0];assert.ok(p.input.includes('customerExists'));assert.equal(p.hash.length,64);
 const changed=structuredClone(dataset);changed.coverage[0].tests[0].code+=' extra assertion';assert.notEqual(buildPackets(changed)[0].hash,p.hash);
});
test('gold validation rejects duplicates, missing and out-of-rubric labels',()=>{
 assert.throws(()=>validateGold({...gold,labels:gold.labels.slice(1)},packets));
 assert.throws(()=>validateGold({...gold,labels:[...gold.labels,gold.labels[0]]},packets));
 assert.throws(()=>validateGold({...gold,labels:gold.labels.map((g,i)=>i?g:{...g,label:'approve'})},packets));
});
test('smoke optimizer preserves dependencies and critical journeys while pruning redundancy',()=>{
 const s=dataset.suites[0];const rows=s.candidates.map(c=>row(`${s.id}:${c.id}`,c.id==='theme'?'exclude':'include'));
 const result=selectSmoke(s,rows);assert.equal(result.feasible,true);assert.deepEqual(result.selected,['auth-setup','sign-in','checkout-fast']);
 assert.equal(result.estimatedSerialMs,14000);assert.equal(result.runtimeReduction,null);assert.equal(result.retainedJourneys,2);
});
test('missing dependency, infeasible budget and incomplete inventory cannot approve a suite',()=>{
 const s=dataset.suites[0];const rows=s.candidates.map(c=>row(`${s.id}:${c.id}`,c.id==='auth-setup'?'exclude':'include'));
 assert.equal(selectSmoke(s,rows).feasible,false);assert.ok(selectSmoke(s,rows).dependencyViolations.length>0);
 const all=s.candidates.map(c=>row(`${s.id}:${c.id}`,'include'));
 assert.equal(selectSmoke({...s,budgetMs:100},all).feasible,false);
 assert.equal(selectSmoke({...s,inventoryComplete:false},all).feasible,false);
});
test('flaky critical coverage remains unresolved and is never silently waived',()=>{
 const s=dataset.suites[1];const rows=s.candidates.map(c=>row(`${s.id}:${c.id}`,'include'));
 assert.equal(rows[1].routedLabel,'needs_judgment');const result=selectSmoke(s,rows);
 assert.equal(result.feasible,false);assert.deepEqual(result.missedJourneys,['transfer']);assert.equal(result.reviewRequired,true);
});
test('dependency cycles and unknown dependency references are rejected before inference',()=>{
 const bad=structuredClone(raw);bad.suites[0].candidates[0].dependencies=['missing'];assert.throws(()=>validateDataset(bad),/unknown_dependency/);
 bad.suites[0].candidates[0].dependencies=['sign-in'];assert.throws(()=>validateDataset(bad),/dependency_cycle/);
});
test('raw findings stay visible when incomplete evidence or low probability requires review',()=>{
 const uncertain=row('login-helper','covered');assert.equal(uncertain.answer!.label,'covered');assert.equal(uncertain.routedLabel,'needs_judgment');
 const low=row('viewer-delete','covered',.6);assert.equal(low.routedLabel,'needs_judgment');assert.equal(low.routingReason,'provisional_probability_threshold');
});
test('Decisions parser rejects malformed distributions, wrong model, missing name and refusals',()=>{
 const p=packets[0];const response={model:'expected',answers:[{name:'decision',type:'choice',choice:'covered',confidence:.9,
 probabilities:Object.keys(p.choices).map(value=>({value,probability:value==='covered'?1:0}))}],usage:{input_tokens:50},provider_metadata:{gateway:{cost:'0.001'}}};
 assert.equal(parseOpenAI(response,p,'expected').costUsd,.001);
 assert.throws(()=>parseOpenAI(response,p,'other'),/unexpected_model/);
 assert.throws(()=>parseOpenAI({...response,answers:[{type:'refusal',name:'decision'}]},p,'expected'),/refusal/);
 assert.throws(()=>parseOpenAI({...response,answers:[{...response.answers[0],name:'wrong'}]},p,'expected'));
 assert.throws(()=>parseProbabilities({covered:1,partial:1,uncovered:0,needs_judgment:0},p));
 assert.throws(()=>parseProbabilities({covered:1},p));
});
test('Qwen proxy does not fabricate probabilities or billed cost and rejects invalid labels',()=>{
 const response={model:'qwen3:4b',done:true,message:{content:'{"decision":"covered"}'},eval_duration:1000000};
 assert.equal(parseQwen(response,packets[0]).probabilities,null);assert.equal(parseQwen(response,packets[0]).costUsd,null);
 assert.throws(()=>parseQwen({...response,message:{content:'{"decision":"approve"}'}},packets[0]),/invalid_label/);
});
test('metrics keep failed cases in requested denominators and separate failure latency',()=>{
 const a=row('refund-total','partial');const p=packets.find(p=>p.id==='export-rows')!;
 const b:Row={provider:'laya',id:p.id,repeat:1,task:p.task,split:p.split,packetHash:p.hash,status:'error',errorCode:'timeout',elapsedMs:90000};
 const result=summarize(packets,[a,b],gold,dataset,1).summaries.find(s=>s.provider==='laya'&&s.task==='coverage'&&s.split==='development')!;
 assert.equal(result.accuracy,1);assert.equal(result.endToEndAccuracy,.25);assert.equal(result.gapRecall,.5);assert.equal(result.p95Ms,10);assert.equal(result.failedLatencyP50Ms,90000);assert.equal(result.reportedCostUsd,null);assert.equal(result.repeatability,null);
 assert.throws(()=>summarize(packets,[a,a],gold,dataset,1),/invalid_rows/);
});
test('percentiles and repeatability do not treat repeated samples as independent cases',()=>{
 assert.equal(percentile([], .95),null);assert.equal(percentile([1,2,3,4],.5),2);assert.equal(percentile([1,2,3,4],.95),4);
 const a=row('viewer-delete','covered');const b={...a,repeat:2};
 const s=summarize(packets,[a,b],gold,dataset,2).summaries.find(s=>s.provider==='laya'&&s.task==='coverage'&&s.split==='development')!;
 assert.equal(s.requested,8);assert.equal(s.uniqueCases,4);assert.equal(s.repeatableCases,1);assert.equal(s.repeatability,1);
});
test('HTML report escapes evidence and never claims measured suite runtime',()=>{
 const ps=structuredClone(packets);ps[0].evidenceRefs=['<script>bad</script>'];
 const html=renderBenchReport({mode:'preview',generatedAt:'test',repeats:1,packets:ps,rows:[row(ps[0].id,'covered')],metrics:summarize(packets,[],gold,dataset,1)});
 assert.ok(html.includes('&lt;script&gt;bad'));assert.ok(!html.includes('<script>bad'));assert.ok(html.includes('unmeasured'));
});

test('OpenAI adapter uses only the direct API key and direct model contract', async()=>{
 const {openai}=await import('../src/bench-adapters.js');const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
 try{
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(()=>openai(packets[0]),/missing_openai_key/);
  process.env.OPENAI_API_KEY='test-key-not-a-secret';
  globalThis.fetch=async(url,init)=>{
   assert.equal(url,'https://api.openai.com/v1/decisions');
   const body=JSON.parse(String(init!.body));assert.equal(body.model,'gpt-6-luna');assert.equal(body.input,packets[0].input);
   assert.equal(body.questions[0].name,'decision');
   return new Response(JSON.stringify({model:'gpt-6-luna',answers:[{name:'decision',type:'choice',choice:'covered',probabilities:Object.keys(packets[0].choices).map(value=>({value,probability:value==='covered'?1:0}))}]}),{status:200});
  };
  assert.equal((await openai(packets[0])).label,'covered');
 }finally{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;}
});
