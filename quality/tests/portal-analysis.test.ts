import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT} from '../src/context.js';
import {prepareIntake,inspectIntake,saveIntakeDraft} from '../src/intake/store.js';
import {readAgentAnalysis,recordAgentAnalysis} from '../src/portal/analysis.js';

const bundled=path.join(ROOT,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
const python=existsSync(bundled)?bundled:process.platform==='win32'?'python':'python3';
async function fixture(t:{after:(f:()=>Promise<void>)=>void}){
 const root=await mkdtemp(path.join(os.tmpdir(),'portal analysis with spaces-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const repo=path.join(root,'project');await mkdir(repo);
 const source=path.join(root,'ticket.json');await writeFile(source,JSON.stringify({version:1,requirements:[{id:'AC1',criterion:'Invalid passwords show a visible credential error.',journey:'login',critical:true}]}));
 const prepared=await prepareIntake({repo,task:'LOGIN-123',files:[source],python});
 const current=await inspectIntake({run:prepared.run}),identity={intakeHash:current.snapshot.intakeHash,draftHash:current.draftHash};
 const file=path.join(root,'assessment.md');await writeFile(file,'# Draft assessment\n\nAC1: assertion missing; execution not run.');
 return {root,repo,prepared,current,identity,file};
}
test('host-agent analysis is linked to the exact intake/draft without accepting or executing',async t=>{
 const f=await fixture(t);assert.equal(await readAgentAnalysis(f.prepared.run,f.identity),undefined);
 const result=await recordAgentAnalysis({run:f.prepared.run,file:f.file});assert.equal(result.accepted,false);assert.equal(result.executed,false);
 const analysis=await readAgentAnalysis(f.prepared.run,f.identity);assert.equal(analysis!.stale,false);assert.match(analysis!.text,/assertion missing/);
 const current=await inspectIntake({run:f.prepared.run});assert.equal(current.accepted,false);assert.equal(current.reviewed,false);
 const draft=structuredClone(current.draft);draft.requirements[0].criterion='Invalid passwords retain a visible credential error.';
 await saveIntakeDraft({run:f.prepared.run,draft});
 const changed=await inspectIntake({run:f.prepared.run});assert.equal((await readAgentAnalysis(f.prepared.run,{intakeHash:f.identity.intakeHash,draftHash:changed.draftHash}))!.stale,true);
 assert.equal((await readAgentAnalysis(f.prepared.run,{...f.identity,stale:true}))!.stale,true);
});
test('empty, oversized, malformed and linked agent findings are refused without changing a valid record',async t=>{
 const f=await fixture(t);await recordAgentAnalysis({run:f.prepared.run,file:f.file});
 const target=path.join(f.prepared.run,'agent-analysis.json'),before=await readFile(target);
 for(const bytes of [Buffer.from('   '),Buffer.alloc(128*1024+1),Buffer.from([0xff,0xfe])]){
  await writeFile(f.file,bytes);await assert.rejects(recordAgentAnalysis({run:f.prepared.run,file:f.file}));assert.deepEqual(await readFile(target),before);
 }
 const link=path.join(f.root,'linked.md');await symlink(f.file,link);await assert.rejects(recordAgentAnalysis({run:f.prepared.run,file:link}),/regular/);
 const tampered=JSON.parse(before.toString());tampered.text='Changed findings';await writeFile(target,JSON.stringify(tampered));await assert.rejects(readAgentAnalysis(f.prepared.run,f.identity),/changed/);
 await rm(target);await symlink(f.file,target);await assert.rejects(readAgentAnalysis(f.prepared.run,f.identity),/regular/);
});
