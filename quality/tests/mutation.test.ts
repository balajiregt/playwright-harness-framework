import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,rename} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ROOT} from '../src/context.js';
import {configSchema} from '../src/mutation/schema.js';
import {loadContext,validatePlan} from '../src/mutation/context.js';
import {classify,healthy,isolatedCopy,treeHash,type Execution,type Campaign} from '../src/mutation/runner.js';
import {campaignMetrics,renderMutationReport,predictionResults} from '../src/mutation/report.js';
import {planningPrompt} from '../src/mutation/codex.js';
async function fixture(){
 const dir=await mkdtemp(path.join(os.tmpdir(),'mutation-unit-'));await mkdir(path.join(dir,'context'));await mkdir(path.join(dir,'repo'));
 await writeFile(path.join(dir,'context/epic.md'),'A viewer must not see the admin action.');
 await writeFile(path.join(dir,'repo/app.js'),'const admin = false;');await mkdir(path.join(dir,'repo/node_modules'));await writeFile(path.join(dir,'repo/.env.local'),'PRIVATE_SENTINEL');
 const c=configSchema.parse({version:1,repo:path.join(dir,'repo'),artifactDir:path.join(dir,'context'),sourceFiles:['app.js'],output:path.join(dir,'results')});
 const ctx=await loadContext(c),plan={version:1 as const,contextHash:ctx.hash,requirements:[{id:'AUTH',criterion:'A viewer must not see the admin action.',critical:true,source:{artifactId:ctx.artifacts[0].id,quote:'A viewer must not see the admin action.'}}],mutations:[{id:'M1',requirementId:'AUTH',description:'Expose the admin action.',file:'app.js',before:'const admin = false;',after:'const admin = true;',probe:{project:'viewer',path:'/',testId:'admin',kind:'count' as const,expected:'0',roles:[]}}]};
 return {dir,c,ctx,plan};
}
const execution=(status='passed',assertionFailure=false):Execution=>({status:status==='passed'?'passed':'failed',errors:0,wallMs:5,tests:[{id:'t',title:'viewer › admin absent',file:'test.spec.ts',line:1,project:'viewer',expectedStatus:'passed',results:[{status,retry:0,durationMs:5,assertionFailure,errors:[]}]}]});
test('artifact context retains complete passive text, exact source quotes and stale input binding',async()=>{
 const f=await fixture();try{
  validatePlan(f.plan,f.ctx,f.c);assert.ok(!JSON.stringify(f.ctx).includes('PRIVATE_SENTINEL'));
  assert.throws(()=>validatePlan({...f.plan,contextHash:'0'.repeat(64)},f.ctx,f.c),/stale/);
  assert.throws(()=>validatePlan({...f.plan,requirements:[{...f.plan.requirements[0],source:{...f.plan.requirements[0].source,quote:'Invented criterion'}}]},f.ctx,f.c),/quote/);
  await writeFile(path.join(f.c.artifactDir,'other.pdf'),'unreadable');await assert.rejects(loadContext({...f.c,python:'/missing/python'}),/Cannot extract/);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('selected project task folder supplies epic and ticket evidence with input-bound freshness',async()=>{
 const f=await fixture();try{
  const taskDir=path.join(f.c.repo,'contexts/tasks/LOGIN-123');
  await mkdir(path.dirname(taskDir),{recursive:true});await rename(f.c.artifactDir,taskDir);
  await writeFile(path.join(taskDir,'README.md'),'Epic: signed-in viewers must retain read-only access.');
  await writeFile(path.join(taskDir,'ticket.json'),JSON.stringify({id:'LOGIN-123',summary:'Review viewer access.'}));
  const config={...f.c,artifactDir:taskDir},context=await loadContext(config);
  assert.deepEqual(context.artifacts.map(a=>a.file).sort(),['README.md','epic.md','ticket.json']);
  assert.ok(context.artifacts.some(a=>a.text.includes('retain read-only access')));
  const plan={...f.plan,contextHash:context.hash};validatePlan(plan,context,config);
  await writeFile(path.join(taskDir,'README.md'),'Epic: changed acceptance criteria.');
  const changed=await loadContext(config);assert.notEqual(changed.hash,context.hash);
  assert.throws(()=>validatePlan(plan,changed,config),/stale/);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('mutation plan rejects test edits, ambiguous replacements, duplicate faults and external probe navigation',async()=>{
 const f=await fixture();try{
  for(const change of [{file:'tests/role.spec.ts'},{before:'absent'},{after:f.plan.mutations[0].before},{probe:{...f.plan.mutations[0].probe,path:'//external.example'}}])assert.throws(()=>validatePlan({...f.plan,mutations:[{...f.plan.mutations[0],...change}]},f.ctx,f.c));
  assert.throws(()=>validatePlan({...f.plan,mutations:[f.plan.mutations[0],{...f.plan.mutations[0],id:'M2'}]},f.ctx,f.c),/Duplicate behavioral/);
  assert.ok(planningPrompt(f.ctx,f.c).includes('Do not use tools'));
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('isolated copy omits credentials and artifacts and preserves original source on mutation',async()=>{
 const f=await fixture();try{
  const before=await treeHash(f.c.repo),destination=path.join(f.dir,'copy');await isolatedCopy(f.c.repo,destination);
  await assert.rejects(readFile(path.join(destination,'.env.local')));
  await writeFile(path.join(destination,'app.js'),'const admin = true;');assert.equal(await treeHash(f.c.repo),before);
  await symlink('/tmp',path.join(f.c.repo,'unsafe'));await assert.rejects(isolatedCopy(f.c.repo,path.join(f.dir,'copy2')),/symlink/);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('runtime detection needs two complete repeatable assertion failures; startup, timeout and unstable results remain unknown',()=>{
 const base=execution(),failure=execution('failed',true);assert.ok(healthy(base));
 assert.equal(classify([failure,failure],base).status,'killed');
 assert.equal(classify([base,base],base).status,'survived');
 for(const attempts of [[failure,base],[execution('failed'),execution('failed')],[execution('timedOut',true),failure],[{...failure,errors:1},failure],[{...failure,tests:[]},failure]])assert.equal(classify(attempts,base).status,'inconclusive');
 assert.equal(healthy({...base,tests:[]}),false);
});
test('reports keep unactivated faults outside score denominators and escape artifact/code content',async()=>{
 const f=await fixture();try{
  const r:Campaign={version:1,kind:'playwright-behavioral-mutations',runId:'fixture',createdAt:new Date().toISOString(),contextHash:f.ctx.hash,plan:f.plan,baseline:[execution(),execution()],restored:execution(),faults:[{id:'M1',requirementId:'AUTH',status:'not_activated',attempts:[],killingTests:[]}],wallMs:5,originalUnchanged:true};
  assert.equal(campaignMetrics(r).observedDetectionRate,null);r.plan.requirements[0].criterion='<img src=x onerror=alert(1)>';const html=renderMutationReport(r);assert.ok(!html.includes('<img src=x'));assert.match(html,/not_activated/);
  r.faults[0].status='survived';r.faults[0].attempts=[execution(),execution()];
  r.assessments={version:1,cells:[{mutationId:'M1',project:'viewer',testTitle:'admin absent',testFile:'test.spec.ts',status:'evaluated',answer:{label:'detected'}}]};
  r.faults[0].attempts.forEach(e=>e.tests[0].file='/isolated/test.spec.ts');
  assert.equal(predictionResults(r)[0].observed,'missed');assert.equal(campaignMetrics(r).laya!.predictionMatchRate,0);
  r.faults[0].status='inconclusive';assert.equal(campaignMetrics(r).laya!.predictionMatchRate,null);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('actual MCP server exposes context with execution and hosted planning disabled by default',async()=>{
 const f=await fixture(),config=path.join(f.dir,'config.json');await writeFile(config,JSON.stringify(f.c));
 const client=new Client({name:'mutation-integration-test',version:'1.0.0'}),transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',path.join(ROOT,'src/mutation-cli.ts'),'mcp','--config',config],cwd:ROOT,stderr:'pipe'});
 try{
  await client.connect(transport);const listed=await client.listTools();assert.deepEqual(listed.tools.map(t=>t.name).sort(),['assess','context','evidence','inspect']);
  const result=await client.callTool({name:'context',arguments:{}});assert.match(JSON.stringify(result),new RegExp(f.ctx.hash));assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
 }finally{await client.close();await rm(f.dir,{recursive:true,force:true});}
});
