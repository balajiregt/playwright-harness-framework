import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,digest} from '../src/context.js';
import {configSchema,type MutationPlan} from '../src/mutation/schema.js';
import {buildWorkload} from '../src/mutation/workload.js';
import type {Inventory} from '../src/team/collect.js';
import type {Campaign,Execution} from '../src/mutation/runner.js';
import {campaignMetrics} from '../src/mutation/report.js';
import {demoMeasurements,type DemoEvidence} from '../src/demo/platform.js';

const policy=JSON.parse(await readFile(path.join(ROOT,'../examples/validation-demo/platform-policy.json'),'utf8'));
function fixture(){
 const context={version:1 as const,hash:digest('context'),artifacts:[{id:'epic',file:'epic.md',sha256:digest('private fixture source'),text:'PRIVATE_REQUIREMENT_SENTINEL'}],sources:[{file:'app.js',sha256:digest('source'),code:'const readOnly = true;'}]};
 const ids=['VIEWER-READONLY-OFF','DASHBOARD-METRIC-ZERO'],requirements=['VIEWER-READONLY','DASHBOARD-METRIC'];
 const plan:MutationPlan={version:1,contextHash:context.hash,requirements:requirements.map(id=>({id,criterion:'Authored requirement '+id,critical:true,source:{artifactId:'epic',quote:'private fixture source'}})),
  mutations:ids.map((id,i)=>({id,requirementId:requirements[i],description:'Controlled fixture fault',file:'app.js',before:'true',after:'false',probe:{project:'chromium',path:'/',testId:'value',kind:'text',expected:i?'$842kOpen pipeline':'1',roles:[]}}))};
 const inventory:Inventory={version:1,mode:'list',complete:true,createdAt:'2026-10-31T17:15:39.709Z',wallMs:null,tests:Array.from({length:6},(_,i)=>({id:'t'+i,title:'test '+i,project:'chromium',file:'test.spec.ts',line:i+1,column:1,runnable:true,dependencies:[],durationMs:null,passRate:null,runs:0,results:[],evidence:{code:'expect(value).toBe(true)',sources:[],issues:[],fingerprint:digest('test '+i)}}))};
 const config=configSchema.parse({version:1,repo:'.',artifactDir:'.',sourceFiles:['app.js'],analysis:{scope:'synthetic'}});
 const workload=buildWorkload(config,context,plan,inventory,digest('repository'));
 const execution=(failed=false):Execution=>({status:failed?'failed':'passed',errors:0,wallMs:10,tests:inventory.tests.map((t,i)=>({id:t.id,title:t.title,file:t.file,line:t.line,project:t.project,expectedStatus:'passed',results:[{status:failed&&i===0?'failed':'passed',retry:0,durationMs:1,assertionFailure:failed&&i===0,errors:[]}]}))});
 const campaign:Campaign={version:1,kind:'playwright-behavioral-mutations',runId:'fixture-run',createdAt:'2026-10-31T17:15:50.050Z',contextHash:context.hash,repositoryHash:workload.repositoryHash,planHash:digest(JSON.stringify(plan)),scopeHash:workload.scopeHash,plan,baseline:[execution(),execution()],restored:execution(),originalUnchanged:true,wallMs:20,
  faults:ids.map((id,i)=>({id,requirementId:requirements[i],status:i?'survived':'killed',baselineProbe:i?'$842kOpen pipeline':'1',mutantProbe:i?'$0Open pipeline':'0',attempts:[execution(!i),execution(!i)],killingTests:i?[]:['test 0']}))};
 const events=Array.from({length:26},(_,i)=>({transport:i<3?'mcp-stdio':'code-mode-mcp',tool:['context','evidence','inspect'][i]??'call_tool_chain',status:i<19?'passed':'blocked',startedAt:'2026-10-31T17:15:50.000Z',durationMs:1,requestHash:digest('request'+i),resultHash:digest('result'+i),evidencePath:`/former/local/run/mcp-receipts/${String(i+1).padStart(3,'0')}-receipt.json`}));
 const checks={livePlan:'skipped',liveAssess:'skipped',...Object.fromEntries(Array.from({length:25},(_,i)=>['check'+i,true]))};
 const audit={version:1,kind:'local-mcp-code-mode-audit',failed:false,campaignDir:'/former/local/run/mutations/fixture-run',checks,events};
 const graphs={version:1,status:'passed',counts:{sourceNodes:55,sourceEdges:59,candidateTests:38,testCases:6,routes:7,heuristicCoveredRoutes:7,gaps:2,duplicateCandidates:0,overlapCandidates:1}};
 const stats={startTime:'2026-10-31T17:15:40.734Z',duration:3364,expected:6,skipped:0,unexpected:0,flaky:0};
 const summary={version:1,scope:'synthetic CRM demonstration',createdAt:'2026-10-31T17:15:39.709Z',corePassed:true,passed:true,productAccepted:false,sourceHash:workload.repositoryHash,sourceRevision:null,dirty:null,sourceUnchanged:true,browser:stats,live:{codex:'skipped',laya:'skipped'},workload:{hash:workload.hash,pairs:12,contextHash:context.hash},campaign:{dir:audit.campaignDir,runId:campaign.runId,baseline:campaign.baseline.map(b=>({status:b.status,tests:b.tests.length})),restored:'passed',originalUnchanged:true,faults:campaign.faults},mcp:{checks,events},graphs,
  matrix:Array.from({length:8},(_,i)=>({criterion:requirements[i]??'criterion'+i,assessment:i===1?'missing assertion':'supported'}))};
 const receipts=Object.fromEntries(events.map((e,i)=>[path.basename(e.evidencePath),{...e,summary:i===0||i===1?{contextHash:context.hash}:i===2?{contextHash:context.hash,planHash:campaign.planHash}:i===18?{dir:audit.campaignDir,metrics:campaignMetrics(campaign)}:{}}]));
 const browser={stats,errors:[],suites:[{specs:inventory.tests.map(()=>({tests:[{expectedStatus:'passed',results:[{status:'passed'}]}]}))}]};
 return {summary,audit,graphs,campaign,workload,browser,receipts};
}
test('community metrics retain original timestamp, null revision, conservative dirty state and exact denominators',()=>{
 const data=demoMeasurements(fixture(),policy.metrics);
 assert.equal(data.observedAt,'2026-10-31T17:15:39.709Z');assert.equal(data.revision,null);assert.equal(data.dirty,true);assert.equal(data.status,'partial');
 for(const [id,value,n] of [['browser-passed',6,6],['browser-skipped',0,6],['mcp-checks',27,27],['mcp-checks-passed',25,27],['mcp-checks-skipped',2,27],['mcp-receipts',26,26],['mcp-receipts-passed',19,26],['mcp-expected-blocks',7,26],['faults-killed',1,2],['faults-survived',1,2],['criteria-supported',7,8],['criteria-missing-assertion',1,8],['graph-candidate-gaps',2,1]] as const)
  assert.deepEqual(data.values[id],{value,state:'measured',sampleSize:n},id);
 for(const id of ['codex-planned-faults','laya-assessed-pairs','provider-runtime-agreement'])assert.deepEqual(data.values[id],{value:null,state:'unavailable',sampleSize:null});
});
test('bundled publisher accepts the isolated policy and exposes no raw evidence',async()=>{
 const data=demoMeasurements(fixture(),policy.metrics);
 const {prepare,validatePrepared}=await import(pathToFileURL(path.join(ROOT,'.agents/skills/platform-publish/scripts/publisher.mjs')).href);
 const prepared=prepare(policy,data);validatePrepared(prepared,policy);
 assert.equal(prepared.status,'partial');assert.equal(prepared.projectId,'agentic-playwright');assert.ok(!JSON.stringify(prepared).includes('PRIVATE_REQUIREMENT_SENTINEL'));assert.ok(!JSON.stringify(prepared).includes('/former/local'));
});
test('mismatched context, repository, plan, audit, graph and missing receipt evidence are rejected',()=>{
 const changes=[(f:ReturnType<typeof fixture>)=>{f.campaign.contextHash=digest('other');},(f:ReturnType<typeof fixture>)=>{f.summary.sourceHash=digest('other');},(f:ReturnType<typeof fixture>)=>{f.campaign.planHash=digest('other');},(f:ReturnType<typeof fixture>)=>{f.audit.failed=true;},(f:ReturnType<typeof fixture>)=>{f.summary.graphs=structuredClone(f.graphs);f.summary.graphs.counts.gaps=3;},(f:ReturnType<typeof fixture>)=>{delete f.receipts[Object.keys(f.receipts)[0]];}];
 for(const change of changes){const f=fixture();change(f);assert.throws(()=>demoMeasurements(f as DemoEvidence,policy.metrics));}
});
test('surviving fault remains a missing assertion; fake activation, inconsistent outcomes and skipped baselines fail',()=>{
 const f=fixture();assert.equal(demoMeasurements(f,policy.metrics).values['faults-survived'].value,1);
 const unchanged=fixture();unchanged.campaign.faults[0].mutantProbe='1';assert.throws(()=>demoMeasurements(unchanged,policy.metrics),/activation/);
 const contradictory=fixture();contradictory.campaign.faults[0].attempts[1]=structuredClone(contradictory.campaign.baseline[0]);assert.throws(()=>demoMeasurements(contradictory,policy.metrics),/repeated assertion/);
 const skipped=fixture();for(const baseline of skipped.campaign.baseline){baseline.tests[0].expectedStatus='skipped';baseline.tests[0].results[0].status='skipped';}assert.throws(()=>demoMeasurements(skipped,policy.metrics));
 const accepted=fixture();accepted.summary.matrix[1].assessment='supported';assert.throws(()=>demoMeasurements(accepted,policy.metrics),/incorrectly accepted/);
 const incomplete=fixture();incomplete.summary.passed=false;assert.throws(()=>demoMeasurements(incomplete,policy.metrics));
 const missingCheck=fixture();Reflect.deleteProperty(missingCheck.audit.checks,'check0');assert.throws(()=>demoMeasurements(missingCheck,policy.metrics),/incomplete demo audit inventory/);
});
