import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {digest} from '../src/context.js';
import type {Campaign,Execution} from '../src/mutation/runner.js';
import type {MutationPlan} from '../src/mutation/schema.js';
import {attachReport,readReports,readReportFile} from '../src/portal/reports.js';

const recorded='2026-11-01T10:00:00.000Z',taskId='LOGIN-123';
const bytes=(value:unknown)=>Buffer.from(JSON.stringify(value,null,2));
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
 const temp=await realpath(await mkdtemp(path.join(os.tmpdir(),'portal reports with spaces-')));t.after(()=>rm(temp,{recursive:true,force:true}));
 const repo=path.join(temp,'project');await mkdir(repo);return {repo,temp,directory:path.join(repo,'artifacts/agent-tasks',taskId,'portal/reports')};
}
function playwright(){
 const attempt=(status:string,error?:string)=>({status,duration:12,retry:0,errors:error?[{message:error}]:[]});
 const tests=[
  {title:'passes',expectedStatus:'passed',status:'expected',results:[attempt('passed')]},
  {title:'declared expected failure',expectedStatus:'failed',status:'expected',results:[attempt('failed','Expected fixture failure')]},
  {title:'unexpected failure',expectedStatus:'passed',status:'unexpected',results:[attempt('failed','Assertion failed')]},
  {title:'retry succeeds',expectedStatus:'passed',status:'flaky',results:[attempt('failed'),{...attempt('passed'),retry:1}]},
  {title:'skipped',expectedStatus:'skipped',status:'skipped',results:[attempt('skipped')]}
 ];
 return {stats:{expected:2,unexpected:1,skipped:1,flaky:1,startTime:recorded,duration:100},errors:[],suites:[{title:'suite',specs:tests.map(({title,...t},index)=>({title,...(index===0?{file:'tests/receiving.spec.ts',line:17,column:3}:{}),tests:[{...t,projectName:'chromium'}]}))}]};
}
function campaign():Campaign {
 const plan:MutationPlan={version:1,contextHash:digest('context'),requirements:['R1','R2'].map(id=>({id,criterion:'A synthetic requirement '+id,critical:true,source:{artifactId:'epic',quote:'An authored fixture source quote.'}})),
  mutations:['M1','M2'].map((id,i)=>({id,requirementId:'R'+(i+1),description:'A controlled behavioral fault.',file:'app.js',before:'SECRET_SOURCE_SENTINEL',after:'changed value',probe:{project:'chromium',path:'/',testId:'value',kind:'text',expected:i?'good':'0',roles:[]}}))};
 const run=(failed=false):Execution=>({status:failed?'failed':'passed',errors:0,wallMs:10,tests:[0,1].map(i=>({id:'T'+i,title:'assertion '+i,file:'/private/source/test.spec.ts',line:i+1,project:'chromium',expectedStatus:'passed',results:[{status:failed&&i===0?'failed':'passed',retry:0,durationMs:5,assertionFailure:failed&&i===0,errors:[]}]}))});
 return {version:1,kind:'playwright-behavioral-mutations',runId:'recorded-campaign',createdAt:recorded,contextHash:plan.contextHash,repositoryHash:digest('repo'),planHash:digest(JSON.stringify(plan)),scopeHash:digest('scope'),plan,baseline:[run(),run()],restored:run(),originalUnchanged:true,wallMs:50,
  faults:[{id:'M1',requirementId:'R1',status:'killed',baselineProbe:'0',mutantProbe:'1',attempts:[run(true),run(true)],killingTests:['assertion 0']},{id:'M2',requirementId:'R2',status:'survived',baselineProbe:'good',mutantProbe:'bad',attempts:[run(),run()],killingTests:[]}]};
}

test('Playwright imports retain honest expected/flaky/skipped counts and exact downloadable JSON without implying coverage',async t=>{
 const f=await fixture(t),raw=bytes(playwright());
 const {id}=await attachReport({repo:f.repo,taskId,kind:'playwright',name:'../../original-results.json',bytes:raw});
 assert.match(id,/^[a-f0-9-]{36}$/);
 const reports=await readReports(f.repo,taskId);assert.equal(reports.tests.length,1);assert.equal(reports.mutations.length,0);
 const view=reports.tests[0];assert.equal(view.recordedAt,recorded);assert.equal(view.name,'../../original-results.json');
 assert.deepEqual(view.counts,{expected:2,unexpected:1,skipped:1,flaky:1,total:5});
 assert.equal(view.tests[1].status,'expected failure (failed)');assert.equal(view.tests[3].status,'flaky (final passed)');assert.equal(view.tests[3].durationMs,24);
 assert.deepEqual({file:view.tests[0].file,line:view.tests[0].line,column:view.tests[0].column},{file:'tests/receiving.spec.ts',line:17,column:3});
 assert.equal(view.tests[1].outcome,'expected');assert.equal(view.tests[1].expectedStatus,'failed');assert.equal(view.tests[1].file,undefined);
 assert.deepEqual(view.tests[3].attempts,[{status:'failed',retry:0,durationMs:12,errors:[],errorCount:0},{status:'passed',retry:1,durationMs:12,errors:[],errorCount:0}]);
 assert.deepEqual(view.tests[2].attempts[0].errors,['Assertion failed']);
 assert.equal(view.durationMs,100);assert.equal(view.reportErrorCount,0);assert.deepEqual(view.reportErrors,[]);
 assert.ok(view.limitations.some(v=>v.includes('not a passed-test count')));assert.ok(view.limitations.some(v=>v.includes('not inferred')));
 assert.deepEqual(await readReportFile(f.repo,taskId,id),{name:'../../original-results.json',bytes:raw});
 assert.deepEqual((await readdir(f.directory)).sort(),['.gitignore',id+'.json'].sort());
 assert.deepEqual(await readReports(f.repo,'OTHER-TASK'),{tests:[],mutations:[]});
 const other=path.join(f.temp,'other-project');await mkdir(other);assert.deepEqual(await readReports(other,taskId),{tests:[],mutations:[]});
});
test('malformed, oversized, contradictory and non-JSON Playwright uploads are rejected before storage',async t=>{
 const f=await fixture(t);
 const mismatched=playwright();mismatched.stats.expected++;
 const falseGreen=playwright();falseGreen.suites[0].specs[0].tests[0].results[0].status='failed';
 const noRetry=playwright();noRetry.suites[0].specs[3].tests[0].results=[noRetry.suites[0].specs[3].tests[0].results[1]];
 for(const data of [bytes(mismatched),bytes(falseGreen),bytes(noRetry),bytes({stats:{},suites:[]}),Buffer.from('<html>not JSON</html>'),Buffer.alloc(5*1024*1024+1)])
  await assert.rejects(attachReport({repo:f.repo,taskId,kind:'playwright',name:'results.json',bytes:data}));
 await assert.rejects(readdir(f.directory),{code:'ENOENT'});
});
test('an unexpected pass of an expected-failure test remains unexpected, not green passed evidence',async t=>{
 const f=await fixture(t),report=playwright(),test=report.suites[0].specs[2].tests[0];
 test.expectedStatus='failed';test.results[0].status='passed';
 await attachReport({repo:f.repo,taskId,kind:'playwright',name:'unexpected-pass.json',bytes:bytes(report)});
 const view=(await readReports(f.repo,taskId)).tests[0];assert.equal(view.counts.unexpected,1);assert.equal(view.tests[2].status,'unexpected (final passed)');
});
test('missing attempt metadata remains unavailable instead of inventing retry or execution duration',async t=>{
 const f=await fixture(t),report={stats:{expected:1,unexpected:0,skipped:1,flaky:0},suites:[{specs:[{title:'minimal recorded test',tests:[{expectedStatus:'passed',status:'expected',results:[{status:'passed'}]}]},{title:'no recorded attempts',tests:[{expectedStatus:'skipped',status:'skipped',results:[]}]}]}]};
 await attachReport({repo:f.repo,taskId,kind:'playwright',name:'minimal.json',bytes:bytes(report)});
 const view=(await readReports(f.repo,taskId)).tests[0];
 assert.equal(view.tests[0].durationMs,null);assert.equal(view.tests[0].file,undefined);assert.equal(view.tests[0].line,undefined);
 assert.equal(view.durationMs,null);assert.deepEqual(view.tests[0].attempts,[{status:'passed',retry:null,durationMs:null,errors:[],errorCount:0}]);
 assert.equal(view.tests[1].durationMs,null);assert.deepEqual(view.tests[1].attempts,[]);
});
test('bounded failure excerpts retain full error counts and do not hide runner errors behind expected test totals',async t=>{
 const f=await fixture(t),report={...playwright(),errors:Array.from({length:7},(_,i)=>({message:'Runner failure '+i+'\u0000'+('x'.repeat(1200))}))};
 const errors=Array.from({length:8},(_,i)=>({message:'Assertion detail '+i}));report.suites[0].specs[2].tests[0].results[0].errors=errors;
 await attachReport({repo:f.repo,taskId,kind:'playwright',name:'runner-errors.json',bytes:bytes(report)});
 const view=(await readReports(f.repo,taskId)).tests[0];
 assert.equal(view.reportErrorCount,7);assert.equal(view.reportErrors.length,5);assert.equal(view.reportErrors[0].length,1000);assert.ok(!view.reportErrors[0].includes('\u0000'));
 assert.equal(view.tests[2].errorCount,8);assert.equal(view.tests[2].errors.length,5);assert.equal(view.tests[2].attempts[0].errorCount,8);assert.equal(view.tests[2].attempts[0].errors.length,5);
 assert.deepEqual(view.counts,{expected:2,unexpected:1,skipped:1,flaky:1,total:5});assert.ok(view.limitations.some(note=>note.includes('7 top-level errors')));
});
test('conclusive mutation imports require actual activation and consistent repeated assertion evidence',async t=>{
 const f=await fixture(t),c=campaign();const {id}=await attachReport({repo:f.repo,taskId,kind:'mutation',name:'campaign.json',bytes:bytes(c)});
 const view=(await readReports(f.repo,taskId)).mutations[0];
 assert.deepEqual(view.counts,{requested:2,killed:1,survived:1,notActivated:0,invalid:0,inconclusive:0,notRun:0});
 assert.equal(view.originalUnchanged,true);assert.equal(view.baselines.length,2);assert.equal(view.restored,'passed');assert.equal(view.recordedAt,recorded);
 assert.deepEqual(view.baselines[0],{status:'passed',errors:0,tests:2,passed:2,failed:0,skipped:0,other:0,assertionFailures:0,durationMs:10});
 assert.deepEqual(view.restoration,view.baselines[0]);
 assert.equal(view.faults[0].criterion,'A synthetic requirement R1');assert.equal(view.faults[0].description,'A controlled behavioral fault.');
 assert.equal(view.faults[0].killingTestCount,1);
 assert.deepEqual(view.faults[0].attempts[0],{status:'failed',errors:0,tests:2,passed:1,failed:1,skipped:0,other:0,assertionFailures:1,durationMs:10});
 assert.ok(!JSON.stringify(view).includes('SECRET_SOURCE_SENTINEL'));assert.ok(!JSON.stringify(view).includes('/private/source/'));
 assert.equal(JSON.parse((await readReportFile(f.repo,taskId,id)).bytes.toString()).plan.mutations[0].before,'SECRET_SOURCE_SENTINEL');
 const changes=[(v:Campaign)=>{v.faults[0].mutantProbe='0';},(v:Campaign)=>{v.faults[0].attempts[1]=structuredClone(v.baseline[0]);},(v:Campaign)=>{v.faults[0].killingTests=['not observed'];},(v:Campaign)=>{v.originalUnchanged=false;},(v:Campaign)=>{v.baseline.pop();},(v:Campaign)=>{v.planHash=digest('other');},(v:Campaign)=>{v.faults[0].id='UNPLANNED';}];
 for(const change of changes){const forged=campaign();change(forged);await assert.rejects(attachReport({repo:f.repo,taskId,kind:'mutation',name:'forged.json',bytes:bytes(forged)}));}
});
test('partial mutation campaigns retain unknown/not-run outcomes without inventing restored green',async t=>{
 const f=await fixture(t),c=campaign();c.baseline=[{status:'runner_error',errors:1,tests:[],wallMs:5}];c.restored=null;c.originalUnchanged=false;
 c.faults[0]={id:'M1',requirementId:'R1',status:'inconclusive',reason:'Startup failed',attempts:[],killingTests:[]};
 c.faults[1]={id:'M2',requirementId:'R2',status:'not_run',attempts:[],killingTests:[]};
 await attachReport({repo:f.repo,taskId,kind:'mutation',name:'partial.json',bytes:bytes(c)});
 const view=(await readReports(f.repo,taskId)).mutations[0];assert.equal(view.counts.inconclusive,1);assert.equal(view.counts.notRun,1);assert.equal(view.counts.killed,0);assert.equal(view.restored,null);assert.equal(view.originalUnchanged,false);
 assert.equal(view.restoration,null);assert.deepEqual(view.faults[1].attempts,[]);
});
test('mutation execution summaries keep timeout, interrupted and missing results outside passed/failed/skipped counts',async t=>{
 const f=await fixture(t),c=campaign(),passed=structuredClone(c.baseline[0].tests[0]);
 const recorded=(status:string,assertionFailure=false)=>({...structuredClone(passed),results:[{...passed.results[0],status,assertionFailure}]});
 c.faults[0].status='inconclusive';c.faults[0].killingTests=[];
 c.faults[0].attempts=[{status:'runner_error',errors:1,wallMs:43,tests:[passed,recorded('failed',true),recorded('skipped'),recorded('timedOut'),recorded('interrupted'),{...structuredClone(passed),results:[]}]}];
 await attachReport({repo:f.repo,taskId,kind:'mutation',name:'incomplete-attempts.json',bytes:bytes(c)});
 const view=(await readReports(f.repo,taskId)).mutations[0];
 assert.equal(view.faults[0].status,'inconclusive');
 assert.deepEqual(view.faults[0].attempts,[{status:'runner_error',errors:1,tests:6,passed:1,failed:1,skipped:1,other:3,assertionFailures:1,durationMs:43}]);
});
test('imported mutation campaigns cannot call an all-skipped suite conclusive evidence',async t=>{
 const f=await fixture(t),c=campaign();
 const skip=(run:Execution)=>{run.status='passed';for(const test of run.tests){test.expectedStatus='skipped';for(const result of test.results){result.status='skipped';result.assertionFailure=false;}}};
 for(const run of [...c.baseline,c.restored!,...c.faults.flatMap(f=>f.attempts)])skip(run);
 for(const fault of c.faults){fault.status='survived';fault.killingTests=[];}
 await assert.rejects(attachReport({repo:f.repo,taskId,kind:'mutation',name:'all-skipped.json',bytes:bytes(c)}),/healthy baselines/);
 await assert.rejects(readdir(f.directory),{code:'ENOENT'});
});
test('fixed report identities, private markers and guarded parents reject traversal and outside symlinks',async t=>{
 const f=await fixture(t),raw=bytes(playwright());
 await assert.rejects(attachReport({repo:f.repo,taskId:'../outside',kind:'playwright',name:'results.json',bytes:raw}),/task ID/);
 await assert.rejects(readReportFile(f.repo,taskId,'../../outside.json'),/report ID/);
 const outside=path.join(f.temp,'outside');await mkdir(outside);await symlink(outside,path.join(f.repo,'artifacts'),'dir');
 await assert.rejects(attachReport({repo:f.repo,taskId,kind:'playwright',name:'results.json',bytes:raw}),/real directories/);assert.deepEqual(await readdir(outside),[]);
 await rm(path.join(f.repo,'artifacts'));
 execFileSync('git',['init','--quiet'],{cwd:f.repo});
 const ignored='/artifacts/agent-tasks/LOGIN-123/portal/reports/\n!/artifacts/agent-tasks/LOGIN-123/portal/reports/\n';await writeFile(path.join(f.repo,'.gitignore'),ignored);
 const {id}=await attachReport({repo:f.repo,taskId,kind:'playwright',name:'results.json',bytes:raw});
 for(const name of [id+'.json','.gitignore'])execFileSync('git',['check-ignore','--no-index','-q',path.join(f.directory,name)],{cwd:f.repo});
 assert.equal(await readFile(path.join(f.repo,'.gitignore'),'utf8'),ignored);
 await assert.rejects(readReportFile(f.repo,'OTHER-TASK',id));
});
test('corrupted or linked selected reports fail clearly and unrelated nested files are never loaded',async t=>{
 const f=await fixture(t),raw=bytes(playwright()),{id}=await attachReport({repo:f.repo,taskId,kind:'playwright',name:'results.json',bytes:raw});
 await writeFile(path.join(f.directory,'unrelated-private.json'),'not a report');await mkdir(path.join(f.directory,'nested-private'));
 assert.equal((await readReports(f.repo,taskId)).tests.length,1);
 const file=path.join(f.directory,id+'.json'),original=await readFile(file);
 const envelope=JSON.parse(original.toString());envelope.base64=Buffer.from('{}').toString('base64');await writeFile(file,JSON.stringify(envelope));
 await assert.rejects(readReports(f.repo,taskId),/bytes changed/);
 const metadata=JSON.parse(original.toString());metadata.name='unsafe\r\nname.json';await writeFile(file,JSON.stringify(metadata));await assert.rejects(readReportFile(f.repo,taskId,id),/corrupt or unsafe/);
 await writeFile(file,original);await rm(file);const outside=path.join(f.temp,'outside-report.json');await writeFile(outside,original);await symlink(outside,file);
 await assert.rejects(readReportFile(f.repo,taskId,id),/corrupt or unsafe/);await assert.rejects(readReports(f.repo,taskId),/corrupt or unsafe/);
});
