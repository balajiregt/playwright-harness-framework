import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ROOT,digest} from '../src/context.js';
import {configSchema,type MutationPlan} from '../src/mutation/schema.js';
import {buildWorkload,readWorkload,decisionChoices,validateWorkload,type Workload} from '../src/mutation/workload.js';
import {evaluateEngine,type EngineRun} from '../src/mutation/engines.js';
import {analysisMetrics,validateAnalysis,bindCampaign,importEngine,type AnalysisComparison} from '../src/mutation/analysis.js';
import {renderAnalysisReport} from '../src/mutation/analysis-report.js';
import {platformMeasurements} from '../src/mutation/platform.js';
import {openEvidenceClient} from '../src/mutation/code-mode-client.js';
import type {Inventory} from '../src/team/collect.js';
import type {Campaign,Execution} from '../src/mutation/runner.js';

function fixture(){
 const config=configSchema.parse({version:1,repo:'/tmp/fixture',artifactDir:'/tmp/exports',sourceFiles:['app.js'],analysis:{scope:'synthetic'}});
 const quote='Viewer cannot see admin.';
 const context={version:1 as const,hash:digest('context'),artifacts:[{id:'epic',file:'epic.md',sha256:digest(quote),text:quote}],sources:[{file:'app.js',sha256:digest('false'),code:'const admin=false;'}]};
 const plan:MutationPlan={version:1,contextHash:context.hash,requirements:[{id:'AUTH',criterion:quote,critical:true,source:{artifactId:'epic',quote}}],mutations:[{id:'M1',requirementId:'AUTH',description:'Show admin to viewer',file:'app.js',before:'false',after:'true',probe:{project:'viewer',path:'/',testId:'admin',kind:'count',expected:'0',roles:[]}}]};
 const inventory:Inventory={version:1,mode:'list',complete:true,createdAt:new Date().toISOString(),wallMs:null,tests:['assert admin absent','assert unrelated flag'].map((title,i)=>({id:'t'+i,title,project:'viewer',file:'tests.spec.ts',line:i+1,column:1,runnable:true,dependencies:[],durationMs:null,passRate:null,runs:0,results:[],evidence:{code:i?'expect(flag).toBe(true)':'expect(admin).toHaveCount(0)',sources:[],issues:[],fingerprint:digest('test'+i)}}))};
 const w=buildWorkload(config,context,plan,inventory,digest('repo'));
 const execution=(failed=false):Execution=>({status:failed?'failed':'passed',errors:0,wallMs:10,tests:inventory.tests.map((t,i)=>({id:t.id,title:'viewer › '+t.title,file:'/copy/'+t.file,line:t.line,project:t.project,expectedStatus:'passed',results:[{status:failed&&i===0?'failed':'passed',retry:0,durationMs:5,assertionFailure:failed&&i===0,errors:failed&&i===0?['expect(admin) failed']:[]}]}))});
 const campaign:Campaign={version:1,kind:'playwright-behavioral-mutations',runId:'fixture-runtime',createdAt:new Date().toISOString(),contextHash:context.hash,repositoryHash:w.repositoryHash,planHash:digest(JSON.stringify(plan)),scopeHash:w.scopeHash,plan,baseline:[execution(),execution()],restored:execution(),faults:[{id:'M1',requirementId:'AUTH',status:'killed',baselineProbe:'0',mutantProbe:'1',attempts:[execution(true),execution(true)],killingTests:['viewer › assert admin absent']}],originalUnchanged:true,wallMs:10};
 return {config,w,campaign};
}
async function engine(w:Workload,id:string,decisions:string[]):Promise<EngineRun>{let i=0;return evaluateEngine(w,id,async()=>({id,metadata:{model:'synthetic-test-double'},close:async()=>{},predict:async()=>({status:'evaluated',decision:decisions[i++] as 'detected',probabilities:null,reason:null,elapsedMs:2,contextMs:1,inputTokens:100,outputTokens:10,cachedInputTokens:null,agentToolCalls:0,contextBytes:500})}));}
async function comparison():Promise<AnalysisComparison>{const {w,campaign}=fixture();return {version:1 as const,protocol:'independent-mutation-analysis-v1' as const,runId:'00000000-0000-4000-8000-000000000001',startedAt:'2026-10-31T10:00:00.000Z',completedAt:'2026-10-31T10:01:00.000Z',workload:w,campaign,engines:[await engine(w,'laya',['detected','detected']),await engine(w,'codex',['detected','missed'])]};}
test('frozen packets bind artifact quotes, tests and rubric; changes and excessive workloads are rejected',async()=>{
 const {w,config}=fixture();assert.equal(validateWorkload(w).pairs.length,2);
 const copied=structuredClone(w);copied.pairs[0].packet.input='tampered';assert.throws(()=>validateWorkload(copied));
 assert.ok(!w.pairs[0].packet.input.includes('referenceDecision'));assert.ok(w.pairs[0].packet.input.includes('sourceQuote'));
 assert.throws(()=>buildWorkload({...config,laya:{...config.laya,maxPairs:1}},w.context,w.plan,w.inventory,w.repositoryHash),/maxPairs/);
});
test('quality compares identical packets on common pairs while preserving whole-provider and unknown denominators',async()=>{
 const r=await comparison();validateAnalysis(r);let m=analysisMetrics(r);
 assert.equal(m.commonPairs,2);assert.equal(m.providers.laya.commonQuality.matchRate,.5);assert.equal(m.providers.laya.commonQuality.falseDetected,1);assert.equal(m.providers.codex.commonQuality.matchRate,1);
 r.engines[1].cells[1]={...r.engines[1].cells[1],status:'excluded',decision:null};m=analysisMetrics(r);
 assert.equal(m.commonPairs,1);assert.equal(m.providers.laya.commonQuality.matchRate,1);assert.equal(m.providers.laya.quality.matchRate,.5);assert.equal(m.providers.codex.excluded,1);
 r.campaign!.faults[0].status='not_activated';assert.equal(analysisMetrics(r).providers.laya.quality.matchRate,null);
});
test('uncertain decisions do not improve agreement by disappearing from known-outcome denominators',async()=>{
 const r=await comparison();r.engines[1].cells[1].decision='needs_judgment';const m=analysisMetrics(r);
 assert.equal(m.commonPairs,2);assert.equal(m.providers.codex.uncertain,1);assert.equal(m.providers.codex.commonQuality.matchRate,.5);
});
test('campaign binding rejects stale tests, modified plans and conclusive claims without activation/restoration',()=>{
 const {w,campaign}=fixture();bindCampaign(w,campaign);
 for(const mutate of [(c:Campaign)=>c.repositoryHash='stale',(c:Campaign)=>c.restored=null,(c:Campaign)=>c.faults[0].mutantProbe='0',(c:Campaign)=>c.faults[0].attempts.pop(),(c:Campaign)=>c.plan.mutations[0].after='different']){const c=structuredClone(campaign);mutate(c);assert.throws(()=>bindCampaign(w,c));}
});
test('provider errors stop after three requests and retain every unassessed pair',async()=>{
 const {w}=fixture();const larger={...w,pairs:[...w.pairs,...w.pairs.map(p=>({...p,id:p.id+'extra'}))]};let calls=0,closed=false;
 const r=await evaluateEngine(larger,'fixture',async()=>({id:'fixture',metadata:{},predict:async()=>{calls++;throw Error('sensitive provider failure');},close:async()=>{closed=true;}}));
 assert.equal(calls,3);assert.equal(r.cells.length,4);assert.equal(r.cells[3].status,'not_run');assert.ok(closed);assert.ok(!JSON.stringify(r).includes('sensitive provider'));
});
test('other agent imports are input-bound, cannot impersonate built-ins and never fabricate timing',()=>{
 const {w}=fixture(),raw={engine:'external-agent',workloadHash:w.hash,model:'example adapter',cells:[{pairId:w.pairs[0].id,packetHash:w.pairs[0].packet.hash,decision:'missed'}]};
 const r=importEngine(raw,w);assert.equal(r.cells[1].status,'not_run');assert.equal(r.wallMs,null);assert.equal(r.cells[0].inputTokens,null);
 assert.throws(()=>importEngine({...raw,engine:'codex'},w));assert.throws(()=>importEngine({...raw,cells:[{...raw.cells[0],packetHash:'stale'}]},w));
});
test('reviewed metric definitions can map another imported agent without inventing runtime measurements',async()=>{
 const r=await comparison();const imported=importEngine({engine:'external-agent',model:'example',workloadHash:r.workload.hash,cells:[{pairId:r.workload.pairs[0].id,packetHash:r.workload.pairs[0].packet.hash,decision:'detected'}]},r.workload);
 r.engines=[imported];const m=platformMeasurements(r,[{id:'external-agent-completed'},{id:'external-agent-duration'},{id:'external-agent-input-tokens'}]);
 assert.equal(m.values['external-agent-completed'].value,1);assert.equal(m.values['external-agent-duration'].state,'unavailable');assert.equal(m.values['external-agent-input-tokens'].value,null);
});
test('shared platform publisher validates only policy-authored aggregates; missing values stay unavailable',async()=>{
 const r=await comparison(),policy=JSON.parse(await readFile(path.join(ROOT,'.platform-publish.json'),'utf8'));
 const measurements=platformMeasurements(r,policy.metrics);
 assert.equal(measurements.values['codex-cached-input-tokens'].state,'unavailable');assert.equal(measurements.values['codex-actual-cost'].value,null);
 const {prepare,validatePrepared}=await import(pathToFileURL(path.join(ROOT,'.agents/skills/platform-publish/scripts/publisher.mjs')).href);
 const prepared=prepare(policy,measurements);validatePrepared(prepared,policy);
 assert.ok(!JSON.stringify(prepared).includes(r.workload.plan.requirements[0].criterion));assert.ok(!JSON.stringify(prepared).includes('targetTest'));
 const unknown=structuredClone(r);unknown.campaign=null;const unmeasured=platformMeasurements(unknown,policy.metrics);assert.equal(unmeasured.values['faults-killed'].state,'unavailable');assert.equal(unmeasured.values['laya-common-match-rate'].value,null);
});
test('actual frozen MCP restricts a model invocation to one packet and exposes no execution tool',async()=>{
 const {w}=fixture(),dir=await mkdtemp(path.join(os.tmpdir(),'analysis-mcp-')),file=path.join(dir,'workload.json');await writeFile(file,JSON.stringify(w));
 const client=new Client({name:'frozen-protocol-test',version:'1'});
 try{await client.connect(new StdioClientTransport({command:process.execPath,args:['--import','tsx',path.join(ROOT,'src/mutation-cli.ts'),'analysis-mcp','--workload',file,'--pair',w.pairs[0].id],cwd:ROOT,stderr:'pipe'}));
  assert.deepEqual((await client.listTools()).tools.map(t=>t.name),['analysis_packet']);
  const result=await client.callTool({name:'analysis_packet',arguments:{pairId:w.pairs[0].id}});assert.ok(JSON.stringify(result).includes(w.pairs[0].packet.hash));
  assert.equal((await client.callTool({name:'analysis_packet',arguments:{pairId:w.pairs[1].id}})).isError,true);
 }finally{await client.close();await rm(dir,{recursive:true,force:true});}
});
test('Code Mode retrieves exactly the frozen evidence through both MCP layers',{skip:!existsSync(path.join(ROOT,'integrations/code-mode/node_modules/isolated-vm/package.json'))},async()=>{
 const {w}=fixture(),dir=await mkdtemp(path.join(os.tmpdir(),'analysis-code-mode-')),file=path.join(dir,'workload.json');await writeFile(file,JSON.stringify(w));let client;
 try{client=await openEvidenceClient(process.execPath,file);const p=await client.packet(w.pairs[0]);assert.equal(p.input,w.pairs[0].packet.input);assert.equal(p.packetHash,w.pairs[0].packet.hash);}
 finally{await client?.close();await rm(dir,{recursive:true,force:true});}
});
test('comparison HTML escapes private evidence and labels missing model quality honestly',async()=>{
 const r=await comparison();r.workload.pairs[0].testTitle='<img src=x onerror=alert(1)>';r.campaign=null;
 const html=renderAnalysisReport(r);assert.ok(!html.includes('<img src=x'));assert.match(html,/Unavailable/);assert.match(html,/Unknown \/ not executed/);
});
