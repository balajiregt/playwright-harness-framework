import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,symlink,rm,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT} from '../src/context.js';
import {configSchema,requirementsSchema,localEndpoint} from '../src/team/config.js';
import {importRequirements} from '../src/team/requirements.js';
import {sourceEvidence,applyHistory,projectDependencies,type Inventory,type TeamTest} from '../src/team/collect.js';
import {evaluate,coverageMatrix,proposeSmoke,type Cell} from '../src/team/evaluate.js';
import {evidencePacket,parseQwenResponse,qwenRequest} from '../src/team/providers.js';
import {publicMetrics,validateTeamMetrics} from '../src/team/metrics.js';
import {renderTeamReport,saveReport} from '../src/team/report.js';
const reqs=[{id:'A',criterion:'The order status is Confirmed.',journey:'checkout',critical:true},{id:'B',criterion:'The refund equals the full paid amount.',journey:'refund',critical:true}];
const config=()=>configSchema.parse({version:1,repo:'/tmp/repo',requirements:'requirements.json'});
const sample=(id:string,patch:Partial<TeamTest>={}):TeamTest=>({id,title:id,project:'chromium',file:'tests/a.spec.ts',line:1,column:1,runnable:true,dependencies:[],evidence:{code:"test('checkout',async()=>{expect(order.status).toBe('Confirmed')})",sources:[],issues:[],fingerprint:'fingerprint'},durationMs:1000,passRate:1,runs:3,results:[],...patch});
const inventory=(tests=[sample('a'),sample('b')]):Inventory=>({version:1,mode:'list',complete:true,createdAt:new Date().toISOString(),wallMs:null,tests});
const cell=(requirementId:string,testId:string,label:Cell['label'],status:Cell['status']='evaluated'):Cell=>({requirementId,testId,label,status,reviewReasons:[]});
test('requirements reject duplicates, blank criteria, unknown columns and invalid critical flags',()=>{
 assert.throws(()=>requirementsSchema.parse({version:1,requirements:[reqs[0],reqs[0]]}));
 assert.throws(()=>requirementsSchema.parse({version:1,requirements:[{...reqs[0],criterion:''}]}));
 assert.throws(()=>requirementsSchema.parse({version:1,requirements:[{...reqs[0],secret:'x'}]}));
 assert.throws(()=>requirementsSchema.parse({version:1,requirements:[{...reqs[0],critical:'false'}]}));
});
for(const ext of ['json','xls','xlsx','docx','doc'])test(`real ${ext} template imports the same requirements`,{skip:ext!=='json'&&!existsSync(path.join(ROOT,'.venv/bin/python'))||ext==='doc'&&process.platform!=='darwin'&&!process.env.CI},async()=>{
 const result=await importRequirements(path.join(ROOT,`examples/team/requirements.${ext}`),path.join(ROOT,'.venv/bin/python'));
 assert.deepEqual(result,JSON.parse(await readFile(path.join(ROOT,'examples/team/requirements.json'),'utf8')));
});
test('model endpoints cannot export code to remote servers or redirect destinations',()=>{
 for(const url of ['https://example.com','http://127.0.0.1.evil.test','http://user:pass@localhost:8080','http://localhost/?key=x'])assert.throws(()=>localEndpoint(url));
 assert.equal(localEndpoint('http://127.0.0.1:8080/'),'http://127.0.0.1:8080');
});
test('source collection follows helpers and explicitly marks unresolved evidence',async()=>{
 const repo=await mkdtemp(path.join(os.tmpdir(),'team-source-'));
 try{await writeFile(path.join(repo,'helper.ts'),'export const assertAmount = (x:number)=>x;');await writeFile(path.join(repo,'sample.spec.ts'),"import {test,expect} from '@playwright/test';\nimport {assertAmount} from './helper';\ntest('amount',()=>{expect(assertAmount(20)).toBe(20)});\n");
 const evidence=await sourceEvidence(repo,'sample.spec.ts',3,1,10000);assert.equal(evidence.sources.length,2);assert.equal(evidence.issues.length,0);assert.match(evidence.code,/test\('amount'/);
 const limited=await sourceEvidence(repo,'sample.spec.ts',3,1,5);assert.ok(limited.issues.includes('source_byte_limit'));assert.equal(limited.sources.length,0);
 await symlink('/etc/hosts',path.join(repo,'escape.ts'));const escaped=await sourceEvidence(repo,'escape.ts',1,1,10000);assert.ok(escaped.issues.includes('dependency_outside_repository_or_missing'));
 }finally{await rm(repo,{recursive:true,force:true});}
});
test('provider wire data excludes requirement IDs, source paths, labels and local provenance',()=>{
 const p=evidencePacket({...reqs[0],id:'SECRET-TICKET'},sample('INTERNAL-ID',{evidence:{code:'expect(1).toBe(1)',sources:[{ref:'source-1',file:'/private/source.ts',sha256:'HASH',code:'code'}],issues:[],fingerprint:'FINGERPRINT'}}));
 for(const marker of ['SECRET-TICKET','INTERNAL-ID','/private/source.ts','FINGERPRINT'])assert.ok(!p.input.includes(marker));
});
test('target context retains shared hooks but excludes assertions from sibling tests',async()=>{
 const repo=await mkdtemp(path.join(os.tmpdir(),'team-isolation-'));
 try{await writeFile(path.join(repo,'sample.spec.ts'),[
 "import {test,expect} from '@playwright/test';",
 "test.describe('checkout',()=>{",
 "test.beforeEach(async()=>{ const setupMarker='setup'; });",
 "test('heading',()=>{expect('Order').toBe('Order')});",
 "test('status',()=>{expect('Confirmed').toBe('Confirmed')});",
 "});",
 "test.describe('refund',()=>{test.beforeEach(()=>{const unrelatedHook='private';});test('refund',()=>{expect('FULL_REFUND').toBe('FULL_REFUND')});});"
 ].join('\n'));
 const evidence=await sourceEvidence(repo,'sample.spec.ts',4,1,10000);
 assert.equal(evidence.issues.length,0);const context=evidence.sources.map(s=>s.code).join('\n');
 assert.match(context,/setupMarker/);assert.match(context,/test\('heading'/);
 for(const marker of ['Confirmed','FULL_REFUND','unrelatedHook'])assert.ok(!context.includes(marker));
 }finally{await rm(repo,{recursive:true,force:true});}
});
test('Qwen adapters use structured local requests and reject truncation or malformed responses',()=>{
 const p=evidencePacket(reqs[0],sample('a'));assert.equal((qwenRequest(p,'ollama','qwen3:4b') as any).think,false);
 assert.equal((qwenRequest(p,'llamacpp','qwen') as any).response_format.type,'json_schema');
 assert.throws(()=>parseQwenResponse({model:'qwen',done:true,done_reason:'length',message:{content:'{"decision":"covered"}'}},'ollama','qwen'));
 assert.throws(()=>parseQwenResponse({choices:[{finish_reason:'stop',message:{content:'{"decision":"covered","extra":"secret"}'}}]},'llamacpp','qwen'));
 assert.equal(parseQwenResponse({choices:[{finish_reason:'stop',message:{content:'{"decision":"partial"}'}}]},'llamacpp','qwen').label,'partial');
});
test('incomplete inventory or failed checks cannot turn missing evidence into uncovered',()=>{
 const inv=inventory();const cells=[cell('A','a','uncovered'),cell('A','b','needs_judgment','error')];
 assert.equal(coverageMatrix(reqs.slice(0,1),inv,cells)[0].label,'needs_judgment');
 assert.equal(coverageMatrix(reqs.slice(0,1),{...inv,complete:false},[cell('A','a','uncovered'),cell('A','b','uncovered')])[0].label,'needs_judgment');
});
test('smoke proposal includes setup, respects budget, and never hides critical gaps behind flaky candidates',()=>{
 const c=config();c.smoke.budgetMs=3500;
 const inv=inventory([sample('setup'),sample('a',{dependencies:['setup']}),sample('b',{passRate:.5}),sample('duplicate',{durationMs:5000})]);
 const cells=[cell('A','a','covered'),cell('A','duplicate','covered'),cell('B','b','covered')];
 const s=proposeSmoke(c,reqs,inv,cells);assert.deepEqual(new Set(s.selected),new Set(['a','setup']));assert.deepEqual(s.missingRequirements,['B']);assert.equal(s.approved,false);
});
test('unknown runtime remains unknown and dependency cycles do not produce feasible suggestions',()=>{
 const inv=inventory([sample('a',{durationMs:null,runs:0}),sample('b',{dependencies:['b']})]);const s=proposeSmoke(config(),reqs,inv,[cell('A','a','covered'),cell('B','b','covered')]);
 assert.equal(s.estimatedSerialMs,null);assert.equal(s.withinBudget,null);assert.equal(s.unknownDurationTests,1);assert.deepEqual(s.dependencyConflicts,['b']);
});
test('an uncollected setup project blocks dependent smoke candidates',()=>{
 const t=sample('a');t.dependencies=projectDependencies([t],['setup']);
 const result=proposeSmoke(config(),reqs.slice(0,1),inventory([t]),[cell('A','a','covered')]);
 assert.deepEqual(result.selected,[]);assert.deepEqual(result.dependencyConflicts,['a']);assert.deepEqual(result.missingRequirements,['A']);
});
test('history ignores stale source and retries do not erase first-attempt flakiness',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'history-'));
 try{const h={...inventory([sample('a',{results:[{status:'failed',expectedStatus:'passed',retry:0,durationMs:10},{status:'passed',expectedStatus:'passed',retry:1,durationMs:20}]}),sample('b',{evidence:{...sample('b').evidence,fingerprint:'old'},results:[{status:'passed',expectedStatus:'passed',retry:0,durationMs:1}]})]),mode:'run'};
 const file=path.join(dir,'h.json');await writeFile(file,JSON.stringify(h));const result=await applyHistory(inventory([sample('a',{runs:0,passRate:null,durationMs:null}),sample('b',{runs:0,passRate:null,durationMs:null})]),[file,file]);
 assert.equal(result.tests[0].runs,1);assert.equal(result.tests[0].passRate,0);assert.equal(result.tests[0].durationMs,30);assert.equal(result.tests[1].runs,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('end-to-end evaluation exports only aggregates, keeps errors, escapes reports, and rejects extra public data',async()=>{
 let n=0;const report=await evaluate(config(),reqs,inventory(),{metadata:{model:'qwen'},close(){},async ask(){n++;if(n===2)throw Error('secret provider failure');return {label:n===1?'covered':'uncovered',probabilities:null,confidence:null,costUsd:null,inputTokens:20,outputTokens:10,model:'qwen'};}});
 const metrics=publicMetrics(report);assert.equal(metrics.counts.errors,1);assert.equal(metrics.counts.pairs,4);assert.equal(metrics.quality.accuracy,null);assert.ok(!JSON.stringify(metrics).includes('criterion'));assert.ok(!JSON.stringify(metrics).includes('secret'));
 assert.throws(()=>validateTeamMetrics({...metrics,requirements:reqs}));const injected=structuredClone(metrics);injected.smoke.approved=true;assert.throws(()=>validateTeamMetrics(injected));const inflated=structuredClone(metrics);inflated.counts.valid++;assert.throws(()=>validateTeamMetrics(inflated));
 report.requirements[0].criterion='<script>bad</script>';assert.ok(!renderTeamReport(report).includes('<script>bad</script>'));
 const dir=await mkdtemp(path.join(os.tmpdir(),'team-report-'));try{await saveReport(dir,report);assert.ok((await readFile(path.join(dir,'coverage.csv'),'utf8')).includes('Review required'));assert.equal(validateTeamMetrics(JSON.parse(await readFile(path.join(dir,'metrics.json'),'utf8'))).counts.pairs,4);}finally{await rm(dir,{recursive:true,force:true});}
});
test('call cap refuses the whole run before inference and missing helpers override raw positives',async()=>{
 let calls=0;const provider={metadata:{},close(){},async ask(){calls++;return {label:'covered',probabilities:null,confidence:null,costUsd:null,inputTokens:null,outputTokens:null,model:'qwen'};}};
 const c=config();c.maxPairs=1;await assert.rejects(evaluate(c,reqs,inventory(),provider),/pairs/);assert.equal(calls,0);
 const report=await evaluate(config(),reqs.slice(0,1),inventory([sample('a',{evidence:{...sample('a').evidence,issues:['missing_helper']}})]),provider);assert.equal(report.cells[0].answer?.label,'covered');assert.equal(report.coverage[0].label,'needs_judgment');
});
test('three consecutive provider failures stop inference without losing unassessed pairs',async()=>{
 let calls=0;const report=await evaluate(config(),reqs,inventory([sample('a'),sample('b'),sample('c')]),{metadata:{},close(){},async ask(){calls++;throw Error('offline');}});
 assert.equal(calls,3);const m=publicMetrics(report);assert.equal(m.counts.pairs,6);assert.equal(m.counts.errors,3);assert.equal(m.counts.notRun,3);
 assert.ok(report.coverage.every(r=>r.label==='needs_judgment'));
});
