import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {qualityInvocation,qualityRoot} from './run-quality.mjs';

test('root mutation entry point resolves caller-relative configuration outside the product',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'agent-entry with spaces-'));
  try {
    mkdirSync(path.join(dir,'app'));mkdirSync(path.join(dir,'requirements'));
    writeFileSync(path.join(dir,'app/app.js'),'const count=3;');
    writeFileSync(path.join(dir,'requirements/epic.md'),'The count must equal three.');
    writeFileSync(path.join(dir,'task.json'),JSON.stringify({version:1,repo:'app',artifactDir:'requirements',output:'reports',sourceFiles:['app.js']}));
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./run-quality.mjs',import.meta.url)),'mutation','context','--config','task.json'],{cwd:dir,encoding:'utf8',timeout:20000});
    assert.equal(result.status,0,result.stderr);
    const data=JSON.parse(result.stdout);
    assert.deepEqual(data.sourceFiles,['app.js']);assert.equal(data.artifacts.length,1);assert.match(data.contextHash,/^[a-f0-9]{64}$/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('new exports use the parent product policy unless the caller selects an explicit policy',()=>{
  const defaults=qualityInvocation('export',['--report','comparison.json']);
  assert.ok(defaults.args.includes(path.join(qualityRoot,'.platform-publish.json')));
  const explicit=qualityInvocation('export',['--report','comparison.json','--policy','reviewed.json']);
  assert.equal(explicit.args.at(-1),'reviewed.json');
  assert.ok(!explicit.args.includes(path.join(qualityRoot,'.platform-publish.json')));
});
test('unknown entry points cannot select arbitrary executable files',()=>{
  assert.throws(()=>qualityInvocation('../arbitrary-script'),/Unknown quality command/);
});
test('demo export refuses publication flags before opening evidence',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('./run-quality.mjs',import.meta.url)),'demo','export','--confirm-publication'],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Export never publishes/);
});
