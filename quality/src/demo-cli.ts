import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ROOT,digest} from './context.js';
import {loadConfig} from './mutation/schema.js';
import {freezeWorkload} from './mutation/workload.js';
import {healthy,treeHash,type Campaign} from './mutation/runner.js';
import {runProcess} from './mutation/process.js';
import {mutationTools} from './mutation/tools.js';
import {auditMcp,completeAssessment} from './demo/mcp-audit.js';
import {prepareTask} from './demo/task-context.js';
import {exportDemoMetrics} from './demo/platform.js';

const product=path.resolve(ROOT,'..');
const demo=path.join(product,'examples/validation-demo');
const task=path.join(product,'contexts/tasks/CRM-DEMO-001');
const outputRoot=path.join(product,'artifacts/validation-demo');
const require=createRequire(path.join(product,'package.json'));
const esc=(v:unknown)=>String(v??'Unavailable').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

async function prepare(){return prepareTask(path.join(demo,'task-template'),task,product);}

function matrix(campaign:Campaign){
 const fault=(id:string)=>campaign.faults.find(f=>f.requirementId===id);
 return [
  {criterion:'LOGIN-VALID',assessment:'supported',assertions:'tests/sample-crm.spec.ts → expectDashboardLoadedForRole',runtime:'Six-test browser run; admin sign-in passed'},
  {criterion:'LOGIN-INVALID',assessment:'supported',assertions:'tests/validation-login.spec.ts → invalid credentials, login page visible, dashboard absent',runtime:'Six-test browser run; invalid-password case passed'},
  {criterion:'VIEWER-READONLY',assessment:fault('VIEWER-READONLY')?.status==='killed'?'supported':'unknown',assertions:'sample-crm.spec.ts → expectViewerAccountsReadOnly',runtime:`Independent fault result: ${fault('VIEWER-READONLY')?.status}`},
  {criterion:'MANAGER-ACCESS',assessment:'supported',assertions:'sample-crm.spec.ts → expectManagerNavigationAccess',runtime:'Manager button-state and navigation checks passed'},
  {criterion:'LEAD-CREATE',assessment:'supported',assertions:'sample-crm.spec.ts → expectLeadValidationError / expectLeadCreated',runtime:'Sales case passed'},
  {criterion:'OPPORTUNITY-CREATE',assessment:'supported',assertions:'sample-crm.spec.ts → expectOpportunityCreated',runtime:'Manager case passed'},
  {criterion:'REPORT-RETRY',assessment:'supported',assertions:'sample-crm.spec.ts → expectManagerReportsRetryAccess / expectReportDownloadReady',runtime:'Manager case passed'},
  {criterion:'DASHBOARD-METRIC',assessment:fault('DASHBOARD-METRIC')?.status==='survived'?'missing assertion':'unknown',assertions:'Dashboard presence is checked; the $842k value is not asserted',runtime:`Independent fault result: ${fault('DASHBOARD-METRIC')?.status}`}
 ];
}

async function verify(args:string[]){
 if(Number(process.versions.node.split('.')[0])!==22)throw Error('Full demo verification requires Node 22 for the optional native Code Mode integration. Select Node 22 and rerun; no runtime is installed automatically.');
 const prepared=await prepare();
 const run=path.join(outputRoot,`run-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
 await mkdir(run,{recursive:true});
 let sourceBefore=await treeHash(product);
 const c=await loadConfig(path.join(demo,'mutation.config.json'));
 c.output=path.join(run,'mutations');
 const configFile=path.join(run,'mutation.config.json');await writeFile(configFile,JSON.stringify(c,null,2));
 const events:unknown[]=[];
 const summary:any={version:1,scope:'synthetic CRM demonstration',createdAt:new Date().toISOString(),node:process.version,platform:`${process.platform}/${process.arch}`,corePassed:false,productAccepted:false,runDirectory:run,inputs:prepared.files,sourceHash:sourceBefore,events,live:{codex:'skipped',laya:'skipped'}};
 try{
  try{summary.sourceRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:product,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();summary.dirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:product,encoding:'utf8'}).trim());}catch{summary.sourceRevision=null;summary.dirty=null;}
  const graphCommand=[path.join(product,'scripts/validation-graphs.mjs'),'--output-dir',path.join(run,'graphs')];
  const graphResult=await runProcess(process.execPath,graphCommand,product,{...process.env},120000);
  await writeFile(path.join(run,'graph-command.log'),graphResult.stdout+'\n'+graphResult.stderr);
  events.push({transport:'native-terminal',tool:'source/test/coverage graphs',command:['node',...graphCommand],exitCode:graphResult.code,wallMs:graphResult.wallMs,evidence:'graph-command.log',status:graphResult.code===0?'passed':'failed'});
  if(graphResult.code!==0||graphResult.timedOut)throw Error('Graph pipeline failed; inspect graph-command.log');
  summary.graphs=JSON.parse(await readFile(path.join(run,'graphs/manifest.json'),'utf8'));
  // Graph files are generated outputs. Freeze the source snapshot after that stage.
  sourceBefore=await treeHash(product);summary.sourceHash=sourceBefore;
  const cli=require.resolve('@playwright/test/cli');
  const command=[cli,'test','--config',path.join(demo,'playwright.config.ts')];
  const browserDir=path.join(run,'browser');
  const result=await runProcess(process.execPath,command,product,{...process.env,DEMO_EVIDENCE_DIR:browserDir},240000);
  await writeFile(path.join(run,'browser-command.log'),result.stdout+'\n'+result.stderr);
  events.push({transport:'native-terminal',tool:'Playwright Test',command:['node',...command],exitCode:result.code,wallMs:result.wallMs,evidence:'browser-command.log',status:result.code===0?'passed':'failed'});
  const browser=JSON.parse(await readFile(path.join(browserDir,'results.json'),'utf8'));
  summary.browser=browser.stats;
  if(result.code!==0||result.timedOut||browser.stats.expected!==6||browser.stats.unexpected!==0||browser.stats.skipped!==0)throw Error('Demo requires exactly six passed CRM tests with zero skips. Inspect browser-command.log.');
  const frozen=await freezeWorkload(c,path.join(demo,'fault-catalogue.json'));
  await writeFile(path.join(c.output,'plan.json'),JSON.stringify(frozen.workload.plan,null,2));
  summary.workload={file:frozen.file,hash:frozen.workload.hash,pairs:frozen.workload.pairs.length,contextHash:frozen.workload.context.hash};
  const audit=await auditMcp({configFile,workloadFile:frozen.file,outputDir:run,node:process.execPath});
  const campaign=JSON.parse(await readFile(path.join(audit.campaignDir,'campaign.json'),'utf8')) as Campaign;
  summary.mcp={checks:audit.checks,events:audit.events};
  summary.campaign={dir:audit.campaignDir,runId:campaign.runId,baseline:campaign.baseline.map(b=>({status:b.status,tests:b.tests.length})),restored:campaign.restored?.status,originalUnchanged:campaign.originalUnchanged,faults:campaign.faults};
  if(campaign.baseline.length!==2||!campaign.baseline.every(healthy)||!campaign.restored||!healthy(campaign.restored)||!campaign.originalUnchanged)throw Error('Mutation baseline, restoration or original-source checks failed');
  const expected=new Map([['VIEWER-READONLY-OFF','killed'],['DASHBOARD-METRIC-ZERO','survived']]);
  if(campaign.faults.length!==2||campaign.faults.some(f=>f.status!==expected.get(f.id)||f.attempts.length!==2))throw Error('Actual fault outcomes differ from the authored demonstration; inspect the campaign instead of changing expected evidence');
  summary.matrix=matrix(campaign);
  summary.corePassed=true;
  summary.productAccepted=false;
  summary.acceptanceNote='Demo verification passed. Synthetic requirements are not fully accepted: the dashboard metric has a demonstrated missing assertion.';
  for(const [flag,name] of [['--live-codex','codex'],['--live-laya','laya']] as const){
   if(!args.includes(flag))continue;
   const liveOutput=path.join(run,`live-${name}`);await mkdir(liveOutput,{recursive:true});
   const tools=mutationTools({...c,output:liveOutput},{allowHosted:name==='codex'});
   try{
    if(name==='laya')await writeFile(path.join(liveOutput,'plan.json'),JSON.stringify(frozen.workload.plan,null,2));
    const value=await (name==='codex'?tools.plan():tools.assess());
    await writeFile(path.join(liveOutput,'receipt.json'),JSON.stringify(value,null,2));summary.live[name]=name==='laya'&&!completeAssessment(value as {pairs?:unknown;completed?:unknown;excluded?:unknown})?'incomplete':'passed';
   }catch{summary.live[name]='failed';}
  }
  summary.sourceUnchanged=sourceBefore===await treeHash(product);
  if(!summary.sourceUnchanged)throw Error('Original source changed during verification; evidence requires review');
  const {chromium}=require('@playwright/test');const browserInstance=await chromium.launch({headless:true});
  try{const page=await browserInstance.newPage({viewport:{width:1440,height:1000}});await page.goto(pathToFileURL(path.join(audit.campaignDir,'index.html')).href);await page.screenshot({path:path.join(run,'mutation-report.png'),fullPage:true});}finally{await browserInstance.close();}
 }catch(e){summary.corePassed=false;summary.error=e instanceof Error?e.message:'Demo failed';process.exitCode=1;}
 finally{
  summary.passed=summary.corePassed&&Object.values(summary.live).every(value=>value==='passed'||value==='skipped');
  await writeFile(path.join(run,'summary.json'),JSON.stringify(summary,null,2));
  const rows=(summary.matrix??[]).map((m:any)=>`| ${m.criterion} | ${m.assessment} | ${m.assertions} | ${m.runtime} |`).join('\n');
  await writeFile(path.join(run,'acceptance-report.md'),`# Playwright Agent demo evidence\n\nScope: authored synthetic CRM requirements.\n\nDemo verification: ${summary.corePassed?'passed':'failed'}. Product acceptance: incomplete; do not equate a green suite with full coverage.\n\n${summary.acceptanceNote??summary.error??''}\n\n| Criterion | Assessment | Assertion evidence | Runtime evidence |\n| --- | --- | --- | --- |\n${rows}\n\n## Provenance\n\nNode ${process.version}; ${process.platform}/${process.arch}. Source revision ${summary.sourceRevision??'unavailable'}, dirty ${summary.dirty??'unknown'}. Input and source hashes are in summary.json.\n\nSource/test/coverage graphs and freshness receipts are in graphs/index.html and graphs/manifest.json. Static graph coverage is heuristic, not observed acceptance.\n\nNative-terminal receipts record executed verification commands, not every host coding-agent interaction. The invalid-login source diff is the authoring artifact.\n\nLive Codex: ${summary.live.codex}; live Laya: ${summary.live.laya}. Skipped providers are not verified live. No accuracy, cost, token-saving or production-quality claim is made.\n`);
  const campaignLink=summary.campaign?path.relative(run,path.join(summary.campaign.dir,'index.html')):'';
  await writeFile(path.join(run,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Playwright Agent validation</title><style>body{font:16px system-ui;max-width:1200px;margin:40px auto;padding:0 20px;color:#183044}table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #ddd;text-align:left}p{line-height:1.5}pre{white-space:pre-wrap}aside{background:#fff1cf;padding:20px}</style><h1>From ticket to observed evidence</h1><p>Synthetic CRM demonstration · ${esc(summary.createdAt)}</p><aside>${esc(summary.acceptanceNote??summary.error)}</aside><p>Browser: ${esc(summary.browser?.expected)} passed / ${esc(summary.browser?.skipped)} skipped. Demo verification: ${summary.corePassed?'passed':'failed'}.</p><table><thead><tr><th>Criterion</th><th>Assessment</th><th>Evidence</th></tr></thead><tbody>${(summary.matrix??[]).map((m:any)=>`<tr><td>${esc(m.criterion)}</td><td>${esc(m.assessment)}</td><td>${esc(m.assertions)}<br>${esc(m.runtime)}</td></tr>`).join('')}</tbody></table><p><a href="${esc(campaignLink)}">Inspect mutation patches, independent observations and repeated assertion outcomes</a> · <a href="graphs/index.html">Source/test/coverage graphs</a> · <a href="mcp-audit.json">Tool audit</a> · <a href="summary.json">Full verification receipt</a></p><details><summary>Provenance and limits</summary><pre>${esc(JSON.stringify({sourceRevision:summary.sourceRevision,sourceHash:summary.sourceHash,node:summary.node,platform:summary.platform,live:summary.live},null,2))}</pre><p>Two authored faults are illustrative. Model predictions, protocol checks and browser execution are separate evidence.</p></details></html>`);
  await writeFile(path.join(outputRoot,'latest.json'),JSON.stringify({runDirectory:run,passed:summary.passed},null,2));
  console.log(JSON.stringify({passed:summary.passed,runDirectory:run,summary:path.join(run,'summary.json'),error:summary.error??null},null,2));
  if(!summary.passed)process.exitCode=summary.corePassed?2:1;
 }
}

async function main(){
 const [command,...args]=process.argv.slice(2);
 if(command==='prepare')console.log(JSON.stringify(await prepare(),null,2));
 else if(command==='verify')await verify(args);
 else if(command==='export'){
  const flags:Record<string,string>={};
  while(args.length){
   const key=args.shift()!;
   if(!['--evidence','--output','--policy'].includes(key)||Object.hasOwn(flags,key))throw Error('Use demo export --evidence RUN_DIRECTORY --output PREPARED.json [--policy POLICY.json]. Export never publishes.');
   const value=args.shift();if(!value||value.startsWith('--'))throw Error('Demo export requires a value for '+key);
   flags[key]=value;
  }
  if(!flags['--evidence']||!flags['--output'])throw Error('Demo export requires --evidence and --output.');
  console.log(JSON.stringify(await exportDemoMetrics({evidenceDir:path.resolve(flags['--evidence']),outputFile:path.resolve(flags['--output']),policyFile:path.resolve(flags['--policy']??path.join(demo,'platform-policy.json'))}),null,2));
 }
 else throw Error('Use demo prepare, demo verify [--live-codex] [--live-laya], or demo export --evidence RUN_DIRECTORY --output PREPARED.json');
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Demo failed');process.exitCode=1;});
