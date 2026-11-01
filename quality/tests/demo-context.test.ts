import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,realpath,symlink,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {prepareTask} from '../src/demo/task-context.js';
import {completeAssessment} from '../src/demo/mcp-audit.js';

const documents={'epic.md':'# Synthetic epic\n','jira-tickets.json':'{"tickets":[]}\n','requirements.json':'{"requirements":[]}\n'};
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'demo-context-'));
 const target=path.join(root,'contexts/tasks/CRM-DEMO-001');
 await mkdir(target,{recursive:true});
 for(const [name,text] of Object.entries(documents))await writeFile(path.join(target,name),text);
 return {root,target};
}
async function contents(target:string){
 return Object.fromEntries(await Promise.all((await readdir(target)).sort().map(async name=>[name,await readFile(path.join(target,name),'utf8')])));
}

test('task preparation verifies the three bundled documents idempotently without copying or changing files',async()=>{
 const {root,target}=await fixture();
 try{
  const before=await contents(target),first=await prepareTask(target,root),second=await prepareTask(target,root);
  assert.deepEqual(first,second);assert.equal(first.task,await realpath(target));
  assert.deepEqual(first.files,Object.entries(documents).map(([file,text])=>({file,sha256:createHash('sha256').update(text).digest('hex')})));
  assert.deepEqual(await contents(target),before);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('missing documents and task directories fail without creating replacements',async()=>{
 const {root,target}=await fixture();
 try{
  await rm(path.join(target,'requirements.json'));const before=await contents(target);
  await assert.rejects(prepareTask(target,root),/missing requirements\.json/);
  assert.deepEqual(await contents(target),before);
  await rm(target,{recursive:true});
  await assert.rejects(prepareTask(target,root),/directory is missing/);
  assert.deepEqual(await readdir(path.dirname(target)),[]);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('empty documents and unexpected entries are rejected without changing supplied files',async()=>{
 const {root,target}=await fixture();
 try{
  await writeFile(path.join(target,'requirements.json'),' \n');const empty=await contents(target);
  await assert.rejects(prepareTask(target,root),/document is empty/);
  assert.deepEqual(await contents(target),empty);
  await writeFile(path.join(target,'requirements.json'),documents['requirements.json']);
  await writeFile(path.join(target,'private-ticket.md'),'private input');const extra=await contents(target);
  await assert.rejects(prepareTask(target,root),/Unexpected entry/);
  assert.deepEqual(await contents(target),extra);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('task preparation refuses external parent symlinks before reading outside task documents',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'demo-context-')),outside=await mkdtemp(path.join(os.tmpdir(),'demo-outside-'));
 try{
  await mkdir(path.join(root,'contexts'));await symlink(outside,path.join(root,'contexts/tasks'),'dir');
  await assert.rejects(prepareTask(path.join(root,'contexts/tasks/CRM-DEMO-001'),root),/ancestors/);
  assert.deepEqual(await readdir(outside),[]);
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

test('task preparation rejects document symlinks, directory documents and targets outside the product',async()=>{
 const {root,target}=await fixture(),outside=await mkdtemp(path.join(os.tmpdir(),'demo-outside-'));
 try{
  const privateFile=path.join(outside,'epic.md');await writeFile(privateFile,'outside private input');
  await rm(path.join(target,'epic.md'));await symlink(privateFile,path.join(target,'epic.md'));
  await assert.rejects(prepareTask(target,root),/regular files/);
  assert.equal(await readFile(privateFile,'utf8'),'outside private input');
  await rm(path.join(target,'epic.md'));await mkdir(path.join(target,'epic.md'));
  await assert.rejects(prepareTask(target,root),/regular files/);
  await assert.rejects(prepareTask(outside,root),/inside the selected product/);
  assert.deepEqual(await readdir(outside),['epic.md']);
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

test('live assessment completion requires a nonempty fully evaluated workload',()=>{
 assert.equal(completeAssessment({pairs:12,completed:12,excluded:0}),true);
 for(const value of [{pairs:12,completed:0,excluded:12},{pairs:12,completed:11,excluded:0},{pairs:0,completed:0,excluded:0},{pairs:'12',completed:'12',excluded:0},{}])assert.equal(completeAssessment(value),false);
});
