import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {prepareIntake} from '../src/intake/store.js';

const cli=fileURLToPath(new URL('../src/portal-cli.ts',import.meta.url));
const loader=pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const exec=promisify(execFile);
const run=(args:string[],cwd?:string)=>exec(process.execPath,['--import',loader,cli,...args],{cwd,maxBuffer:1024*1024});

test('viewer help describes final read-only reports and native artifact preparation',async()=>{
 const {stdout}=await run(['--help']);
 assert.match(stdout,/local report viewer/);assert.match(stdout,/browser is read-only/);
 assert.match(stdout,/analysis --repo/);assert.match(stdout,/attach --repo/);
 assert.doesNotMatch(stdout,/--allow-run|--run-config|--python/);
});

test('retired portal operation flags fail clearly before accessing a target project',async()=>{
 for(const flag of ['--allow-run','--run-config','--python']){
  await assert.rejects(run(['serve','--repo','missing-project',flag,'unused']),error=>{
   assert.match((error as {stderr:string}).stderr,/read-only report viewer/);return true;
  });
 }
 await assert.rejects(run(['serve','--repo','.','--port','0']),/Command failed/);
});

test('analysis CLI records caller-relative findings for the exact existing intake without approval or execution',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'viewer CLI project with spaces-')),repo=path.join(root,'project');
 t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(repo);
 const source=path.join(root,'requirements.json');
 await writeFile(source,JSON.stringify({version:1,requirements:[{id:'LOGIN-1',criterion:'Invalid passwords display a visible error.',journey:'login',critical:true}]}));
 const prepared=await prepareIntake({repo,task:'LOGIN-1',files:[source],goal:'assess'});
 await writeFile(path.join(root,'analysis.md'),'# Assessment\n\nRuntime not run; existing assertion needs review.');
 const {stdout}=await run(['analysis','--repo','project','--task','LOGIN-1','--run',path.basename(prepared.run),'--file','analysis.md'],root);
 const result=JSON.parse(stdout);assert.equal(result.accepted,false);assert.equal(result.executed,false);
 const recorded=JSON.parse(await readFile(path.join(prepared.run,'agent-analysis.json'),'utf8'));
 assert.match(recorded.text,/Runtime not run/);
});
