import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink,mkdir,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {sourceEvidence,collect,type Inventory,type TeamTest} from '../src/team/collect.js';
import {compactEvidence} from '../src/team/evidence.js';
import {configSchema} from '../src/team/config.js';
import {evidencePacket} from '../src/team/providers.js';
import {evaluate,proposeSmoke} from '../src/team/evaluate.js';
import {parseJev,jevProvider,jevRequest} from '../src/team/jev.js';
import {comparisonMetrics,attachReviews,inventoryHash,runComparison,executeSmoke,type Comparison} from '../src/team/comparison.js';
import {validateComparisonMetrics} from '../shared/comparison-metrics.mjs';
import {renderComparison} from '../shared/comparison-view.mjs';
import {digest,ROOT} from '../src/context.js';

const req={id:'AUTH-1',criterion:'A viewer cannot see the admin-console action.',journey:'access',critical:true};
const c=()=>configSchema.parse({version:1,repo:'/tmp',requirements:'requirements.json'});
const t=(id='test'):TeamTest=>({id,title:'viewer access',project:'viewer',file:'test.spec.ts',line:1,column:1,runnable:true,dependencies:[],durationMs:100,passRate:1,runs:3,results:[{status:'passed',expectedStatus:'passed',retry:0,durationMs:100}],evidence:{code:'expect(adminAction).toHaveCount(0)',sources:[],issues:[],fingerprint:'f'}});
const inv=():Inventory=>({version:1,mode:'list',complete:true,createdAt:new Date().toISOString(),wallMs:null,tests:[t()]});
const answer=(label='covered',p=.92)=>({label,model:'fixture',probabilities:{covered:p,partial:1-p,uncovered:0,needs_judgment:0},confidence:.8,costUsd:null,inputTokens:100,outputTokens:12});
async function report():Promise<Comparison>{
 const i=inv(),run=await evaluate(c(),[req],i,{metadata:{model:'fixture'},close(){},async ask(){return answer();}},undefined,.8);
 return {version:2,datasetKind:'synthetic-fixture',kind:'playwright-decision-comparison',runId:'00000000-0000-4000-8000-000000000001',generatedAt:new Date().toISOString(),inventoryHash:inventoryHash(i),requirementsHash:digest(JSON.stringify([req])),requirements:[req],inventory:i,policy:{minProbability:.8,minPassRate:.98,minRuns:3,budgetMs:300000},runs:{laya:run,jev:structuredClone(run)},reviews:null,smokeExecutions:{}};
}
test('direct Jev uses typed choices, validates version/distribution and never echoes provider secrets',async()=>{
 const p=evidencePacket(req,t()),model='jev-1.14.0';
 const raw={model,answers:{decision:{type:'choice',choice:'covered',probabilities:answer().probabilities,confidence:.8}},usage:{input_tokens:123,output_tokens:20}};
 assert.equal(parseJev(raw,p,model).inputTokens,123);
 assert.throws(()=>parseJev({...raw,model:'wrong'},p,model));
 assert.throws(()=>parseJev({...raw,usage:{input_tokens:-1,output_tokens:0}},p,model));
 assert.throws(()=>parseJev({...raw,answers:{decision:{...raw.answers.decision,probabilities:{covered:1}}}},p,model));
 const provider=jevProvider(model,'secret',1000,(async(url,opts)=>{assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(opts?.redirect,'error');assert.deepEqual(JSON.parse(String(opts?.body)),jevRequest(p,model));return new Response('secret internal message',{status:403});}) as typeof fetch);
 await assert.rejects(provider.ask(p),e=>e instanceof Error&&e.message==='http_403');
});
test('static slicing retains reached helpers/hooks, resolves roles and removes unrelated methods and repeated target',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'evidence-slice-'));
 try{
  await writeFile(path.join(dir,'page.ts'),`export class Screen { constructor(private page:any){} async absent(){ await this.nested(); } async nested(){ await expect(this.page.getByTestId('admin-console')).toHaveCount(0); } async unrelated(){ await expect(SECRET_OTHER_FLOW).toBeTruthy(); } }`);
  const code=["import {test} from '@playwright/test';","import {Screen} from './page';","let screen:Screen;","test.beforeEach(({page})=>{screen=new Screen(page)});","test('viewer',async({},testInfo)=>{const role=testInfo.project.metadata.roles; await screen.absent();});","test('other',()=>expect(UNRELATED_TEST).toBe(true));"].join('\n');
  await writeFile(path.join(dir,'test.spec.ts'),code);
  const e=await sourceEvidence(dir,'test.spec.ts',5,1,100000),result=compactEvidence(e,['viewer']),wire=result.code+result.sources.map(s=>s.code).join();
  assert.match(wire,/\\?\"viewer\\?\"/);assert.match(wire,/toHaveCount\(0\)/);assert.match(wire,/new Screen/);
  assert.ok(!wire.includes('SECRET_OTHER_FLOW'));assert.ok(!wire.includes('UNRELATED_TEST'));assert.ok(!wire.includes('project.metadata.roles'));
  assert.equal(result.sources.filter(s=>s.code.includes("test('viewer'")).length,0);
  assert.ok(compactEvidence(e).issues.includes('unresolved_project_metadata'));
  assert.notEqual(compactEvidence(e,['admin']).fingerprint,result.fingerprint);
  const literal=compactEvidence({...e,code:"test('literal',()=>expect('testInfo.project.metadata.roles').toBe('literal'))"},['viewer']);
  assert.match(literal.code,/testInfo\.project\.metadata\.roles/);
  const dynamic=compactEvidence({...e,code:"test('dynamic',()=>screen[method]())"});
  assert.ok(dynamic.issues.includes('dynamic_dispatch_requires_review'));
  const sideEffect=compactEvidence({...e,sources:[{...e.sources[0],code:"configureRuntime();"}]});
  assert.ok(sideEffect.issues.includes('module_initialization_requires_review'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('strict proposals separate probability from history and block unknown duration and dependencies',async()=>{
 const r=await report(),run=r.runs.laya!;
 const policy={...c(),smoke:{...c().smoke,minRuns:3}};
 assert.equal(proposeSmoke(policy,[req],r.inventory,run.cells,.8).selected.length,1);
 for(const patch of [{runs:2},{passRate:.5},{durationMs:null},{dependencies:['missing']}]){
  const i=inv();Object.assign(i.tests[0],patch);assert.equal(proposeSmoke(policy,[req],i,run.cells,.8).selected.length,0);
 }
 run.cells[0].answer!.probabilities=answer('covered',.6).probabilities;
 assert.deepEqual(proposeSmoke(policy,[req],r.inventory,run.cells,.8).missingRequirements,['AUTH-1']);
 const extra={...req,id:'OPTIONAL',critical:false};
 assert.deepEqual(proposeSmoke({...policy,smoke:{...policy.smoke,mandatoryRequirementIds:['OPTIONAL']}},[req,extra],r.inventory,run.cells,.8).missingRequirements,['AUTH-1','OPTIONAL']);
 const skipped=inv();skipped.tests[0].runnable=false;
 const excluded=await evaluate(c(),[req],skipped,{metadata:{},close(){},async ask(){throw Error('must not be called');}},undefined,.8);
 assert.equal(excluded.cells.length,1);assert.equal(excluded.cells[0].status,'excluded');assert.equal(excluded.cells[0].label,'needs_judgment');
});
test('comparison denominators use only identical evaluated packets and quality requires bound reviewer labels',async()=>{
 const r=await report();let m=comparisonMetrics(r);assert.equal(m.commonPairs,1);assert.equal(m.providers.laya.quality.accuracy,null);
 const reviews={version:1,inventoryHash:r.inventoryHash,requirementsHash:r.requirementsHash,labels:[{requirementId:req.id,testId:'test',packetHash:r.runs.laya!.cells[0].packetHash,label:'uncovered',reviewer:'Reviewer',reviewedAt:new Date().toISOString()}]};
 attachReviews(r,reviews);m=comparisonMetrics(r);assert.equal(m.providers.laya.quality.falseCovered,1);assert.equal(m.providers.laya.commonQuality.accuracy,0);
 assert.throws(()=>attachReviews(r,{...reviews,inventoryHash:'stale'}));
 assert.throws(()=>attachReviews(r,{...reviews,labels:[reviews.labels[0],reviews.labels[0]]}));
 r.runs.jev!.cells[0].packetHash='different';assert.equal(comparisonMetrics(r).commonPairs,0);
 r.runs.jev!.cells[0].status='excluded';assert.equal(comparisonMetrics(r).commonPairs,0);
});
test('public schema rejects raw data at every level and inconsistent counts',async()=>{
 const r=await report(),m=comparisonMetrics(r);
 for(const mutate of [(x:any)=>x.source='secret',(x:any)=>x.providers.laya.performance.key='secret',(x:any)=>x.providers.laya.counts.valid++,(x:any)=>x.providers.laya.quality.accuracy=1,(x:any)=>x.disagreements=2]){
  const copy=structuredClone(m);mutate(copy);assert.throws(()=>validateComparisonMetrics(copy));
 }
 assert.ok(!JSON.stringify(m).includes(req.criterion));
});
test('private report escapes evidence and distinguishes execution, coverage, probability and review',async()=>{
 const r=await report();r.inventory.tests[0].title='<script>alert(1)</script>';r.inventory.tests[0].evidence.code='<img src=x onerror=alert(1)>';
 const html=renderComparison(r);assert.ok(!html.includes('<script>alert'));assert.ok(!html.includes('<img src=x'));assert.match(html,/92.0%/);assert.match(html,/3\/3/);assert.match(html,/Selected draft; review required/);
});
const targetModules=path.resolve(ROOT,'../node_modules');
test('CLI pipeline freezes evidence, explicitly gates hosted calls and executes exactly the recorded proposal',
 {skip:!existsSync(path.join(targetModules,'@playwright/test/cli.js'))},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'paired-integration-'));
 try{
  await mkdir(path.join(dir,'tests'));await symlink(targetModules,path.join(dir,'node_modules'));
  await writeFile(path.join(dir,'package.json'),'{"type":"module"}');
  await writeFile(path.join(dir,'playwright.config.ts'),"import {defineConfig} from '@playwright/test';export default defineConfig({testDir:'./tests',projects:[{name:'unit'}]});");
  await writeFile(path.join(dir,'tests/test.spec.ts'),"import {test,expect} from '@playwright/test';test('fixture assertion',()=>{expect(2+2).toBe(4)});");
  await writeFile(path.join(dir,'requirements.json'),JSON.stringify({version:1,requirements:[req]}));
  const config=configSchema.parse({version:1,datasetKind:'synthetic-fixture',repo:dir,requirements:path.join(dir,'requirements.json'),output:path.join(dir,'output'),comparison:{minRuns:1}});
  let calls=0;const packets:string[]=[];
  const factory=async(name:'laya'|'jev')=>({name:name==='jev'?'jev' as const:undefined,metadata:{model:'fixture'},close(){},async ask(p:any){calls++;packets.push(p.hash);return answer();}});
  await assert.rejects(runComparison(config,['laya','jev'],false,undefined,factory),/allow-hosted/);assert.equal(calls,0);
  const history=await collect(config,true,true);const hp=path.join(dir,'history.json');await writeFile(hp,JSON.stringify(history));config.history=[hp];
  const {report:r,dir:out}=await runComparison(config,['laya','jev'],true,undefined,factory);
  assert.equal(calls,2,JSON.stringify(r.runs.laya?.cells));assert.equal(new Set(packets).size,1);assert.equal(comparisonMetrics(r).commonPairs,1);
  assert.equal(await executeSmoke(config,r,'laya',out),true);assert.equal(r.smokeExecutions.laya?.passed,1);
  const metrics=JSON.parse(await readFile(path.join(out,'metrics.json'),'utf8'));assert.equal(metrics.providers.laya.smoke.execution.selected,1);
  await writeFile(path.join(dir,'tests/test.spec.ts'),"import {test,expect} from '@playwright/test';test('fixture assertion',()=>{expect(2+2).toBe(5)});");
  await assert.rejects(executeSmoke(config,r,'laya',out),/changed/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
