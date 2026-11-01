import {lstat,mkdir,readdir,readFile,writeFile,appendFile,rm,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {z} from 'zod';
import {guarded,projectRoot,registeredRun,validTask,validRun} from './project.js';
import {inspectIntake} from '../intake/store.js';
import {loadConfig,type MutationConfig} from '../mutation/schema.js';
import {loadContext,validatePlan} from '../mutation/context.js';
import {attachReport,readReports} from './reports.js';

export type ExecutionKind='playwright'|'mutation';
export interface ExecutionAction {kind:ExecutionKind;label:string;available:boolean;reason?:string;actionHash?:string;preview:string[];timeoutMs:number}
export interface ExecutionCapabilities {enabled:boolean;reason?:string;actions:ExecutionAction[];activeJobId:string|null}
export interface ExecutionJob {
 id:string;taskId:string;runId:string;kind:ExecutionKind;status:'running'|'completed'|'failed'|'cancelled'|'timed_out'|'interrupted';
 createdAt:string;finishedAt?:string;exitCode:number|null;reportId?:string;error?:string;logTail:string;logTruncated:boolean;
 intakeHash:string;draftHash:string;actionHash:string;preview:string[];
}
export interface ExecutionStart {taskId:string;runId:string;kind:ExecutionKind;actionHash:string;intakeHash:string;draftHash:string;confirmRun:true}
export interface ExecutionOptions {repo:string;allowRun?:boolean;executionConfig?:string}
const relative=z.string().min(1).max(500).refine(s=>!path.isAbsolute(s)&&!s.split(/[\\/]/).some(p=>p==='..'||p==='.'||!p)&&!/[\u0000-\u001f]/.test(s),'Use a confined relative project file');
const timeout=z.number().int().min(1000).max(3600000);
const scope=z.object({version:z.literal(1),playwright:z.object({config:relative,projects:z.array(z.string().min(1).max(160).refine(s=>!/[\u0000-\u001f]/.test(s))).max(20).optional(),testFiles:z.array(relative).max(100).optional(),grep:z.string().min(1).max(1000).optional(),timeoutMs:timeout.optional()}).strict().optional(),mutation:z.object({config:relative,plan:relative,timeoutMs:timeout.optional()}).strict().optional()}).strict();
type Scope=z.infer<typeof scope>;
interface Prepared {action:ExecutionAction;args?:string[];config?:string;plan?:string;contextHash?:string;configHash?:string;planHash?:string}
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const LOG_LIMIT=1024*1024,TAIL_LIMIT=32768,REPORT_LIMIT=5*1024*1024;
const owners=new Set<string>();
const label=(kind:ExecutionKind)=>kind==='playwright'?'Run Playwright':'Run mutations';
const jobSchema=z.object({id:z.string().regex(UUID),taskId:z.string(),runId:z.string(),kind:z.enum(['playwright','mutation']),status:z.enum(['running','completed','failed','cancelled','timed_out','interrupted']),createdAt:z.string(),finishedAt:z.string().optional(),exitCode:z.number().int().nullable(),reportId:z.string().optional(),error:z.string().optional(),logTail:z.string().max(TAIL_LIMIT+20),logTruncated:z.boolean(),intakeHash:z.string().regex(HASH),draftHash:z.string().regex(HASH),actionHash:z.string().regex(HASH),preview:z.array(z.string())}).strict();
async function json(file:string,max=1024*1024){if((await lstat(file)).size>max)throw Error('Execution metadata exceeds its limit');return JSON.parse(await readFile(file,'utf8'));}
async function directory(repo:string,relative:string){
 let current=repo;
 for(const part of relative.split('/')){current=path.join(current,part);try{await mkdir(current,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}const info=await lstat(current);if(info.isSymbolicLink()||!info.isDirectory())throw Error('Execution paths require real directories');}
 return current;
}
async function mutationPaths(repo:string,c:MutationConfig,file:string){
 if(c.repo!==repo)throw Error('Mutation repository must equal the selected project');
 const raw=await json(file),base=path.dirname(file);
 // loadConfig resolves real paths; check the configured spelling too so links cannot disappear.
 if(path.resolve(base,raw.repo)!==repo)throw Error('Mutation repository must use the selected project path');
 await guarded(repo,path.relative(repo,path.resolve(base,raw.artifactDir)),'directory');
 await guarded(repo,path.relative(repo,c.artifactDir),'directory');
 await guarded(repo,c.playwrightConfig,'file');
 for(const file of c.sourceFiles)await guarded(repo,file,'file');
 if(c.probeSetup)await guarded(repo,c.probeSetup.module,'file');
 for(const entry of await readdir(c.artifactDir,{withFileTypes:true}))if(!entry.name.startsWith('.')&&(!c.artifactFiles||c.artifactFiles.includes(entry.name)))await guarded(repo,path.relative(repo,path.join(c.artifactDir,entry.name)),'file');
}

/** The only executable actions are registered local Playwright and reviewed mutation configurations. */
export async function createExecutionManager(options:ExecutionOptions){
 const repo=await projectRoot(options.repo),owner=randomUUID();owners.add(owner);let closed=false,starting=false,startDone:Promise<void>|undefined;
 const lockRelative='artifacts/agent-tasks/.portal-execution-lock.json';let ownsLock=false;
 const alive=(pid:number,token?:string)=>{if(!Number.isInteger(pid)||pid<=0)return false;if(pid===process.pid&&token!==undefined)return owners.has(token);try{process.kill(pid,0);return true;}catch(e){return (e as NodeJS.ErrnoException).code==='EPERM';}};
 async function liveLock(){const file=await guarded(repo,lockRelative,'file',true);if(!file)return false;const value=await json(file);return typeof value.owner==='string'&&(alive(value.pid,value.owner)||alive(value.childPid));}
 async function claim(){
  await directory(repo,'artifacts/agent-tasks');const file=path.join(repo,lockRelative);
  try{await writeFile(file,JSON.stringify({pid:process.pid,owner}),{flag:'wx',mode:0o600});ownsLock=true;}catch{throw Error('Another portal owns an active execution for this project');}
 }
 async function release(){if(!ownsLock)return;const file=(await guarded(repo,lockRelative,'file'))!,value=await json(file);if(value.owner===owner)await rm(file);ownsLock=false;}
 type Active={job:ExecutionJob;dir:string;tmp:string;child:ChildProcess;done:Promise<void>;stop?:'cancelled'|'timed_out';timer?:NodeJS.Timeout;force?:NodeJS.Timeout;writes:Promise<unknown>;writeError?:boolean;logged:number;tail:Buffer};
 let active:Active|undefined;
 const root=(task:string)=>`artifacts/agent-tasks/${validTask(task)}/portal/executions`;
 const jobRelative=(task:string,id:string)=>{if(!UUID.test(id))throw Error('Invalid execution ID');return `${root(task)}/${id}`;};
 async function persist(job:ExecutionJob,dir:string){
  const file=path.join(dir,'job.json');await writeFile(file+'.tmp',JSON.stringify(job,null,2)+'\n',{mode:0o600});await rename(file+'.tmp',file);
 }
 async function readJob(task:string,id:string){
  const file=await guarded(repo,`${jobRelative(task,id)}/job.json`,'file');const job=jobSchema.parse(await json(file!));
  if(job.taskId!==task||job.id!==id)throw Error('Execution identity differs from its registered path');validRun(job.runId);return job;
 }
 async function list(task:string):Promise<ExecutionJob[]>{
  validTask(task);const dir=await guarded(repo,root(task),'directory',true);if(!dir)return [];
  const entries=await readdir(dir,{withFileTypes:true});if(entries.length>1000)throw Error('Execution history exceeds 1000 jobs; archive old private evidence');
  const jobs:ExecutionJob[]=[];
  for(const e of entries)if(e.isDirectory()&&!e.isSymbolicLink()&&UUID.test(e.name))jobs.push(await get(task,e.name));
  return jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 }
 async function prepare(kind:ExecutionKind):Promise<Prepared>{
  const action:ExecutionAction={kind,label:label(kind),available:false,preview:[],timeoutMs:kind==='playwright'?300000:900000};
  if(!options.allowRun||closed)return {action:{...action,reason:closed?'The portal is closing.':'Execution is read-only. Start the portal with --allow-run and a reviewed run configuration.'}};
  if(!options.executionConfig)return {action:{...action,reason:'No reviewed execution configuration was selected.'}};
  try{
   // projectRoot canonicalizes system ancestors such as /var -> /private/var on macOS.
   const selected=path.resolve(options.executionConfig),file=(await guarded(repo,path.relative(path.resolve(options.repo),selected),'file'))!;
   const config=scope.parse(await json(file)),raw=await readFile(file),selectedScope=config[kind];
   if(!selectedScope)return {action:{...action,reason:`No ${kind} action is registered.`}};
   const fingerprints=[sha(raw)];
   if(kind==='playwright'){
    const p=config.playwright!,configFile=(await guarded(repo,p.config,'file'))!;
    fingerprints.push(sha(await readFile(configFile)));
    const cli=createRequire(path.join(repo,'package.json')).resolve('@playwright/test/cli');
    const cliInfo=await lstat(cli);if(!cliInfo.isFile()||cliInfo.isSymbolicLink())throw Error('Installed Playwright CLI must be a regular file');
    const args=[cli,'test','--config',configFile,'--reporter=json',...(p.projects??[]).map(x=>`--project=${x}`),...(p.grep?['--grep',p.grep]:[])];
    for(const f of p.testFiles??[]){await guarded(repo,f,'file');if(f.startsWith('-'))throw Error('Test file cannot be a CLI option');}
    args.push('--',...(p.testFiles??[]));
    action.preview=[`Project: ${path.basename(repo)}`,`Playwright config: ${p.config}`,`Projects: ${p.projects?.join(', ')||'all configured projects'}`,`Tests: ${p.testFiles?.join(', ')||'all configured tests'}`,...(p.grep?[`Title filter: ${p.grep}`]:[]),'Reporter: built-in JSON; output is private to this new job.'];
    action.timeoutMs=p.timeoutMs??action.timeoutMs;action.available=true;action.actionHash=sha(JSON.stringify({kind,scope:p,fingerprints,cli}));return {action,args};
   }
   const m=config.mutation!,configFile=(await guarded(repo,m.config,'file'))!,planFile=(await guarded(repo,m.plan,'file'))!,c=await loadConfig(configFile);
   await mutationPaths(repo,c,configFile);const context=await loadContext(c),plan=validatePlan(await json(planFile,REPORT_LIMIT),context,c);
   fingerprints.push(sha(await readFile(configFile)),sha(await readFile(planFile)),context.hash,sha(await readFile(path.join(repo,c.playwrightConfig))));
   if(c.probeSetup)fingerprints.push(sha(await readFile(path.join(repo,c.probeSetup.module))));
   action.preview=[`Project: ${path.basename(repo)}`,`Mutation config: ${m.config}`,`Reviewed plan: ${m.plan}`,`Allowed source: ${c.sourceFiles.join(', ')}`,`Faults: ${plan.mutations.length}; baselines: ${c.baselineRuns}`,'Application faults run in a disposable copy; original tests and source are preserved.'];
   action.timeoutMs=m.timeoutMs??action.timeoutMs;action.available=true;action.actionHash=sha(JSON.stringify({kind,scope:m,fingerprints}));return {action,config:configFile,plan:planFile,contextHash:context.hash,configHash:fingerprints[1],planHash:fingerprints[2]};
  }catch{return {action:{...action,reason:'The registered execution configuration, installed runner or reviewed plan is unavailable or invalid. Recheck confined paths and mutation context freshness.'}};}
 }
 async function capabilities():Promise<ExecutionCapabilities>{
  await reconcile();
  const actions=await Promise.all((['playwright','mutation'] as const).map(async k=>(await prepare(k)).action));
  if(!active&&await liveLock())return {enabled:false,reason:'Another portal or its registered worker is still alive. New runs are blocked until that owner ends.',actions:actions.map(a=>({...a,available:false,reason:'Another portal or its registered worker owns this project execution.'})),activeJobId:null};
  return {enabled:actions.some(a=>a.available),...(!options.allowRun?{reason:'Execution is disabled until the portal is started with explicit local run permission.'}:{}),actions,activeJobId:active?.job.id??null};
 }
 const kill=(a:Active,signal:NodeJS.Signals)=>{try{if(process.platform==='win32')a.child.kill(signal);else if(a.child.pid)process.kill(-a.child.pid,signal);}catch{}};
 function stop(a:Active,reason:'cancelled'|'timed_out'){
  if(a.stop)return;a.stop=reason;kill(a,'SIGTERM');a.force=setTimeout(()=>kill(a,'SIGKILL'),2200);
 }
 async function start(input:ExecutionStart):Promise<ExecutionJob>{
  if(closed)throw Error('The portal is closing');if(starting||active)throw Error('Another execution is already running');starting=true;
  let finishStart!:()=>void;startDone=new Promise<void>(r=>finishStart=r);
  try{
   validTask(input.taskId);validRun(input.runId);
   await reconcile();
   if(await liveLock())throw Error('Another portal or registered worker owns an active execution for this project');
   if(input.confirmRun!==true||!HASH.test(input.actionHash)||!HASH.test(input.intakeHash)||!HASH.test(input.draftHash)||!['playwright','mutation'].includes(input.kind))throw Error('Confirm the registered action and exact intake snapshot before running');
   const run=await registeredRun(repo,input.taskId,input.runId),intake=await inspectIntake({run});
   if(intake.snapshot.intakeHash!==input.intakeHash||intake.draftHash!==input.draftHash)throw Error('Intake or criteria changed; refresh before running');
   const p=await prepare(input.kind);if(!p.action.available)throw Error(p.action.reason);
   if(p.action.actionHash!==input.actionHash)throw Error('Registered execution scope changed; review the new action before running');
   if(closed)throw Error('The portal is closing');await claim();const id=randomUUID(),dir=await directory(repo,jobRelative(input.taskId,id)),tmp=await directory(repo,`${jobRelative(input.taskId,id)}/tmp`);
   const ignored=path.join(repo,'artifacts/agent-tasks/.gitignore');await guarded(repo,'artifacts/agent-tasks','directory');
   try{await writeFile(ignored,'*\n',{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;await guarded(repo,'artifacts/agent-tasks/.gitignore','file');}
   const report=path.join(dir,'result.json'),job:ExecutionJob={id,taskId:input.taskId,runId:input.runId,kind:input.kind,status:'running',createdAt:new Date().toISOString(),exitCode:null,logTail:'',logTruncated:false,intakeHash:input.intakeHash,draftHash:input.draftHash,actionHash:input.actionHash,preview:p.action.preview};
   await persist(job,dir);await writeFile(path.join(dir,'execution.log'),'',{flag:'wx',mode:0o600});
   let args:string[];
   if(input.kind==='playwright'){
    args=[...p.args!];args.splice(args.indexOf('--'),0,'--output',path.join(dir,'test-results'));
   }else{
    const request=path.join(dir,'request.json');await writeFile(request,JSON.stringify({repo,config:p.config,plan:p.plan,contextHash:p.contextHash,configHash:p.configHash,planHash:p.planHash,output:path.join(dir,'campaign'),report}),{flag:'wx',mode:0o600});
    args=['--import',createRequire(import.meta.url).resolve('tsx'),fileURLToPath(new URL('./execution-worker.ts',import.meta.url)),request];
   }
   const env={...process.env,CI:'1',TMPDIR:tmp,TEMP:tmp,TMP:tmp,PLAYWRIGHT_JSON_OUTPUT_FILE:report};
   const child=spawn(process.execPath,args,{cwd:repo,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
   let resolveDone!:()=>void;const done=new Promise<void>(r=>resolveDone=r);
   const lockTemp=path.join(repo,lockRelative)+'.'+randomUUID()+'.tmp';
   const childRegistration=child.pid?writeFile(lockTemp,JSON.stringify({pid:process.pid,owner,childPid:child.pid}),{flag:'wx',mode:0o600}).then(()=>rename(lockTemp,path.join(repo,lockRelative))).finally(()=>rm(lockTemp,{force:true})):Promise.resolve();
   const a:Active={job,dir,tmp,child,done,writes:childRegistration,logged:0,tail:Buffer.alloc(0)};active=a;
   a.writes=a.writes.catch(()=>{a.writeError=true;stop(a,'cancelled');});
   const log=(value:Buffer)=>{
    const b=Buffer.isBuffer(value)?value:Buffer.from(value);a.tail=Buffer.concat([a.tail,b]);if(a.tail.length>TAIL_LIMIT){a.tail=a.tail.subarray(a.tail.length-TAIL_LIMIT);job.logTruncated=true;}
    job.logTail=a.tail.toString('utf8');const bytes=b.subarray(0,Math.max(0,LOG_LIMIT-a.logged));a.logged+=bytes.length;if(bytes.length<b.length)job.logTruncated=true;
    if(bytes.length)a.writes=a.writes.then(()=>appendFile(path.join(dir,'execution.log'),bytes)).catch(()=>{a.writeError=true;});
   };
   child.stdout?.on('data',log);child.stderr?.on('data',log);
   let spawnError=false;child.on('error',()=>{spawnError=true;});
   a.timer=setTimeout(()=>stop(a,'timed_out'),p.action.timeoutMs);
   child.on('close',code=>{void (async()=>{
    if(a.stop)kill(a,'SIGKILL');if(a.timer)clearTimeout(a.timer);if(a.force)clearTimeout(a.force);
    job.exitCode=code;job.finishedAt=new Date().toISOString();
    try{
     await a.writes;if(a.writeError)throw Error('Private execution log could not be saved');
     if(a.stop){job.status=a.stop;job.error=a.stop==='timed_out'?'Execution exceeded the registered timeout.':'Execution stopped by the user or portal shutdown.';}
     else if(spawnError){job.status='failed';job.error='The installed local runner could not start.';}
     else{
      try{
       const evidence=(await guarded(repo,path.relative(repo,report),'file'))!;if((await lstat(evidence)).size>REPORT_LIMIT)throw Error('Report exceeds 5 MiB');
       const attached=await attachReport({repo,taskId:input.taskId,kind:input.kind,name:`portal-${input.kind}-${id}.json`,bytes:await readFile(evidence)});job.reportId=attached.id;
       job.status=code===0?'completed':'failed';if(code!==0)job.error='The runner returned a nonzero exit code. The recorded report remains available.';
       if(input.kind==='playwright'){
        const recorded=(await readReports(repo,input.taskId)).tests.find(t=>t.id===attached.id)!;
        if(!recorded.tests.some(t=>t.attempts.some(a=>a.status!=='skipped'))){job.status='failed';job.error='No tests executed. Empty or entirely skipped output does not verify behavior.';}
        else if(recorded.reportErrorCount){job.status='failed';job.error='The report records runner errors. Test totals alone do not establish a healthy execution.';}
       }
      }catch{job.status='failed';job.error='No fresh valid result report was produced. Inspect the private execution log and configuration.';}
     }
    }catch{job.status='failed';job.error='Execution evidence could not be saved.';}
    finally{
     try{await rm(tmp,{recursive:true,force:true});await persist(job,dir);}catch{job.status='failed';job.error='Execution ended but private evidence or temporary cleanup needs review.';}
     try{await release();}catch{job.error='Execution ended; the private ownership receipt needs review.';}if(active===a)active=undefined;resolveDone();
    }
   })();});
   return structuredClone(job);
  }finally{try{if(!active)await release();}finally{starting=false;finishStart();}}
 }
 async function get(task:string,id:string):Promise<ExecutionJob>{if(active?.job.id===id&&active.job.taskId===task){const a=active;if(a.job.status==='running')return structuredClone(a.job);await a.done;}return readJob(task,id);}
 async function cancel(task:string,id:string){validTask(task);if(!UUID.test(id))throw Error('Invalid execution ID');if(active?.job.id===id&&active.job.taskId===task){const a=active;stop(a,'cancelled');await a.done;}else if((await get(task,id)).status==='running')throw Error('This portal does not own that running execution; Stop must be requested from its owning portal.');return get(task,id);}
 async function close(){closed=true;if(startDone)await startDone;if(active){const a=active;stop(a,'cancelled');await a.done;}owners.delete(owner);}
 // A new server never resumes work whose owning process is gone. Keep the receipt explicit.
 let reconciliation:Promise<void>|undefined;
 async function reconcile(){if(!reconciliation)reconciliation=reconcileNow().finally(()=>{reconciliation=undefined;});await reconciliation;}
 async function reconcileNow(){
 if(active||await liveLock())return;
 const tasks=await guarded(repo,'artifacts/agent-tasks','directory',true);
 if(tasks)for(const e of (await readdir(tasks,{withFileTypes:true})).slice(0,500))if(e.isDirectory()&&!e.isSymbolicLink()&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(e.name)){
  for(const job of await list(e.name))if(job.status==='running'){
   job.status='interrupted';job.finishedAt=new Date().toISOString();job.error='The owning portal stopped before recording a terminal result; this run was not resumed.';
   const dir=(await guarded(repo,jobRelative(e.name,job.id),'directory'))!;await rm(path.join(dir,'tmp'),{recursive:true,force:true});await persist(job,dir);
  }
 }
 if(tasks&&!await liveLock()){const old=await guarded(repo,lockRelative,'file',true);if(old)await rm(old);}
 }
 await reconcile();
 return {capabilities,list,get,start,cancel,close};
}
