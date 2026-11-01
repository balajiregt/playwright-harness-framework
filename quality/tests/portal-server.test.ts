import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT} from '../src/context.js';
import {get as httpGet} from 'node:http';
import {startPortal} from '../src/portal/server.js';
import {recordAgentAnalysis} from '../src/portal/analysis.js';

const bundled=path.join(ROOT,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const python=existsSync(bundled)?bundled:process.platform==='win32'?'python':'python3';
const required={version:1,requirements:[{id:'LOGIN-1',criterion:'Invalid passwords keep the user on the login page.',journey:'login',critical:true}]};
async function app(t:{after:(f:()=>Promise<void>)=>void},options:{allowRun?:boolean;setup?:(repo:string)=>Promise<string>}={}){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'portal project with spaces-'))),repo=path.join(root,'project');await mkdir(repo);
 const executionConfig=await options.setup?.(repo);
 const portal=await startPortal({repo,port:0,python,allowRun:options.allowRun,executionConfig});
 t.after(async()=>{await portal.close();await rm(root,{recursive:true,force:true});});
 const session=await (await fetch(portal.origin+'/api/session')).json() as {token:string};
 async function request(url:string,body?:unknown,extra:Record<string,string>={}){
  return fetch(portal.origin+url,body===undefined?{headers:extra}:{method:'POST',headers:{'X-Portal-Token':session.token,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...extra},body:body instanceof FormData?body:JSON.stringify(body)});
 }
 return {...portal,root,request};
}
function documents(task='LOGIN-123',extraImage=false){
 const form=new FormData();form.set('taskId',task);form.set('goal','assess');
 form.append('files',new File([JSON.stringify(required)],'tickets.json',{type:'application/json'}));
 if(extraImage)form.append('files',new File(['synthetic image'],'flow.png',{type:'image/png'}));
 return form;
}
async function create(a:Awaited<ReturnType<typeof app>>,task='LOGIN-123'){
 const response=await a.request('/api/tasks',documents(task));assert.equal(response.status,201);
 const created=await response.json() as {taskId:string;runId:string};
 const detail=await (await a.request('/api/tasks/'+task)).json();return {created,detail};
}

test('loopback workbench refuses cross-origin writes, missing tokens and foreign Hosts',async t=>{
 const a=await app(t);
 const session=await fetch(a.origin+'/api/session');assert.equal(session.headers.get('access-control-allow-origin'),null);assert.match(session.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
 assert.equal((await fetch(a.origin+'/api/tasks',{method:'POST',body:documents()})).status,403);
 assert.equal((await a.request('/api/tasks',documents(),{Origin:'https://outside.invalid'})).status,403);
 const foreignHost=await new Promise<number>((resolve,reject)=>{httpGet(a.origin+'/api/tasks',{headers:{Host:'outside.invalid'}},res=>{res.resume();resolve(res.statusCode!);}).on('error',reject);});
 assert.equal(foreignHost,403);
 assert.deepEqual(await (await a.request('/api/tasks')).json(),{tasks:[]});
 assert.equal((await a.request('/api/session',undefined,{Origin:'null'})).status,403);
});

test('execution is disabled by default and arbitrary browser commands are refused',async t=>{
 const a=await app(t),{created,detail}=await create(a);
 const capabilities=await (await a.request('/api/execution')).json();assert.equal(capabilities.enabled,false);assert.equal(capabilities.actions.length,2);assert.ok(capabilities.actions.every((action:{available:boolean})=>!action.available));
 assert.equal((await a.request('/api/execution',undefined,{Origin:'https://outside.invalid'})).status,403);
 const body={kind:'playwright',runId:created.runId,intakeHash:detail.run.intakeHash,draftHash:detail.run.draftHash,actionHash:'0'.repeat(64),confirmRun:true};
 assert.equal((await fetch(a.origin+'/api/tasks/LOGIN-123/executions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
 assert.equal((await a.request('/api/tasks/LOGIN-123/executions',{...body,command:'unregistered command'})).status,400);
 assert.equal((await a.request('/api/tasks/LOGIN-123/executions',body)).status,400);
 assert.deepEqual(await (await a.request('/api/tasks/LOGIN-123/executions')).json(),{jobs:[]});
});

test('execution HTTP routes attach a fresh failing report from an explicitly labelled child-runner stub',async t=>{
 const a=await app(t,{allowRun:true,setup:async repo=>{
  const pkg=path.join(repo,'node_modules/@playwright/test');await mkdir(pkg,{recursive:true});
  await writeFile(path.join(pkg,'package.json'),JSON.stringify({name:'@playwright/test',exports:{'./cli':'./cli.cjs'}}));
  const report={stats:{expected:0,unexpected:1,skipped:0,flaky:0,startTime:new Date().toISOString(),duration:1},errors:[],suites:[{specs:[{title:'synthetic HTTP adapter stub assertion',tests:[{projectName:'stub',expectedStatus:'passed',status:'unexpected',results:[{status:'failed',duration:1,retry:0,errors:[{message:'Synthetic stub assertion failed'}]}]}]}]}]};
  await writeFile(path.join(pkg,'cli.cjs'),`require('node:fs').writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE,${JSON.stringify(JSON.stringify(report))}); console.log('Synthetic child-runner stub; no browser execution'); process.exitCode=1;`);
  await writeFile(path.join(repo,'playwright.config.ts'),'export default {};\n');
  const config=path.join(repo,'portal-run.json');await writeFile(config,JSON.stringify({version:1,playwright:{config:'playwright.config.ts'}}));return config;
 }});
 const {created,detail}=await create(a),caps=await (await a.request('/api/execution')).json(),action=caps.actions.find((entry:{kind:string})=>entry.kind==='playwright');assert.equal(action.available,true);
 const body={kind:'playwright',runId:created.runId,intakeHash:detail.run.intakeHash,draftHash:detail.run.draftHash,actionHash:action.actionHash,confirmRun:true};
 assert.equal((await a.request('/api/tasks/LOGIN-123/executions',{...body,actionHash:'0'.repeat(64)})).status,400);
 const response=await a.request('/api/tasks/LOGIN-123/executions',body);assert.equal(response.status,202);let job=await response.json();
 const deadline=Date.now()+8000;
 while(job.status==='running'&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,20));job=await (await a.request('/api/tasks/LOGIN-123/executions/'+job.id)).json();}
 assert.equal(job.status,'failed');assert.equal(job.exitCode,1);assert.ok(job.reportId);assert.match(job.logTail,/no browser execution/);
 const current=await (await a.request('/api/tasks/LOGIN-123')).json();assert.equal(current.reports.tests.length,1);assert.equal(current.reports.tests[0].counts.unexpected,1);assert.equal(current.run.accepted,false);
 const history=await (await a.request('/api/tasks/LOGIN-123/executions')).json();assert.equal(history.jobs[0].id,job.id);
 assert.equal((await a.request('/api/tasks/LOGIN-123/executions/'+job.id+'/cancel',{confirmCancel:true,signal:'arbitrary'})).status,400);
 assert.equal((await a.request('/api/tasks/OTHER-123/executions/'+job.id)).status,400);
});

test('task responses expose host-agent findings and flag them stale after draft changes',async t=>{
 const a=await app(t),{created,detail}=await create(a),file=path.join(a.root,'analysis.md');await writeFile(file,'# Source review\n\nThe credential-error assertion is missing. Runtime not run.');
 const run=path.join(a.repo,'artifacts/agent-tasks/LOGIN-123/intake',created.runId);await recordAgentAnalysis({run,file});
 const current=await (await a.request('/api/tasks/LOGIN-123')).json();assert.match(current.run.analysis.text,/assertion is missing/);assert.equal(current.run.analysis.stale,false);assert.equal(current.run.accepted,false);
 const draft=structuredClone(detail.run.draft);draft.requirements[0].criterion='Invalid passwords retain the login page and visible error.';
 assert.equal((await a.request('/api/tasks/LOGIN-123/draft',{runId:created.runId,draft})).status,200);
 const changed=await (await a.request('/api/tasks/LOGIN-123')).json();assert.equal(changed.run.analysis.stale,true);assert.equal(changed.run.accepted,false);
});

test('upload, source download, exact review and interpretation confirmation share the existing intake pipeline',async t=>{
 const a=await app(t),{created,detail}=await create(a),run=detail.run;
 assert.equal(run.draft.requirements.length,1);assert.equal(run.reviewed,false);assert.equal(run.accepted,false);
 const list=await (await a.request('/api/tasks')).json() as {tasks:{id:string}[]};assert.equal(list.tasks[0].id,'LOGIN-123');
 const source=await a.request(`/api/tasks/LOGIN-123/runs/${created.runId}/documents/${run.documents[0].id}`);
 assert.equal(source.headers.get('content-type'),'application/octet-stream');assert.match(source.headers.get('content-disposition')!,/attachment/);assert.deepEqual(JSON.parse(await source.text()),required);
 const saved=await a.request('/api/tasks/LOGIN-123/draft',{runId:created.runId,draft:run.draft});assert.equal(saved.status,200);
 const reviewed=await saved.json();assert.equal(reviewed.run.reviewed,true);
 const refused=await a.request('/api/tasks/LOGIN-123/accept',{runId:created.runId,reviewHash:'0'.repeat(64),reviewedBy:'Synthetic tester',confirmReviewed:true});assert.equal(refused.status,409);
 const accepted=await a.request('/api/tasks/LOGIN-123/accept',{runId:created.runId,reviewHash:reviewed.run.draftHash,reviewedBy:'Synthetic tester',confirmReviewed:true});assert.equal(accepted.status,200);assert.equal((await accepted.json()).run.accepted,true);
 const destination=path.join(a.repo,'contexts/tasks/LOGIN-123/requirements.json');assert.deepEqual(JSON.parse(await readFile(destination,'utf8')),required);
 const edit=await a.request('/api/tasks/LOGIN-123/draft',{runId:created.runId,draft:run.draft});assert.equal(edit.status,400);
});

test('stale source evidence is visible and reimport preserves source names and creates a new version',async t=>{
 const a=await app(t),{created,detail}=await create(a),source=detail.run.documents[0];
 const file=path.join(a.repo,'contexts/tasks/LOGIN-123',source.file),changed=structuredClone(required);changed.requirements[0].criterion='Invalid passwords display a credential error.';await writeFile(file,JSON.stringify(changed));
 const stale=await (await a.request('/api/tasks/LOGIN-123')).json();assert.match(stale.run.stale,/changed or are unavailable/);
 const download=await a.request(`/api/tasks/LOGIN-123/runs/${created.runId}/documents/${source.id}`);assert.equal(download.status,400);
 const reimport=await a.request('/api/tasks/LOGIN-123/reimport',{runId:created.runId,mappings:{sources:{'tickets.json':{fields:{criterion:'criterion'}}}}});assert.equal(reimport.status,200);
 const current=await reimport.json();assert.notEqual(current.run.id,created.runId);assert.equal(current.run.documents[0].name,'tickets.json');assert.equal(current.run.documents[0].file,source.file);assert.equal(current.run.stale,undefined);assert.equal(current.run.draft.requirements[0].criterion,changed.requirements[0].criterion);
});

test('criteria saves validate source quotes, preserve clarifications and cannot clear unreadable document blockers',async t=>{
 const a=await app(t),response=await a.request('/api/tasks',documents('IMAGE-123',true));assert.equal(response.status,201);
 const detail=await (await a.request('/api/tasks/IMAGE-123')).json(),draft=detail.run.draft;
 const invalid=structuredClone(draft);invalid.requirements[0].sources[0].quote='A quote that does not exist in any selected source';
 assert.equal((await a.request('/api/tasks/IMAGE-123/draft',{runId:detail.run.id,draft:invalid})).status,400);
 const deleted=structuredClone(draft);deleted.questions=[];
 assert.equal((await a.request('/api/tasks/IMAGE-123/draft',{runId:detail.run.id,draft:deleted})).status,400);
 for(const q of draft.questions)q.resolution='A note cannot supply missing image text.';
 const reviewed=await (await a.request('/api/tasks/IMAGE-123/draft',{runId:detail.run.id,draft})).json();
 const accepted=await a.request('/api/tasks/IMAGE-123/accept',{runId:detail.run.id,reviewHash:reviewed.run.draftHash,reviewedBy:'Synthetic tester',confirmReviewed:true});assert.equal(accepted.status,400);
});

test('traceability views read the registered CSV, and traversal or linked evidence is refused',async t=>{
 const a=await app(t),{created}=await create(a),relative=`artifacts/agent-tasks/LOGIN-123/intake/${created.runId}`;
 const file=path.join(a.repo,relative,'matrix.csv'),original=await readFile(file,'utf8');await writeFile(file,original.replace('"unknown","not run"','"partial","not run"'));
 const detail=await (await a.request('/api/tasks/LOGIN-123')).json();assert.equal(detail.run.matrix[0].Assessment,'partial');
 const download=await a.request(`/api/tasks/LOGIN-123/runs/${created.runId}/matrix.csv`);assert.equal(download.status,200);assert.match(await download.text(),/"partial","not run"/);
 assert.equal((await a.request('/api/tasks/LOGIN%2f..%2fprivate')).status,400);
 assert.equal((await a.request(`/api/tasks/LOGIN-123/runs/${created.runId}/documents/not-registered`)).status,400);
 await rm(file);const outside=path.join(a.root,'outside.csv');await writeFile(outside,original);await symlink(outside,file);
 assert.equal((await a.request(`/api/tasks/LOGIN-123/runs/${created.runId}/matrix.csv`)).status,400);
 assert.equal((await a.request('/api/tasks/CRM-DEMO-001/draft',{runId:created.runId,draft:{}})).status,400);
});

test('recorded reports can be attached and downloaded without executing a test or trusting coverage',async t=>{
 const a=await app(t);await create(a);
 const report={stats:{expected:1,unexpected:0,skipped:0,flaky:0,startTime:'2026-11-01T00:00:00.000Z'},suites:[{specs:[{title:'Login rejects invalid credentials',tests:[{projectName:'chromium',expectedStatus:'passed',status:'expected',results:[{status:'passed',duration:12,retry:0,errors:[]}]}]}]}]};
 const form=new FormData();form.set('kind','playwright');const raw=JSON.stringify(report);form.set('file',new File([raw],'results.json',{type:'application/json'}));
 const response=await a.request('/api/tasks/LOGIN-123/reports',form);assert.equal(response.status,201);const detail=await response.json();
 assert.equal(detail.reports.tests[0].counts.expected,1);assert.match(detail.reports.tests[0].limitations.join(' '),/importing or viewing a report does not execute/);
 const downloaded=await a.request('/api/tasks/LOGIN-123/reports/'+detail.reports.tests[0].id);assert.equal(await downloaded.text(),raw);
 const bad=new FormData();bad.set('kind','playwright');bad.set('file',new File(['<script>bad</script>'],'report.html',{type:'text/html'}));
 assert.equal((await a.request('/api/tasks/LOGIN-123/reports',bad)).status,400);
 assert.equal((await a.request('/api/tasks/LOGIN-123/reports/not-a-registered-uuid')).status,400);
});
