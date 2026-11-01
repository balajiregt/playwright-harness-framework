import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createExecutionManager,type ExecutionStart,type ExecutionJob} from '../src/portal/execution.js';
import {prepareIntake,inspectIntake} from '../src/intake/store.js';
import {loadConfig} from '../src/mutation/schema.js';
import {loadContext} from '../src/mutation/context.js';
import {isolatedCopy} from '../src/mutation/runner.js';
import {readReports} from '../src/portal/reports.js';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

// This program exercises process control and report plumbing. It is NOT browser execution.
const stub=String.raw`
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
if(process.env.MUTATION_RESULT_FILE){
 const args=process.argv.slice(2),config=args[args.indexOf('--config')+1],probe=config.endsWith('probe.config.ts'),normal=fs.readFileSync('src/app.ts','utf8').includes('true');
 const settings=JSON.parse(fs.readFileSync('playwright.config.json','utf8')),stall=settings.stallMutation;
 if(stall){spawn(process.execPath,['-e',"const fs=require('node:fs');setInterval(()=>fs.appendFileSync(process.argv[1],'tick\\n'),30)",stall],{stdio:'inherit'});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);process.exit(0);}
 console.log('SYNTHETIC MUTATION RUNNER STUB: no browser launched');
 if(probe){const spec=fs.readFileSync(path.join(path.dirname(config),'probe.spec.ts'),'utf8'),match=spec.match(/writeFileSync\(("(?:[^"\\]|\\.)*")/);fs.writeFileSync(JSON.parse(match[1]),JSON.stringify({actual:normal?'error':'allowed'}));}
 const status=settings.baselineBlocked?'failed':probe||normal?'passed':'failed';fs.writeFileSync(process.env.MUTATION_RESULT_FILE,JSON.stringify({status,errors:0,wallMs:1,tests:[{id:'stub',title:probe?'Synthetic probe':'Synthetic assertion',file:'stub.spec.ts',line:1,project:'stub',expectedStatus:'passed',results:[{status,retry:0,durationMs:1,assertionFailure:status==='failed',errors:status==='failed'?['Synthetic assertion failure']:[]}]}]}));process.exit(status==='failed'?1:0);
}
const args=process.argv.slice(2),c=JSON.parse(fs.readFileSync(args[args.indexOf('--config')+1],'utf8'));
console.log('SYNTHETIC RUNNER STUB: no browser launched');
if(c.noise)process.stdout.write('x'.repeat(c.noise));
if(c.descendant){const code="const fs=require('node:fs');setInterval(()=>fs.appendFileSync(process.argv[1],'tick\\n'),30)";spawn(process.execPath,['-e',code,c.descendant],{stdio:'inherit'});}
if(c.resistantDescendant){const code="const fs=require('node:fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(process.argv[1],'tick\\n'),25)";spawn(process.execPath,['-e',code,c.resistantDescendant],{stdio:'ignore'});}
setTimeout(()=>{
 const failed=c.mode==='failed',skipped=c.mode==='skipped',empty=c.mode==='empty';
 const tests=empty?[]:[{title:'Synthetic process fixture',file:'stub.spec.ts',tests:[{projectName:'stub',expectedStatus:'passed',status:skipped?'skipped':failed?'unexpected':'expected',results:[{status:skipped?'skipped':failed?'failed':'passed',duration:1,retry:0,errors:failed?[{message:'Synthetic expected failure'}]:[]}]}]}];
 const report={stats:{expected:empty||failed||skipped?0:1,unexpected:failed?1:0,flaky:0,skipped:skipped?1:0,startTime:new Date().toISOString()},suites:[{specs:tests}]};
 if(c.mode!=='missing')fs.writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE,c.mode==='malformed'?'invalid JSON':JSON.stringify(report));
 process.exit(c.mode==='failed'?1:0);
},c.delay||10);
`;
async function fixture(t:{after:(f:()=>Promise<void>)=>void},settings:Record<string,unknown>={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'portal execution synthetic-')),repo=path.join(root,'target');await mkdir(repo);
 await mkdir(path.join(repo,'node_modules/@playwright/test'),{recursive:true});
 await writeFile(path.join(repo,'package.json'),'{}');
 await writeFile(path.join(repo,'node_modules/@playwright/test/package.json'),JSON.stringify({name:'@playwright/test',exports:{'./cli':'./cli.cjs'}}));
 await writeFile(path.join(repo,'node_modules/@playwright/test/cli.cjs'),stub);
 const config=path.join(repo,'playwright.config.json');await writeFile(config,JSON.stringify(settings));
 const runConfig=path.join(repo,'portal.execution.json');await writeFile(runConfig,JSON.stringify({version:1,playwright:{config:'playwright.config.json',timeoutMs:1000}}));
 const source=path.join(root,'ticket.json');await writeFile(source,JSON.stringify({version:1,requirements:[{id:'LOGIN-1',criterion:'Invalid passwords show an error message.',journey:'login',critical:true}]}));
 const prepared=await prepareIntake({repo,task:'SYNTHETIC-1',files:[source],goal:'assess'}),intake=await inspectIntake({run:prepared.run});
 const managers:Awaited<ReturnType<typeof createExecutionManager>>[]=[];
 async function manager(allowRun=true,executionConfig=runConfig){const m=await createExecutionManager({repo,allowRun,executionConfig});managers.push(m);return m;}
 async function input(m:Awaited<ReturnType<typeof manager>>,kind:'playwright'|'mutation'='playwright'):Promise<ExecutionStart>{const action=(await m.capabilities()).actions.find(a=>a.kind===kind)!;return {taskId:'SYNTHETIC-1',runId:intake.snapshot.runId,kind,actionHash:action.actionHash!,intakeHash:intake.snapshot.intakeHash,draftHash:intake.draftHash,confirmRun:true};}
 t.after(async()=>{for(const m of managers)await m.close();await rm(root,{recursive:true,force:true});});
 return {root,repo,config,runConfig,prepared,intake,manager,input};
}
async function terminal(m:Awaited<ReturnType<typeof createExecutionManager>>,job:ExecutionJob){
 for(let n=0;n<300;n++){const current=await m.get(job.taskId,job.id);if(current.status!=='running')return current;await new Promise(r=>setTimeout(r,20));}throw Error('Synthetic execution did not terminate');
}

test('execution stays disabled by default and accepts only exact registered snapshots',async t=>{
 const f=await fixture(t),off=await f.manager(false);assert.equal((await off.capabilities()).enabled,false);
 await assert.rejects(off.start({...await f.input(off),actionHash:'0'.repeat(64)}),/read-only/);
 const m=await f.manager(),input=await f.input(m);
 await assert.rejects(m.start({...input,confirmRun:false as true}),/Confirm/);
 await assert.rejects(m.start({...input,actionHash:'0'.repeat(64)}),/scope changed/);
 await assert.rejects(m.start({...input,draftHash:'0'.repeat(64)}),/Intake or criteria changed/);
 await writeFile(f.config,JSON.stringify({delay:11}));await assert.rejects(m.start(input),/scope changed/);
});

test('project path traversal and linked configuration or test files cannot register an action',async t=>{
 const f=await fixture(t),m=await f.manager();
 await writeFile(f.runConfig,JSON.stringify({version:1,playwright:{config:'../outside.json'}}));assert.equal((await m.capabilities()).enabled,false);
 const outside=path.join(f.root,'outside.json');await writeFile(outside,'{}');await symlink(outside,path.join(f.repo,'linked.json'));
 await writeFile(f.runConfig,JSON.stringify({version:1,playwright:{config:'linked.json'}}));assert.equal((await m.capabilities()).enabled,false);
 await writeFile(f.runConfig,JSON.stringify({version:1,playwright:{config:'playwright.config.json',testFiles:['linked.json']}}));assert.equal((await m.capabilities()).enabled,false);
 const elsewhere=await f.manager(true,outside);assert.equal((await elsewhere.capabilities()).enabled,false);
});

test('actual synthetic child attaches its fresh validated report and preserves failure evidence',async t=>{
 const f=await fixture(t),m=await f.manager();let result=await terminal(m,await m.start(await f.input(m)));
 assert.equal(result.status,'completed');assert.equal(result.exitCode,0);assert.ok(result.reportId);assert.match(result.logTail,/SYNTHETIC RUNNER STUB/);
 const first=result;await writeFile(f.config,JSON.stringify({mode:'failed'}));result=await terminal(m,await m.start(await f.input(m)));
 assert.equal(result.status,'failed');assert.equal(result.exitCode,1);assert.ok(result.reportId);assert.notEqual(result.reportId,first.reportId);
 assert.notEqual(result.id,first.id);assert.equal((await m.list('SYNTHETIC-1')).length,2);
 assert.deepEqual(await readdir(path.join(f.repo,`artifacts/agent-tasks/SYNTHETIC-1/portal/executions/${result.id}`)),['execution.log','job.json','result.json']);
});

test('missing, malformed, empty and all-skipped reports never become a completed execution',async t=>{
 const f=await fixture(t),m=await f.manager();
 for(const mode of ['missing','malformed','empty','skipped']){
  await writeFile(f.config,JSON.stringify({mode}));const result=await terminal(m,await m.start(await f.input(m)));
  assert.equal(result.status,'failed',mode);assert.equal(result.exitCode,0,mode);
  if(mode==='empty'||mode==='skipped'){assert.ok(result.reportId);assert.match(result.error!,/No tests executed/);}else assert.equal(result.reportId,undefined);
 }
});

test('one active child is serialized, logs are bounded and timeout cleans its owned temporary directory',async t=>{
 const f=await fixture(t,{delay:10000,noise:1100000}),m=await f.manager(),input=await f.input(m),job=await m.start(input);
 await assert.rejects(m.start(input),/already running/);const result=await terminal(m,job);
 assert.equal(result.status,'timed_out');assert.equal(result.reportId,undefined);assert.equal(result.logTruncated,true);assert.ok(Buffer.byteLength(result.logTail)<=32771);
 const dir=path.join(f.repo,`artifacts/agent-tasks/SYNTHETIC-1/portal/executions/${job.id}`);
 assert.equal((await readFile(path.join(dir,'execution.log'))).length,1024*1024);await assert.rejects(readFile(path.join(dir,'tmp/anything')),/ENOENT/);
});

test('Stop and portal close terminate an owned child group and leave a terminal receipt',async t=>{
 const f=await fixture(t),heartbeat=path.join(f.root,'owned-heartbeat.txt');await writeFile(f.config,JSON.stringify({delay:10000,descendant:heartbeat}));
 const m=await f.manager(),job=await m.start(await f.input(m));
 for(let n=0;n<100;n++){try{if((await readFile(heartbeat)).length)break;}catch{}await new Promise(r=>setTimeout(r,15));}
 const cancelled=await m.cancel(job.taskId,job.id);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.reportId,undefined);
 const before=await readFile(heartbeat,'utf8');await new Promise(r=>setTimeout(r,130));assert.equal(await readFile(heartbeat,'utf8'),before);
 const again=await m.start(await f.input(m));await m.close();assert.equal((await m.get(again.taskId,again.id)).status,'cancelled');
});

test('source freshness and linked storage parents block execution before spawning',async t=>{
 const f=await fixture(t),m=await f.manager(),input=await f.input(m);
 const original=f.intake.snapshot.sources[0];await writeFile(path.join(f.repo,'contexts/tasks/SYNTHETIC-1',original.file),'changed');
 await assert.rejects(m.start(input),/changed|unavailable/i);assert.deepEqual(await m.list('SYNTHETIC-1'),[]);
});

test('portal Stop kills its registered group after its leader closes with a resistant descendant',async t=>{
 const f=await fixture(t),heartbeat=path.join(f.root,'portal-resistant-heartbeat.txt');await writeFile(f.config,JSON.stringify({delay:10000,resistantDescendant:heartbeat}));
 const m=await f.manager(),job=await m.start(await f.input(m));
 for(let n=0;n<150;n++){try{if((await readFile(heartbeat)).length)break;}catch{}await new Promise(r=>setTimeout(r,15));}
 const result=await m.cancel(job.taskId,job.id);assert.equal(result.status,'cancelled');assert.equal(result.reportId,undefined);
 const before=await readFile(heartbeat,'utf8');assert.ok(before.length);await new Promise(r=>setTimeout(r,150));assert.equal(await readFile(heartbeat,'utf8'),before);
});

test('an interrupted previous receipt is marked without resuming or reusing its output',async t=>{
 const f=await fixture(t),m=await f.manager(),result=await terminal(m,await m.start(await f.input(m)));await m.close();
 const jobFile=path.join(f.repo,`artifacts/agent-tasks/SYNTHETIC-1/portal/executions/${result.id}/job.json`);await writeFile(jobFile,JSON.stringify({...result,status:'running'}));
 const restarted=await f.manager();const old=await restarted.get(result.taskId,result.id);assert.equal(old.status,'interrupted');assert.match(old.error!,/not resumed/);
});

test('mutation registration requires the selected repository, a fresh plan and confined artifacts',async t=>{
 const f=await fixture(t),m=await f.manager();await mkdir(path.join(f.repo,'src'));await mkdir(path.join(f.repo,'documents'));
 await writeFile(path.join(f.repo,'src/app.ts'),'export const canLogin = true;');await writeFile(path.join(f.repo,'documents/requirements.txt'),'Invalid passwords show an error message.');
 const mutationFile=path.join(f.repo,'mutation.json');await writeFile(mutationFile,JSON.stringify({version:1,repo:'.',artifactDir:'documents',playwrightConfig:'playwright.config.json',sourceFiles:['src/app.ts']}));
 const c=await loadConfig(mutationFile),context=await loadContext(c),plan={version:1,contextHash:context.hash,requirements:[{id:'LOGIN-1',criterion:'Invalid passwords show an error message.',critical:true,source:{artifactId:context.artifacts[0].id,quote:'Invalid passwords show an error message.'}}],mutations:[{id:'M-1',requirementId:'LOGIN-1',description:'Remove the login permission gate',file:'src/app.ts',before:'true',after:'false',probe:{project:'stub',path:'/',testId:'message',kind:'text',expected:'error',roles:[]}}]};
 await writeFile(path.join(f.repo,'plan.json'),JSON.stringify(plan));await writeFile(f.runConfig,JSON.stringify({version:1,mutation:{config:'mutation.json',plan:'plan.json'}}));
 const ready=(await m.capabilities()).actions.find(a=>a.kind==='mutation')!;assert.equal(ready.available,true);assert.match(ready.preview.join(' '),/Reviewed plan/);
 const executed=await terminal(m,await m.start(await f.input(m,'mutation')));assert.equal(executed.status,'completed',executed.error+'\n'+executed.logTail);assert.ok(executed.reportId);assert.match(executed.logTail,/Mutation M-1/);
 const evidence=(await readReports(f.repo,'SYNTHETIC-1')).mutations.find(r=>r.id===executed.reportId)!;assert.equal(evidence.counts.killed,1);assert.equal(evidence.originalUnchanged,true);
 assert.equal(await readFile(path.join(f.repo,'src/app.ts'),'utf8'),'export const canLogin = true;');
 await writeFile(f.config,JSON.stringify({baselineBlocked:true}));const blocked=await terminal(m,await m.start(await f.input(m,'mutation')));assert.equal(blocked.status,'failed');assert.equal(blocked.exitCode,2);assert.ok(blocked.reportId);assert.match(blocked.logTail,/incomplete or unhealthy/);
 const heartbeat=path.join(f.root,'mutation-owned-heartbeat.txt');await writeFile(f.config,JSON.stringify({stallMutation:heartbeat}));const stopping=await m.start(await f.input(m,'mutation'));
 for(let n=0;n<200;n++){try{if((await readFile(heartbeat)).length)break;}catch{}await new Promise(r=>setTimeout(r,15));}
 const cancelled=await m.cancel(stopping.taskId,stopping.id);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.reportId,undefined);
 const before=await readFile(heartbeat,'utf8');await new Promise(r=>setTimeout(r,100));assert.equal(await readFile(heartbeat,'utf8'),before);
 await assert.rejects(readdir(path.join(f.repo,`artifacts/agent-tasks/SYNTHETIC-1/portal/executions/${stopping.id}/tmp`)),/ENOENT/);
 await writeFile(path.join(f.repo,'src/app.ts'),'export const canLogin = false;');assert.equal((await m.capabilities()).enabled,false);
 await writeFile(path.join(f.repo,'src/app.ts'),'export const canLogin = true;');const data=JSON.parse(await readFile(mutationFile,'utf8'));data.repo='..';await writeFile(mutationFile,JSON.stringify(data));assert.equal((await m.capabilities()).enabled,false);
});

test('isolated copies support owned excluded-artifact temporary roots and retain existing exclusions',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'mutation copy boundaries-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const repo=path.join(root,'repo');await mkdir(repo);await mkdir(path.join(repo,'node_modules'));await mkdir(path.join(repo,'src'));await mkdir(path.join(repo,'artifacts'));
 await writeFile(path.join(repo,'src/app.ts'),'export const allowed = true;');await writeFile(path.join(repo,'.env'),'PRIVATE SYNTHETIC MARKER');await writeFile(path.join(repo,'server.key'),'PRIVATE SYNTHETIC MARKER');await writeFile(path.join(repo,'artifacts/old-report.json'),'{}');
 for(const destination of [path.join(root,'outside-copy'),path.join(repo,'artifacts/owned/tmp/copy')]){
  await isolatedCopy(repo,destination);assert.equal(await readFile(path.join(destination,'src/app.ts'),'utf8'),'export const allowed = true;');
  for(const excluded of ['.env','server.key','artifacts'])await assert.rejects(readFile(path.join(destination,excluded)),/ENOENT/);
 }
 await assert.rejects(isolatedCopy(repo,path.join(repo,'src/recursive-copy')),/excluded artifact/);assert.equal(await readFile(path.join(repo,'src/app.ts'),'utf8'),'export const allowed = true;');
});

test('another portal cannot interrupt or start alongside the current project execution',async t=>{
 const f=await fixture(t,{delay:10000}),first=await f.manager(),job=await first.start(await f.input(first)),second=await f.manager();
 assert.equal((await second.get(job.taskId,job.id)).status,'running');await assert.rejects(second.cancel(job.taskId,job.id),/does not own/);await assert.rejects(second.start(await f.input(second)),/Another portal.*owns/);
 await first.cancel(job.taskId,job.id);const next=await second.start(await f.input(second));assert.equal((await second.cancel(next.taskId,next.id)).status,'cancelled');
});

test('a surviving registered worker blocks orphan reaping until it exits, then recovery is automatic',async t=>{
 const f=await fixture(t),first=await f.manager(),old=await terminal(first,await first.start(await f.input(first)));await first.close();
 const dir=path.join(f.repo,`artifacts/agent-tasks/SYNTHETIC-1/portal/executions/${old.id}`);await mkdir(path.join(dir,'tmp'));await writeFile(path.join(dir,'tmp/retained'),'owned temporary evidence');await writeFile(path.join(dir,'job.json'),JSON.stringify({...old,status:'running'}));
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});const ended=new Promise<void>(resolve=>child.on('close',()=>resolve()));t.after(async()=>{child.kill('SIGKILL');await ended;});
 await writeFile(path.join(f.repo,'artifacts/agent-tasks/.portal-execution-lock.json'),JSON.stringify({pid:99999999,owner:'synthetic-dead-portal',childPid:child.pid}));
 const second=await f.manager();assert.equal((await second.capabilities()).enabled,false);assert.match((await second.capabilities()).reason!,/registered worker/);assert.equal((await second.get(old.taskId,old.id)).status,'running');assert.equal(await readFile(path.join(dir,'tmp/retained'),'utf8'),'owned temporary evidence');
 await assert.rejects(second.cancel(old.taskId,old.id),/does not own/);await assert.rejects(second.start(await f.input(second)),/registered worker/);
 child.kill('SIGTERM');await ended;assert.equal((await second.capabilities()).enabled,true);assert.equal((await second.get(old.taskId,old.id)).status,'interrupted');await assert.rejects(readdir(path.join(dir,'tmp')),/ENOENT/);
 const fresh=await terminal(second,await second.start(await f.input(second)));assert.equal(fresh.status,'completed');assert.notEqual(fresh.id,old.id);
});

test('mutation timeout kills its registered group even after the leader closes and a descendant ignores TERM',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'mutation resistant descendant-'));t.after(()=>rm(root,{recursive:true,force:true}));const heartbeat=path.join(root,'heartbeat');
 const descendant="const fs=require('node:fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.appendFileSync(process.argv[1],'tick\\n'),25)";
 const leader=`const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(descendant)},${JSON.stringify(heartbeat)}],{stdio:'ignore'});setInterval(()=>{},1000);`;
 const source=pathToFileURL(fileURLToPath(new URL('../src/mutation/process.ts',import.meta.url))).href;
 const code=`import {runProcess} from ${JSON.stringify(source)};await runProcess(process.execPath,['-e',${JSON.stringify(leader)}],${JSON.stringify(root)},process.env,700);`;
 const worker=spawn(process.execPath,['--import',createRequire(import.meta.url).resolve('tsx'),'--input-type=module','-e',code],{stdio:['ignore','ignore','pipe'],detached:process.platform!=='win32'});let errors='';worker.stderr.on('data',b=>errors+=b);
 t.after(()=>{try{process.kill(-worker.pid!,'SIGKILL');}catch{}});const exit=await new Promise<number|null>(resolve=>worker.on('close',resolve));assert.equal(exit,0,errors);
 const before=await readFile(heartbeat,'utf8');assert.ok(before.length);await new Promise(r=>setTimeout(r,150));assert.equal(await readFile(heartbeat,'utf8'),before);
});

test('execution storage never follows a linked portal directory',async t=>{
 const f=await fixture(t),m=await f.manager(),input=await f.input(m),outside=path.join(f.root,'outside');await mkdir(outside);
 await symlink(outside,path.join(f.repo,'artifacts/agent-tasks/SYNTHETIC-1/portal'));
 await assert.rejects(m.start(input),/real directories/);assert.deepEqual(await readdir(outside),[]);
});
