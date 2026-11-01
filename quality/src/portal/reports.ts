import {constants} from 'node:fs';
import {lstat,realpath,mkdir,readdir,writeFile,appendFile,open} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {digest} from '../context.js';
import {planSchema} from '../mutation/schema.js';
import {healthy,classify,type Campaign,type Execution} from '../mutation/runner.js';
import {campaignMetrics} from '../mutation/report.js';
import type {TestReportView,MutationReportView,ExecutionSummary} from './types.js';

const MAX_BYTES=5*1024*1024,MAX_STORED_BYTES=8*1024*1024;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const count=z.number().int().nonnegative(),duration=z.number().finite().nonnegative();
const nameSchema=z.string().min(1).max(240).refine(name=>Boolean(name.trim())&&!/[\u0000-\u001f\u007f]/.test(name)&&name.toLowerCase().endsWith('.json'),'Report name must be JSON metadata without control characters');
const testStatus=z.enum(['passed','failed','timedOut','skipped','interrupted']);
const date=z.string().datetime({offset:true});
const errorSchema=z.object({message:z.string().optional(),value:z.string().optional()}).passthrough();
const playwrightResult=z.object({status:testStatus,duration:duration.optional(),retry:count.optional(),errors:z.array(errorSchema).max(100).optional(),error:errorSchema.optional()}).passthrough();
const playwrightTest=z.object({projectName:z.string().optional(),expectedStatus:testStatus,status:z.enum(['expected','unexpected','flaky','skipped']),results:z.array(playwrightResult).max(100)}).passthrough();
const playwrightStats=z.object({expected:count,unexpected:count,skipped:count,flaky:count,startTime:date.optional(),duration:duration.optional()}).passthrough();
const execution=z.object({status:z.string().min(1).max(60),errors:count,wallMs:duration,tests:z.array(z.object({id:z.string(),title:z.string(),file:z.string(),line:count,project:z.string(),expectedStatus:testStatus,
 results:z.array(z.object({status:testStatus,retry:count,durationMs:duration,assertionFailure:z.boolean(),errors:z.array(z.string())})).max(100)})).max(10000)});
const faultStatus=z.enum(['killed','survived','not_activated','invalid_mutation','inconclusive','not_run']);
const campaignSchema=z.object({version:z.literal(1),kind:z.literal('playwright-behavioral-mutations'),runId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/),createdAt:date,contextHash:z.string().regex(/^[a-f0-9]{64}$/),
 repositoryHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),planHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),scopeHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),plan:planSchema,
 baseline:z.array(execution).max(5),restored:execution.nullable(),originalUnchanged:z.boolean(),wallMs:duration,
 faults:z.array(z.object({id:z.string(),requirementId:z.string(),status:faultStatus,reason:z.string().optional(),baselineProbe:z.string().optional(),mutantProbe:z.string().optional(),attempts:z.array(execution).max(5),killingTests:z.array(z.string()).max(10000)})).max(10)});
const envelopeSchema=z.object({version:z.literal(1),id:z.string().regex(uuid),kind:z.enum(['playwright','mutation']),name:nameSchema,importedAt:date,sha256:z.string().regex(/^[a-f0-9]{64}$/),base64:z.string()}).strict();
type Envelope=z.infer<typeof envelopeSchema>;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const bounded=(value:string,max=500)=>value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,max);
function fail(message:string):never {throw Error('Report evidence: '+message);}
const limitations=[
 'Imported recorded evidence; this portal did not rerun tests or mutations.',
 'Task association was supplied by the uploader. Criterion coverage is not inferred.',
 'Validation checks internal report consistency, not source authenticity or independent human review.'
];
function parse(bytes:Buffer):unknown {
 if(bytes.length===0||bytes.length>MAX_BYTES)fail('JSON must contain between 1 byte and 5 MiB');
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));}
 catch{fail('invalid UTF-8 JSON; report content was not printed');}
}
function testView(raw:unknown,e:Envelope):TestReportView {
 const report=z.object({stats:playwrightStats,suites:z.array(z.unknown()),errors:z.array(errorSchema).max(100).optional()}).parse(raw);
 const counts={expected:0,unexpected:0,skipped:0,flaky:0,total:0},tests:TestReportView['tests']=[];
 const pending=report.suites.map(value=>({value,depth:0}));let suites=0;
 while(pending.length){
  const {value,depth}=pending.shift()!;
  if(depth>40||++suites>10000)fail('test suite nesting or count exceeds the supported report limit');
  const suite=z.object({suites:z.array(z.unknown()).optional(),specs:z.array(z.unknown()).optional()}).parse(value);
  for(const child of suite.suites??[])pending.push({value:child,depth:depth+1});
  for(const value of suite.specs??[]){
   const spec=z.object({title:z.string(),file:z.string().optional(),line:count.optional(),column:count.optional(),tests:z.array(playwrightTest)}).parse(value);
   for(const t of spec.tests){
    if(++counts.total>10000)fail('too many test records');
    const final=t.results.at(-1),prior=t.results.slice(0,-1);
    if(t.status==='skipped'){
     if(final&&final.status!=='skipped')fail('skipped test contradicts its final result');
    }else if(!final)fail('executed test has no recorded result');
    else if(t.status==='expected'){
     if(t.expectedStatus==='skipped'||t.results.some(r=>r.status!==t.expectedStatus))fail('expected outcome contradicts the recorded attempts');
    }else if(t.status==='unexpected'){
     if(final.status===t.expectedStatus||final.status==='skipped')fail('unexpected outcome contradicts its final result');
    }else if(final.status!==t.expectedStatus||!prior.some(r=>r.status!==t.expectedStatus))fail('flaky outcome has no failed/unexpected attempt followed by the expected result');
    counts[t.status==='expected'?'expected':t.status]++;
    let status:string=final?.status??'skipped';
    if(t.status==='flaky')status=`flaky (final ${status})`;
    else if(t.status==='unexpected')status=`unexpected (final ${status})`;
    else if(t.status==='expected'&&t.expectedStatus!=='passed')status=`expected failure (${status})`;
    const elapsed=t.results.length&&t.results.every(r=>r.duration!==undefined)?t.results.reduce((n,r)=>n+r.duration!,0):null;
    const recordedErrors=t.results.flatMap(r=>[...r.errors??[],...(r.error?[r.error]:[])]),errors=recordedErrors.map(err=>err.message??err.value??'Error details unavailable').slice(0,5).map(message=>bounded(message,1000));
    const attempts=t.results.map(r=>{const errors=[...r.errors??[],...(r.error?[r.error]:[])];return {status:r.status,retry:r.retry??null,durationMs:r.duration??null,errorCount:errors.length,errors:errors.slice(0,5).map(err=>bounded(err.message??err.value??'Error details unavailable',1000))};});
    tests.push({title:bounded(spec.title),project:bounded(t.projectName??'',120),status,durationMs:elapsed!==null&&Number.isFinite(elapsed)?elapsed:null,errors,errorCount:recordedErrors.length,
     outcome:t.status,expectedStatus:t.expectedStatus,...(spec.file!==undefined?{file:bounded(spec.file)}:{}),...(spec.line!==undefined?{line:spec.line}:{}),...(spec.column!==undefined?{column:spec.column}:{}),attempts});
   }
  }
 }
 for(const key of ['expected','unexpected','skipped','flaky'] as const)if(counts[key]!==report.stats[key])fail('summary counts disagree with test records');
 const notes=[...limitations,'Expected outcomes include declared expected failures; expected is not a passed-test count. Durations sum recorded attempts.'];
 if(report.errors?.length)notes.push(`Report records ${report.errors.length} top-level errors; test totals alone are incomplete.`);
 return {id:e.id,kind:'playwright',name:e.name,importedAt:e.importedAt,recordedAt:report.stats.startTime??null,durationMs:report.stats.duration??null,
  reportErrorCount:report.errors?.length??0,reportErrors:(report.errors??[]).slice(0,5).map(err=>bounded(err.message??err.value??'Error details unavailable',1000)),counts,tests,limitations:notes};
}
function executionSummary(e:Execution):ExecutionSummary {
 const summary:ExecutionSummary={status:bounded(e.status,60),errors:e.errors,tests:e.tests.length,passed:0,failed:0,skipped:0,other:0,assertionFailures:0,durationMs:e.wallMs};
 for(const test of e.tests){
  const status=test.results.at(-1)?.status;
  if(status==='passed'||status==='failed'||status==='skipped')summary[status]++;else summary.other++;
  if(test.results.some(result=>result.status==='failed'&&result.assertionFailure))summary.assertionFailures++;
 }
 return summary;
}
function mutationView(raw:unknown,e:Envelope):MutationReportView {
 const c=campaignSchema.parse(raw) as Campaign;
 if(c.contextHash!==c.plan.contextHash||c.planHash&&c.planHash!==digest(JSON.stringify(c.plan)))fail('campaign plan identity differs');
 if(new Set(c.plan.requirements.map(r=>r.id)).size!==c.plan.requirements.length||new Set(c.plan.mutations.map(m=>m.id)).size!==c.plan.mutations.length)fail('duplicate plan identities');
 if(c.faults.length!==c.plan.mutations.length||new Set(c.faults.map(f=>f.id)).size!==c.faults.length)fail('fault inventory differs from the plan');
 for(const f of c.faults){
  const planned=c.plan.mutations.find(m=>m.id===f.id);
  if(!planned||planned.requirementId!==f.requirementId||!c.plan.requirements.some(r=>r.id===f.requirementId))fail('unknown fault or requirement identity');
  if(f.status==='killed'||f.status==='survived'){
   if(c.baseline.length<2||!c.baseline.every(healthy)||!c.restored||!healthy(c.restored)||!c.originalUnchanged||f.baselineProbe!==planned.probe.expected||f.mutantProbe===undefined||f.mutantProbe===f.baselineProbe)fail('conclusive mutation lacks healthy baselines, activation, restoration or unchanged source');
   const result=classify(f.attempts,c.baseline[0]);
   if(result.status!==f.status)fail('conclusive mutation contradicts repeated assertion evidence');
   if(JSON.stringify([...new Set(f.killingTests)].sort())!==JSON.stringify([...new Set(result.killingTests)].sort()))fail('killing test claims differ from observed assertion failures');
  }
 }
 const m=campaignMetrics(c);
 return {id:e.id,kind:'mutation',name:e.name,importedAt:e.importedAt,recordedAt:c.createdAt,runId:bounded(c.runId,120),
  counts:{requested:m.requested,killed:m.killed,survived:m.survived,notActivated:m.notActivated,invalid:m.invalid,inconclusive:m.inconclusive,notRun:m.notRun},
  baselines:c.baseline.map(executionSummary),restored:c.restored?bounded(c.restored.status,60):null,restoration:c.restored?executionSummary(c.restored):null,originalUnchanged:c.originalUnchanged,
  faults:c.faults.map(f=>({id:bounded(f.id,120),requirementId:bounded(f.requirementId,120),criterion:bounded(c.plan.requirements.find(r=>r.id===f.requirementId)!.criterion,2000),description:bounded(c.plan.mutations.find(m=>m.id===f.id)!.description,1000),status:f.status,...(f.reason?{reason:bounded(f.reason,1000)}:{}),...(f.baselineProbe!==undefined?{baselineProbe:bounded(f.baselineProbe)}:{}),...(f.mutantProbe!==undefined?{mutantProbe:bounded(f.mutantProbe)}:{}),killingTests:f.killingTests.slice(0,50).map(v=>bounded(v)),killingTestCount:f.killingTests.length,attempts:f.attempts.map(executionSummary)})),
  limitations:[...limitations,'Partial and unknown fault outcomes remain recorded as such. Imported source/scope hashes do not authenticate the original application.']};
}
function view(bytes:Buffer,e:Envelope){const raw=parse(bytes);return e.kind==='playwright'?testView(raw,e):mutationView(raw,e);}

async function reportsDirectory(repo:string,taskId:string,create=false):Promise<string|null>{
 if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(taskId))fail('invalid task ID');
 const requested=path.resolve(repo),info=await lstat(requested);
 if(info.isSymbolicLink()||!info.isDirectory())fail('selected repository must be a real directory');
 let current=await realpath(requested);
 for(const part of ['artifacts','agent-tasks',taskId,'portal','reports']){
  current=path.join(current,part);
  try{const stat=await lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())fail('report parents must be real directories');}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(!create)return null;await mkdir(current,{mode:0o700});}
 }
 return current;
}
async function regularBytes(file:string){
 const info=await lstat(file);if(info.isSymbolicLink()||!info.isFile()||info.size>MAX_STORED_BYTES)fail('stored report must be a regular bounded JSON file');
 const handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{if(!(await handle.stat()).isFile())fail('stored report must be regular');const bytes=await handle.readFile();if(bytes.length>MAX_STORED_BYTES)fail('stored report exceeds size limit');return bytes;}finally{await handle.close();}
}
async function stored(directory:string,id:string){
 if(!uuid.test(id))fail('invalid report ID');
 let e:Envelope;
 try{e=envelopeSchema.parse(JSON.parse((await regularBytes(path.join(directory,id+'.json'))).toString('utf8')));}
 catch{fail('stored report is missing, corrupt or unsafe');}
 if(e.id!==id)fail('stored report identity changed');
 const bytes=Buffer.from(e.base64,'base64');
 if(bytes.toString('base64')!==e.base64||sha(bytes)!==e.sha256)fail('stored report bytes changed');
 view(bytes,e);return {e,bytes};
}
export async function attachReport({repo,taskId,kind,name,bytes}:{repo:string;taskId:string;kind:'playwright'|'mutation';name:string;bytes:Buffer}):Promise<{id:string}>{
 if(!Buffer.isBuffer(bytes))fail('upload must contain JSON bytes');
 if(bytes.length===0||bytes.length>MAX_BYTES)fail('JSON must contain between 1 byte and 5 MiB');
 nameSchema.parse(name);
 const e:Envelope={version:1,id:randomUUID(),kind:z.enum(['playwright','mutation']).parse(kind),name,importedAt:new Date().toISOString(),sha256:sha(bytes),base64:bytes.toString('base64')};
 view(bytes,e); // Validate before creating private storage or copying bytes.
 const directory=(await reportsDirectory(repo,taskId,true))!;
 const marker=path.join(directory,'.gitignore');
 let previous='';try{previous=(await regularBytes(marker)).toString('utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(previous.trimEnd().split(/\r?\n/).at(-1)!=='*')await appendFile(marker,(previous&&!previous.endsWith('\n')?'\n':'')+'# Private imported report evidence\n*\n',{mode:0o600});
 await writeFile(path.join(directory,e.id+'.json'),JSON.stringify(e)+'\n',{flag:'wx',mode:0o600});
 return {id:e.id};
}
export async function readReports(repo:string,taskId:string):Promise<{tests:TestReportView[];mutations:MutationReportView[]}>{
 const directory=await reportsDirectory(repo,taskId);if(!directory)return {tests:[],mutations:[]};
 const tests:TestReportView[]=[],mutations:MutationReportView[]=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  if(!entry.name.endsWith('.json')||!uuid.test(entry.name.slice(0,-5)))continue;
  const {e,bytes}=await stored(directory,entry.name.slice(0,-5));
  const result=view(bytes,e);if(result.kind==='playwright')tests.push(result);else mutations.push(result);
 }
 const newest=(a:{importedAt:string;id:string},b:{importedAt:string;id:string})=>b.importedAt.localeCompare(a.importedAt)||a.id.localeCompare(b.id);
 return {tests:tests.sort(newest),mutations:mutations.sort(newest)};
}
export async function readReportFile(repo:string,taskId:string,reportId:string):Promise<{name:string;bytes:Buffer}>{
 if(!uuid.test(reportId))fail('invalid report ID');
 const directory=await reportsDirectory(repo,taskId);if(!directory)fail('report not found');
 const {e,bytes}=await stored(directory,reportId);return {name:e.name,bytes};
}
