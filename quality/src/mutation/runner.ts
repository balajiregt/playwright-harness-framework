import {cp,readFile,writeFile,mkdir,mkdtemp,rm,symlink,lstat,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {ROOT,digest} from '../context.js';
import {insideRepo} from '../team/config.js';
import {type MutationConfig,type MutationPlan,type Mutant} from './schema.js';
import {loadContext,validatePlan} from './context.js';
import {runProcess} from './process.js';
import {saveMutationReport} from './report.js';

export interface Execution {status:string;errors:number;tests:{id:string;title:string;file:string;line:number;project:string;expectedStatus:string;results:{status:string;retry:number;durationMs:number;assertionFailure:boolean;errors:string[]}[]}[];wallMs:number}
export interface FaultResult {id:string;requirementId:string;status:'killed'|'survived'|'not_activated'|'invalid_mutation'|'inconclusive'|'not_run';reason?:string;baselineProbe?:string;mutantProbe?:string;probeScreenshots?:{baseline?:string;mutant?:string};attempts:Execution[];killingTests:string[]}
export interface Campaign {version:1;kind:'playwright-behavioral-mutations';runId:string;createdAt:string;contextHash:string;repositoryHash?:string;planHash?:string;scopeHash?:string;plan:MutationPlan;baseline:Execution[];restored:Execution|null;faults:FaultResult[];originalUnchanged:boolean;assessments?:unknown;wallMs:number}
const excluded=new Set(['node_modules','artifacts','test-results','playwright-report','output','dist','build','coverage','__pycache__']);
export async function isolatedCopy(repo:string,destination:string){
 let bytes=0,files=0;
 const relative=path.relative(path.resolve(repo),path.resolve(destination));
 const inside=relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
 if(!relative||inside&&!excluded.has(relative.split(path.sep)[0]))throw Error('An in-project copy must be inside an excluded artifact directory');
 const filter=async(source:string)=>{
  const name=path.basename(source);
  if(name.startsWith('.')||excluded.has(name)||/\.(pem|key|p12)$/i.test(name))return false;
  const info=await lstat(source);if(info.isSymbolicLink())throw Error('Repository symlinks are not copied; use a standalone local checkout');
  if(info.isFile()){bytes+=info.size;files++;if(bytes>30*1024*1024||files>2000)throw Error('Isolated copy exceeds 30 MiB / 2000 files; use a smaller app checkout');}
  return true;
 };
 // fs.cp rejects repo -> repo/artifacts/tmp even when artifacts is filtered out.
 // Copy permitted root entries separately so that the excluded job directory is never traversed.
 await mkdir(destination,{recursive:true});
 for(const entry of await readdir(repo)){
  if(entry.startsWith('.')||excluded.has(entry)||/\.(pem|key|p12)$/i.test(entry))continue;
  await cp(path.join(repo,entry),path.join(destination,entry),{recursive:true,filter});
 }
 await symlink(path.join(repo,'node_modules'),path.join(destination,'node_modules'),'dir');
}
export async function treeHash(root:string):Promise<string>{
 const entries:string[]=[];
 async function walk(dir:string){for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  if(e.name.startsWith('.')||excluded.has(e.name))continue;
  const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.isFile())entries.push(path.relative(root,p)+':'+digest((await readFile(p)).toString('base64')));
 }}await walk(root);return digest(JSON.stringify(entries));
}
const testKey=(t:Execution['tests'][number])=>JSON.stringify([t.project,t.title]);
export function healthy(e:Execution){return e.status==='passed'&&e.errors===0&&e.tests.some(t=>t.expectedStatus==='passed')&&e.tests.every(t=>t.expectedStatus==='skipped'?t.results.every(r=>r.status==='skipped'):t.expectedStatus==='passed'&&t.results.length===1&&t.results[0].status==='passed');}
export function classify(attempts:Execution[],baseline:Execution):Pick<FaultResult,'status'|'reason'|'killingTests'>{
 if(!healthy(baseline))return {status:'inconclusive',reason:'Baseline has no healthy executed assertions',killingTests:[]};
 const tests=baseline.tests.filter(t=>t.expectedStatus==='passed'),keys=new Set(baseline.tests.map(testKey));
 if(attempts.length!==2||attempts.some(e=>e.errors||!['passed','failed'].includes(e.status)||e.tests.length!==baseline.tests.length||e.tests.some(t=>!keys.has(testKey(t)))||e.tests.some(t=>t.results.length!==1||!['passed','failed','skipped'].includes(t.results[0].status))))return {status:'inconclusive',reason:'Incomplete, interrupted, timeout or infrastructure execution',killingTests:[]};
 const killed=attempts.map(e=>new Set(e.tests.filter(t=>t.results[0].status==='failed'&&t.results[0].assertionFailure).map(testKey)));
 const stable=tests.filter(t=>killed.every(s=>s.has(testKey(t)))).map(t=>t.title);
 if(stable.length)return {status:'killed',killingTests:stable};
 if(attempts.every(healthy))return {status:'survived',killingTests:[]};
 return {status:'inconclusive',reason:'No repeatable assertion failure; inspect failure evidence',killingTests:[]};
}
async function writeHarness(copy:string,c:MutationConfig){
 const dir=path.join(copy,'.decision-mutation');await mkdir(dir);
 const importConfig='../'+c.playwrightConfig.replace(/\\/g,'/');
 const common=`import original from ${JSON.stringify(importConfig)};\nconst servers=original.webServer?(Array.isArray(original.webServer)?original.webServer:[original.webServer]).map(s=>({...s,reuseExistingServer:false})):undefined;\n`;
 const settings=`webServer:servers,retries:0,workers:2,timeout:${c.testTimeoutMs},expect:{...original.expect,timeout:Math.min(original.expect?.timeout??3000,${c.testTimeoutMs}-500)},use:{...original.use,trace:'off',screenshot:'off',video:'off'},reporter:${JSON.stringify(path.join(ROOT,'scripts/mutation-reporter.cjs'))}`;
 // Resolve original testDir at runtime; no assumed test folder in external repositories.
 await writeFile(path.join(dir,'suite.config.ts'),common+`import path from 'node:path';\nexport default {...original,testDir:path.resolve(${JSON.stringify(path.dirname(path.join(copy,c.playwrightConfig)))},original.testDir??'.'),${settings}};`);
 await writeFile(path.join(dir,'probe.config.ts'),common+`export default {...original,testDir:${JSON.stringify(dir)},testMatch:'probe.spec.ts',${settings}};`);
}
async function execute(copy:string,c:MutationConfig,file:string,out:string,project?:string):Promise<Execution>{
 const cli=createRequire(path.join(copy,'package.json')).resolve('@playwright/test/cli');
 const env={...process.env,...c.env,CI:'1',MUTATION_RESULT_FILE:out};
 const result=await runProcess(process.execPath,[cli,'test','--config',path.join(copy,'.decision-mutation',file),...(project?[`--project=${project}`]:c.projects.map(p=>`--project=${p}`))],copy,env,c.suiteTimeoutMs);
 try{const execution=JSON.parse(await readFile(out,'utf8')) as Execution;execution.wallMs=result.wallMs;if(result.timedOut)execution.status='timedout';if(result.code!==0&&execution.status==='passed')execution.status='runner_error';return execution;}
 catch{return {status:result.timedOut?'timedout':'runner_error',errors:1,tests:[],wallMs:result.wallMs};}
}
async function probe(copy:string,c:MutationConfig,m:Mutant,out:string):Promise<{execution:Execution;actual?:string}>{
 const setup=c.probeSetup?`import {${c.probeSetup.export} as setup} from ${JSON.stringify('../'+c.probeSetup.module.replace(/\\/g,'/'))};`:'';
 const code=`import {test,expect} from '@playwright/test';import {writeFileSync} from 'node:fs';${setup}
test('independent requirement observation',async({page})=>{
 ${c.probeSetup?`await setup(page,${JSON.stringify(m.probe.roles)});`:''}
 await page.goto(${JSON.stringify(m.probe.path)});
 ${c.readiness?`await expect(page.getByTestId(${JSON.stringify(c.readiness.testId)})).toHaveText(${JSON.stringify(c.readiness.text)});`:''}
 const locator=page.getByTestId(${JSON.stringify(m.probe.testId)});
 const actual=${m.probe.kind==='count'?"String(await locator.count())":"await locator.textContent()"};
 writeFileSync(${JSON.stringify(out+'.observation')},JSON.stringify({actual}));
 ${c.captureEvidence?`await page.screenshot({path:${JSON.stringify(out+'.png')},fullPage:true});`:''}});`;
 await writeFile(path.join(copy,'.decision-mutation','probe.spec.ts'),code);
 const execution=await execute(copy,c,'probe.config.ts',out,m.probe.project);
 let actual;try{actual=JSON.parse(await readFile(out+'.observation','utf8')).actual;}catch{}
 return {execution,actual:typeof actual==='string'?actual:undefined};
}
export async function runCampaign(c:MutationConfig,input:unknown,assessments?:unknown){
 const start=performance.now(),context=await loadContext(c),plan=validatePlan(input,context,c),before=await treeHash(c.repo);
 const {executionScopeHash}=await import('./workload.js');
 const report:Campaign={version:1,kind:'playwright-behavioral-mutations',runId:randomUUID(),createdAt:new Date().toISOString(),contextHash:context.hash,repositoryHash:before,planHash:digest(JSON.stringify(plan)),scopeHash:executionScopeHash(c),plan,baseline:[],restored:null,faults:plan.mutations.map(m=>({id:m.id,requirementId:m.requirementId,status:'not_run',attempts:[],killingTests:[]})),originalUnchanged:false,assessments,wallMs:0};
 const dir=path.join(c.output,report.runId);await mkdir(dir,{recursive:true});
 const temp=await mkdtemp(path.join(os.tmpdir(),'playwright-mutations-')),copy=path.join(temp,'repo');
 try{
  await isolatedCopy(c.repo,copy);await writeHarness(copy,c);
  for(let n=0;n<c.baselineRuns;n++)report.baseline.push(await execute(copy,c,'suite.config.ts',path.join(dir,`baseline-${n}.json`)));
  if(!report.baseline.every(healthy)){for(const fault of report.faults)fault.reason='Baseline is not consistently green; no faults executed';return {dir,report};}
  for(const m of plan.mutations){
   const result=report.faults.find(f=>f.id===m.id)!;console.log(`Mutation ${m.id}`);
   const file=await insideRepo(copy,m.file),original=await readFile(file,'utf8');
   try{
    const normal=await probe(copy,c,m,path.join(dir,`${m.id}-baseline-probe.json`));result.baselineProbe=normal.actual;
    if(c.captureEvidence&&healthy(normal.execution))result.probeScreenshots={baseline:`${m.id}-baseline-probe.json.png`};
    if(!healthy(normal.execution)||normal.actual!==m.probe.expected){result.status='inconclusive';result.reason='Independent probe does not establish baseline requirement';continue;}
    const modified=original.replace(m.before,m.after);
    if(/\.[cm]?[jt]sx?$/.test(file)){
     const sf=ts.createSourceFile(file,modified,ts.ScriptTarget.Latest,true);
     if((sf as ts.SourceFile&{parseDiagnostics:unknown[]}).parseDiagnostics.length){result.status='invalid_mutation';result.reason='Mutation does not parse';continue;}
    }
    await writeFile(file,modified);
    const changed=await probe(copy,c,m,path.join(dir,`${m.id}-mutant-probe.json`));result.mutantProbe=changed.actual;
    if(c.captureEvidence&&healthy(changed.execution))result.probeScreenshots={...result.probeScreenshots,mutant:`${m.id}-mutant-probe.json.png`};
    if(!healthy(changed.execution)){result.status='inconclusive';result.reason='Mutant probe could not reach a healthy observable state';continue;}
    if(changed.actual===undefined||changed.actual===normal.actual){result.status='not_activated';result.reason='Fault did not change the independently observed behavior';continue;}
    for(let n=0;n<2;n++)result.attempts.push(await execute(copy,c,'suite.config.ts',path.join(dir,`${m.id}-attempt-${n}.json`)));
    Object.assign(result,classify(result.attempts,report.baseline[0]));
   }finally{await writeFile(file,original);await saveMutationReport(dir,report);}
  }
  report.restored=await execute(copy,c,'suite.config.ts',path.join(dir,'restored.json'));
  if(!healthy(report.restored))for(const f of report.faults)if(['killed','survived'].includes(f.status)){f.status='inconclusive';f.reason='Restored baseline failed';}
  return {dir,report};
 }finally{
  report.originalUnchanged=before===await treeHash(c.repo);report.wallMs=performance.now()-start;
  await saveMutationReport(dir,report);await rm(temp,{recursive:true,force:true});
  if(!report.originalUnchanged)throw Error('Original repository changed during the campaign; results need review');
 }
}
