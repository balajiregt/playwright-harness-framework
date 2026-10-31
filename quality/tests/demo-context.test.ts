import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareTask} from '../src/demo/task-context.js';
import {completeAssessment} from '../src/demo/mcp-audit.js';

test('task preparation preflights every conflict before adding any synthetic document',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'demo-context-'));
 try{
  const template=path.join(root,'template'),target=path.join(root,'contexts/tasks/DEMO');
  await mkdir(template);await mkdir(target,{recursive:true});
  await writeFile(path.join(template,'epic.md'),'Synthetic epic');await writeFile(path.join(template,'ticket.json'),'{}');
  await writeFile(path.join(target,'ticket.json'),'private existing ticket');
  await assert.rejects(prepareTask(template,target,root),/Existing demo task differs/);
  assert.deepEqual(await readdir(target),['ticket.json']);assert.equal(await readFile(path.join(target,'ticket.json'),'utf8'),'private existing ticket');
  await writeFile(path.join(target,'ticket.json'),'{}');
  const first=await prepareTask(template,target,root),second=await prepareTask(template,target,root);
  assert.deepEqual(first,second);assert.equal(first.files.length,2);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('task preparation refuses external parent symlinks before creating an outside directory',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'demo-context-')),outside=await mkdtemp(path.join(os.tmpdir(),'demo-outside-'));
 try{
  const template=path.join(root,'template');await mkdir(template);await writeFile(path.join(template,'epic.md'),'Synthetic');
  await mkdir(path.join(root,'contexts'));await symlink(outside,path.join(root,'contexts/tasks'),'dir');
  await assert.rejects(prepareTask(template,path.join(root,'contexts/tasks/DEMO'),root),/ancestors/);
  assert.deepEqual(await readdir(outside),[]);
 }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

test('live assessment completion requires a nonempty fully evaluated workload',()=>{
 assert.equal(completeAssessment({pairs:12,completed:12,excluded:0}),true);
 for(const value of [{pairs:12,completed:0,excluded:12},{pairs:12,completed:11,excluded:0},{pairs:0,completed:0,excluded:0},{pairs:'12',completed:'12',excluded:0},{}])assert.equal(completeAssessment(value),false);
});
