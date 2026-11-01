import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,realpath,readdir,readlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {ROOT} from '../src/context.js';
import {get as httpGet} from 'node:http';
import {startPortal} from '../src/portal/server.js';
import {recordAgentAnalysis} from '../src/portal/analysis.js';
import {prepareIntake,saveIntakeDraft,acceptIntake} from '../src/intake/store.js';
import {attachReport} from '../src/portal/reports.js';

const bundled=path.join(ROOT,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const python=existsSync(bundled)?bundled:process.platform==='win32'?'python':'python3';
const required={version:1,requirements:[{id:'LOGIN-1',criterion:'Invalid passwords keep the user on the login page.',journey:'login',critical:true}]};
const report={stats:{expected:1,unexpected:0,skipped:0,flaky:0,startTime:'2026-11-01T00:00:00.000Z'},suites:[{specs:[{title:'Login rejects invalid credentials',tests:[{projectName:'chromium',expectedStatus:'passed',status:'expected',results:[{status:'passed',duration:12,retry:0,errors:[]}]}]}]}]};
async function app(t:{after:(f:()=>Promise<void>)=>void},seed?:(repo:string,root:string)=>Promise<void>){
 const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'portal project with spaces-'))),repo=path.join(root,'project');await mkdir(repo);
 await seed?.(repo,root);
 const portal=await startPortal({repo,port:0});
 t.after(async()=>{await portal.close();await rm(root,{recursive:true,force:true});});
 const request=(url:string,options:RequestInit={})=>fetch(portal.origin+url,options);
 return {...portal,root,request};
}
async function create(a:Awaited<ReturnType<typeof app>>,task='LOGIN-123'){
 const file=path.join(a.root,'tickets.json');await writeFile(file,JSON.stringify(required));
 const prepared=await prepareIntake({repo:a.repo,task,goal:'assess',files:[file],python});
 const detail=await (await a.request('/api/tasks/'+task)).json();
 return {run:prepared.run,created:{taskId:task,runId:path.basename(prepared.run)},detail};
}
async function snapshot(root:string){
 const result:Record<string,string>={};
 async function walk(dir:string){
  for(const entry of await readdir(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name),relative=path.relative(root,file);
   if(entry.isSymbolicLink())result[relative]='link:'+await readlink(file);
   else if(entry.isDirectory()){result[relative]='/';await walk(file);}
   else result[relative]=createHash('sha256').update(await readFile(file)).digest('hex');
  }
 }
 await walk(root);return result;
}

test('loopback viewer exposes no write token and refuses foreign Hosts and Origins',async t=>{
 const a=await app(t),response=await a.request('/api/session'),session=await response.json();
 assert.deepEqual(session,{project:{name:'project',root:a.repo}});
 assert.equal(response.headers.get('access-control-allow-origin'),null);
 assert.match(response.headers.get('content-security-policy')!,/form-action 'none'/);
 assert.match(response.headers.get('content-security-policy')!,/frame-ancestors 'none'/);
 const foreignHost=await new Promise<number>((resolve,reject)=>{httpGet(a.origin+'/api/tasks',{headers:{Host:'outside.invalid'}},res=>{res.resume();resolve(res.statusCode!);}).on('error',reject);});
 assert.equal(foreignHost,403);
 assert.equal((await a.request('/api/session',{headers:{Origin:'null'}})).status,403);
 assert.equal((await a.request('/api/tasks',{headers:{Origin:'https://outside.invalid'}})).status,403);
 assert.deepEqual(await (await a.request('/api/tasks')).json(),{tasks:[]});
 assert.equal((await a.request('/')).status,200);
 assert.equal((await a.request('/unknown-page')).status,404);
});

test('all former write routes and execution endpoints are unavailable without changing project files',async t=>{
 const a=await app(t);await create(a);const before=await snapshot(a.repo);
 for(const suffix of ['','/draft','/accept','/reimport','/reports','/executions','/executions/00000000-0000-4000-8000-000000000000/cancel']){
  const response=await a.request('/api/tasks'+(suffix===''?'':'/LOGIN-123'+suffix),{method:'POST',headers:{'Content-Type':'application/json','X-Portal-Token':'0'.repeat(64)},body:JSON.stringify({confirmRun:true,confirmReviewed:true,command:'unregistered command'})});
  assert.equal(response.status,405,suffix);assert.equal(response.headers.get('allow'),'GET');assert.match((await response.json()).error,/read-only/);
 }
 for(const method of ['PUT','PATCH','DELETE','HEAD'])assert.equal((await a.request('/api/tasks',{method})).status,405,method);
 for(const route of ['/api/execution','/api/tasks/LOGIN-123/executions'])assert.equal((await a.request(route)).status,404,route);
 assert.deepEqual(await snapshot(a.repo),before);
});

test('viewer launch and reads preserve historical running receipts and every existing artifact',async t=>{
 const marker='Historical process receipt; the viewer must never reconcile or resume it.';
 const a=await app(t,async(repo)=>{
  const dir=path.join(repo,'artifacts/agent-tasks/OLD-TASK/portal/executions/old-job');await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'job.json'),JSON.stringify({status:'running',note:marker}));
  await writeFile(path.join(repo,'artifacts/agent-tasks/.portal-execution-lock.json'),JSON.stringify({pid:-1,note:marker}));
 });
 const before=await snapshot(a.repo);
 await a.request('/api/session');await a.request('/api/tasks');await a.request('/api/tasks/OLD-TASK');await a.request('/app.js');
 assert.deepEqual(await snapshot(a.repo),before);
});

test('saved host-agent findings remain proposals and become stale after native draft changes',async t=>{
 const a=await app(t),{run,detail}=await create(a),file=path.join(a.root,'analysis.md');
 await writeFile(file,'# Source review\n\nThe credential-error assertion is missing. Runtime not run.');
 await recordAgentAnalysis({run,file});
 const current=await (await a.request('/api/tasks/LOGIN-123')).json();
 assert.match(current.run.analysis.text,/assertion is missing/);assert.equal(current.run.analysis.stale,false);assert.equal(current.run.accepted,false);
 const draft=structuredClone(detail.run.draft);draft.requirements[0].criterion='Invalid passwords retain the login page and visible error.';
 await saveIntakeDraft({run,draft});
 const changed=await (await a.request('/api/tasks/LOGIN-123')).json();assert.equal(changed.run.analysis.stale,true);assert.equal(changed.run.accepted,false);
});

test('native intake and explicitly reviewed criteria are displayed with unchanged source downloads',async t=>{
 const a=await app(t),{run,created,detail}=await create(a);
 const reviewed=await saveIntakeDraft({run,draft:detail.run.draft});
 await acceptIntake({run,reviewedBy:'Synthetic fixture reviewer',confirmReviewed:true,expectedDraftHash:reviewed.draftHash});
 const before=await snapshot(a.repo),current=await (await a.request('/api/tasks/LOGIN-123')).json();
 assert.equal(current.run.reviewed,true);assert.equal(current.run.accepted,true);assert.equal(current.run.draft.requirements.length,1);
 assert.equal('brief' in current.run,false);
 const list=await (await a.request('/api/tasks')).json();assert.equal(list.tasks[0].id,'LOGIN-123');assert.equal(list.tasks[0].status,'Interpretation accepted');
 const source=await a.request('/api/tasks/LOGIN-123/runs/'+created.runId+'/documents/'+current.run.documents[0].id);
 assert.equal(source.headers.get('content-type'),'application/octet-stream');assert.match(source.headers.get('content-disposition')!,/attachment/);
 assert.deepEqual(JSON.parse(await source.text()),required);
 assert.deepEqual(await snapshot(a.repo),before);
});

test('changed source evidence is marked stale and its original download is refused',async t=>{
 const a=await app(t),{created,detail}=await create(a),source=detail.run.documents[0];
 await writeFile(path.join(a.repo,'contexts/tasks/LOGIN-123',source.file),'changed source');
 const stale=await (await a.request('/api/tasks/LOGIN-123')).json();assert.match(stale.run.stale,/changed or are unavailable/);
 assert.equal((await a.request('/api/tasks/LOGIN-123/runs/'+created.runId+'/documents/'+source.id)).status,400);
});

test('traceability CSV and path guards preserve recorded assessments without inferring runtime',async t=>{
 const a=await app(t),{run,created}=await create(a),file=path.join(run,'matrix.csv'),original=await readFile(file,'utf8');
 await writeFile(file,original.replace('"unknown","not run"','"partial","not run"'));
 const detail=await (await a.request('/api/tasks/LOGIN-123')).json();assert.equal(detail.run.matrix[0].Assessment,'partial');assert.equal(detail.run.matrix[0].Runtime,'not run');
 const download=await a.request('/api/tasks/LOGIN-123/runs/'+created.runId+'/matrix.csv');
 assert.equal(download.status,200);assert.match(await download.text(),/"partial","not run"/);
 assert.equal((await a.request('/api/tasks/LOGIN%2f..%2fprivate')).status,400);
 assert.equal((await a.request('/api/tasks/LOGIN-123/runs/'+created.runId+'/documents/not-registered')).status,400);
 await rm(file);const outside=path.join(a.root,'outside.csv');await writeFile(outside,original);await symlink(outside,file);
 assert.equal((await a.request('/api/tasks/LOGIN-123/runs/'+created.runId+'/matrix.csv')).status,400);
});

test('native report attachments can be inspected and downloaded without executing or inferring coverage',async t=>{
 const a=await app(t);await create(a);const raw=JSON.stringify(report);
 const attached=await attachReport({repo:a.repo,taskId:'LOGIN-123',kind:'playwright',name:'results.json',bytes:Buffer.from(raw)});
 const before=await snapshot(a.repo),detail=await (await a.request('/api/tasks/LOGIN-123')).json();
 assert.equal(detail.reports.tests[0].counts.expected,1);assert.equal(detail.run.matrix[0].Assessment,'unknown');
 assert.match(detail.reports.tests[0].limitations.join(' '),/importing or viewing a report does not execute/);
 const downloaded=await a.request('/api/tasks/LOGIN-123/reports/'+attached.id);assert.equal(await downloaded.text(),raw);
 assert.equal((await a.request('/api/tasks/LOGIN-123/reports/not-a-registered-uuid')).status,400);
 assert.deepEqual(await snapshot(a.repo),before);
});

test('report-only tasks and unavailable intake metadata retain honest distinct states',async t=>{
 const a=await app(t);
 await attachReport({repo:a.repo,taskId:'REPORT-ONLY',kind:'playwright',name:'results.json',bytes:Buffer.from(JSON.stringify(report))});
 const only=await (await a.request('/api/tasks/REPORT-ONLY')).json();assert.equal(only.run,null);assert.equal(only.reports.tests.length,1);
 const {run}=await create(a,'BROKEN-INTAKE');await writeFile(path.join(run,'intake.json'),'{invalid saved JSON');
 const tasks=await (await a.request('/api/tasks')).json();
 assert.equal(tasks.tasks.find((entry:{id:string})=>entry.id==='REPORT-ONLY').status,'Reports only');
 assert.equal(tasks.tasks.find((entry:{id:string})=>entry.id==='BROKEN-INTAKE').status,'Evidence unavailable');
 const broken=await a.request('/api/tasks/BROKEN-INTAKE');assert.equal(broken.status,400);assert.match((await broken.json()).error,/Invalid saved JSON/);
});
