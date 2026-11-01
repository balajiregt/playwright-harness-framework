import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {ROOT} from '../src/context.js';
import {prepareIntake,reviewIntake,acceptIntake} from '../src/intake/store.js';
import {importRequirements} from '../src/team/requirements.js';
import {loadContext} from '../src/mutation/context.js';
import {configSchema} from '../src/mutation/schema.js';

const python=path.join(ROOT,'.venv/bin/python');
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
 const root=await mkdtemp(path.join(os.tmpdir(),'intake with spaces-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const repo=path.join(root,'project'),input=path.join(root,'downloads');await mkdir(repo);await mkdir(input);
 const file=path.join(input,'criteria.json');
 const data={version:1,requirements:[{id:'LOGIN-1',criterion:'An invalid password keeps the user on the login screen.',journey:'login',critical:true}]};
 await writeFile(file,JSON.stringify(data));return {root,repo,input,file,data};
}
async function prepared(f:Awaited<ReturnType<typeof fixture>>,task='LOGIN-123'){
 return prepareIntake({repo:f.repo,task,files:[f.file],python});
}
async function draftAt(run:string){return JSON.parse(await readFile(path.join(run,'draft.json'),'utf8'));}
async function saveDraft(run:string,value:unknown){await writeFile(path.join(run,'draft.json'),JSON.stringify(value));}
const accept=(run:string,extra={})=>acceptIntake({run,reviewedBy:'Synthetic fixture reviewer',confirmReviewed:true,...extra});

test('selected documents are frozen privately, source-linked and never automatically accepted',async t=>{
 const f=await fixture(t),raw=await readFile(f.file),result=await prepared(f);
 assert.equal(result.status,'needs-review');assert.equal(result.published,false);
 assert.equal(result.requirements,1);assert.equal(result.blockingDocuments,0);
 assert.deepEqual(await readFile(f.file),raw);
 const snapshot=JSON.parse(await readFile(path.join(result.run,'intake.json'),'utf8'));
 assert.equal(snapshot.sources[0].sha256,createHash('sha256').update(raw).digest('hex'));
 assert.deepEqual(await readFile(path.join(result.taskDirectory,result.artifactFiles[0])),raw);
 assert.deepEqual((await readdir(result.taskDirectory)).filter(name=>name!=='.gitignore'),result.artifactFiles);
 const draft=await draftAt(result.run);assert.equal(draft.requirements[0].sources[0].sourceId,snapshot.sources[0].id);
 assert.match(await readFile(path.join(result.taskDirectory,'.gitignore'),'utf8'),/\n\*\n$/);
 assert.match(await readFile(path.join(result.run,'matrix.csv'),'utf8'),/not.?run/i);
});

test('reviewed acceptance produces legacy-compatible requirements and inspectable provenance, never product acceptance',async t=>{
 const f=await fixture(t),mappings={sources:{'criteria.json':{fields:{id:'id',criterion:'criterion',journey:'journey',critical:'critical'}}}};
 const p=await prepareIntake({repo:f.repo,task:'LOGIN-123',files:[f.file],python,mappings});
 await assert.rejects(acceptIntake({run:p.run,reviewedBy:'',confirmReviewed:false}),/confirmation/);
 await assert.rejects(accept(p.run)); // Exact review receipt is required first.
 const review=await reviewIntake({run:p.run});assert.equal(review.openQuestions,0);
 const result=await accept(p.run);assert.equal(result.productAccepted,false);
 assert.deepEqual(await importRequirements(result.requirements,python),f.data);
 const evidence=JSON.parse(await readFile(result.provenance,'utf8'));
 assert.equal(evidence.scope,'requirement-interpretation-only');assert.equal(evidence.reviewerIdentity,'declared-not-authenticated');
 assert.deepEqual(evidence.mappings,mappings);
 assert.ok(evidence.criteria[0].sources[0].locator);
 assert.equal((await accept(p.run)).alreadyAccepted,true);
});

test('free-form source review can be drafted by the host agent with exact quotes and explicit clarification',async t=>{
 const f=await fixture(t),file=path.join(f.input,'technical notes.md');
 const sentence='A viewer must see a read-only banner on the accounts page.';await writeFile(file,sentence);
 const p=await prepareIntake({repo:f.repo,task:'READONLY-1',files:[file],python});
 const original=JSON.parse(await readFile(path.join(p.run,'intake.json'),'utf8')),draft=await draftAt(p.run);
 assert.equal(draft.requirements.length,0);assert.ok(draft.questions.length);
 await assert.rejects(accept(p.run),/questions|requirements|small|array/i);
 const source=original.sources[0],segment=source.extraction.segments.find((s:{text:string})=>s.text.includes(sentence));
 draft.requirements=[{id:'VIEWER-1',criterion:sentence,journey:'accounts',critical:true,sources:[{sourceId:source.id,segmentId:segment.id,quote:sentence}]}];
 for(const question of draft.questions)question.resolution='Synthetic tester confirms this is the intended account behavior.';
 await saveDraft(p.run,draft);await reviewIntake({run:p.run});
 assert.equal((await accept(p.run)).productAccepted,false);
});

test('stale documents, unsupported quotes, removed questions and changed drafts cannot be accepted',async t=>{
 const f=await fixture(t),p=await prepared(f),draft=await draftAt(p.run);
 draft.requirements[0].sources[0].quote='This sentence is not supplied by the document.';
 await saveDraft(p.run,draft);await assert.rejects(reviewIntake({run:p.run}),/quote/);
 const p2=await prepared(f,'LOGIN-124');await reviewIntake({run:p2.run});
 const changed=await draftAt(p2.run);changed.requirements[0].id='LOGIN-CHANGED';await saveDraft(p2.run,changed);
 await assert.rejects(accept(p2.run),/changed after the last review/);
 const p3=await prepared(f,'LOGIN-125');await writeFile(path.join(p3.taskDirectory,p3.artifactFiles[0]),'changed source');
 await assert.rejects(reviewIntake({run:p3.run}),/source document changed/);
 const prose=path.join(f.input,'flow.md');await writeFile(prose,'The viewer sees the accounts page.');
 const p4=await prepareIntake({repo:f.repo,task:'FLOW-1',files:[prose],python});const removed=await draftAt(p4.run);removed.questions=[];await saveDraft(p4.run,removed);
 await assert.rejects(reviewIntake({run:p4.run}),/original intake questions/);
});

test('unreadable documents stay blocked even if a draft marks their questions resolved',async t=>{
 const f=await fixture(t),image=path.join(f.input,'flow.png');await writeFile(image,'image fixture');
 const p=await prepareIntake({repo:f.repo,task:'IMAGE-1',files:[f.file,image],python});assert.ok(p.blockingDocuments);
 const draft=await draftAt(p.run);for(const question of draft.questions)question.resolution='Synthetic review note cannot supply unavailable source content.';
 await saveDraft(p.run,draft);await reviewIntake({run:p.run});await assert.rejects(accept(p.run),/remains blocked/);
});

test('public and tracked tasks, symlink destinations and duplicate sources fail without copying private inputs',async t=>{
 const f=await fixture(t);
 await assert.rejects(prepared(f,'CRM-DEMO-001'),/public synthetic/);
 await assert.rejects(prepareIntake({repo:f.repo,task:'DUPE-1',files:[f.file,f.file],python}),/more than once/);
 await mkdir(path.join(f.repo,'contexts/tasks'),{recursive:true});
 const outside=path.join(f.root,'outside');await mkdir(outside);await symlink(outside,path.join(f.repo,'contexts/tasks/LINK-1'),'dir');
 await assert.rejects(prepared(f,'LINK-1'),/real directories/);assert.deepEqual(await readdir(outside),[]);
 const linked=path.join(f.input,'linked.json');await symlink(f.file,linked);await assert.rejects(prepareIntake({repo:f.repo,task:'LINK-2',files:[linked],python}),/regular files/);
 execFileSync('git',['init','--quiet'],{cwd:f.repo});await mkdir(path.join(f.repo,'contexts/tasks/PUBLIC-1'));
 await writeFile(path.join(f.repo,'contexts/tasks/PUBLIC-1/public.md'),'Tracked public task');execFileSync('git',['add','--','contexts/tasks/PUBLIC-1/public.md'],{cwd:f.repo});
 await assert.rejects(prepared(f,'PUBLIC-1'),/tracked files/);
 assert.deepEqual(await readdir(path.join(f.repo,'contexts/tasks/PUBLIC-1')),['public.md']);
});

test('existing user requirements are preserved; replacing a generated version requires an explicit reviewed revision',async t=>{
 const f=await fixture(t),p=await prepared(f);await reviewIntake({run:p.run});
 const owned=path.join(p.taskDirectory,'requirements.json');await writeFile(owned,'User authored source');
 await assert.rejects(accept(p.run),/incomplete or user-owned/);assert.equal(await readFile(owned,'utf8'),'User authored source');await rm(owned);
 const first=await accept(p.run),old=await readFile(first.requirements,'utf8');
 f.data.requirements[0].criterion='An invalid password displays the credential error and retains login.';await writeFile(f.file,JSON.stringify(f.data));
 const next=await prepared(f);await reviewIntake({run:next.run});
 await assert.rejects(accept(next.run),/replace-reviewed/);assert.equal(await readFile(owned,'utf8'),old);
 await accept(next.run,{replaceReviewed:true});assert.deepEqual(await importRequirements(owned,python),f.data);
 assert.equal(await readFile(path.join(p.run,'accepted-requirements.json'),'utf8'),old);
});

test('explicit mutation artifact selection consumes only original documents after requirements are generated',async t=>{
 const f=await fixture(t),p=await prepared(f);await reviewIntake({run:p.run});await accept(p.run);
 await writeFile(path.join(f.repo,'app.js'),'const readonly = true;');
 await mkdir(path.join(p.taskDirectory,'unrelated-private-notes'));
 const c=configSchema.parse({version:1,repo:f.repo,artifactDir:p.taskDirectory,artifactFiles:p.artifactFiles,sourceFiles:['app.js'],python});
 const context=await loadContext(c);assert.equal(context.artifacts.length,1);assert.equal(context.artifacts[0].file,p.artifactFiles[0]);
 assert.throws(()=>configSchema.parse({...c,artifactFiles:['../secret.json']}));
 await assert.rejects(loadContext({...c,artifactFiles:['missing.md']}),/missing/);
});

test('project-local privacy survives inherited ignores and failed Git metadata checks never bypass tracked-input checks',async t=>{
 const f=await fixture(t);
 execFileSync('git',['init','--quiet'],{cwd:f.root});await writeFile(path.join(f.root,'.gitignore'),'project/\n');
 await prepared(f);
 assert.match(await readFile(path.join(f.repo,'contexts/tasks/LOGIN-123/.gitignore'),'utf8'),/\n\*\n$/);
 assert.match(await readFile(path.join(f.repo,'artifacts/agent-tasks/.gitignore'),'utf8'),/\n\*\n$/);
 const broken=await fixture(t);await mkdir(path.join(broken.repo,'.git'));
 await assert.rejects(prepared(broken),/Cannot verify task privacy/);
 assert.deepEqual(await readdir(broken.repo),['.git']);
});

test('private directory markers override later parent negations without modifying shared project ignores',async t=>{
 const f=await fixture(t);execFileSync('git',['init','--quiet'],{cwd:f.repo});
 const ignore='/contexts/tasks/LOGIN-123/\n!/contexts/tasks/LOGIN-123/\n';await writeFile(path.join(f.repo,'.gitignore'),ignore);
 const p=await prepared(f);
 for(const file of p.artifactFiles)execFileSync('git',['check-ignore','--no-index','-q',path.join(p.taskDirectory,file)],{cwd:f.repo});
 assert.equal(await readFile(path.join(f.repo,'.gitignore'),'utf8'),ignore);
});
