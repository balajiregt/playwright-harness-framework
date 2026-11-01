import {readdir,readFile,stat,realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {ROOT,digest} from '../context.js';
import {insideRepo} from '../team/config.js';
import {type MutationConfig,type MutationPlan,planSchema} from './schema.js';
const exec=promisify(execFile);
export interface Artifact {id:string;file:string;sha256:string;text:string}
export interface MutationContext {version:1;hash:string;artifacts:Artifact[];sources:{file:string;sha256:string;code:string}[]}
export async function loadContext(c:MutationConfig):Promise<MutationContext>{
 const root=await realpath(c.artifactDir),artifacts:Artifact[]=[];let bytes=0;
 const entries=await readdir(root,{withFileTypes:true});
 if(c.artifactFiles)for(const name of c.artifactFiles)if(!entries.some(e=>e.name===name))throw Error('Selected artifact is missing: '+name);
 for(const entry of entries.filter(e=>!c.artifactFiles||c.artifactFiles.includes(e.name)).sort((a,b)=>a.name.localeCompare(b.name))){
  if(entry.name.startsWith('.'))continue;
  if(!entry.isFile())throw Error('Artifact folder accepts regular files only; no directories or symbolic links');
  if(artifacts.length>=30)throw Error('At most 30 artifacts per context');
  const file=path.join(root,entry.name);if((await stat(file)).size>10*1024*1024)throw Error('Artifact exceeds 10 MiB');
  const raw=await readFile(file);bytes+=raw.length;if(bytes>30*1024*1024)throw Error('Artifact batch exceeds 30 MiB');
  const ext=path.extname(file).toLowerCase();let text:string;
  if(['.txt','.md','.json','.csv'].includes(ext))text=raw.toString('utf8').replace(/^\uFEFF/,'');
  else if(['.pdf','.doc','.docx','.html','.htm','.xls','.xlsx'].includes(ext)){
   try{const result=await exec(c.python,[path.join(ROOT,'python/extract_artifact.py'),file],{timeout:30000,maxBuffer:1024*1024});text=result.stdout;}
   catch{throw Error(`Cannot extract ${entry.name}; see artifact format requirements. No content was truncated or ignored.`);}
  }else throw Error(`Unsupported artifact format: ${ext}`);
  if(!text.trim())throw Error(`No readable text in ${entry.name}; scanned PDFs need text/OCR supplied separately`);
  artifacts.push({id:digest(entry.name+digest(raw.toString('base64'))).slice(0,20),file:entry.name,sha256:digest(raw.toString('base64')),text});
 }
 if(!artifacts.length)throw Error('Put downloaded requirements in artifactDir before planning');
 const sources=[];
 for(const file of c.sourceFiles){const code=await readFile(await insideRepo(c.repo,file),'utf8');sources.push({file,sha256:digest(code),code});}
 if(JSON.stringify({artifacts,sources}).length>90000)throw Error('Context exceeds 90,000 characters; split the work item explicitly');
 return {version:1,hash:digest(JSON.stringify({artifacts,sources})),artifacts,sources};
}
export function validatePlan(input:unknown,context:MutationContext,c:MutationConfig):MutationPlan{
 const plan=planSchema.parse(input);
 if(plan.contextHash!==context.hash)throw Error('Plan is stale: requirements or source changed');
 if(plan.mutations.length>c.maxMutations)throw Error('Plan exceeds maxMutations');
 if(new Set(plan.requirements.map(r=>r.id)).size!==plan.requirements.length||new Set(plan.mutations.map(m=>m.id)).size!==plan.mutations.length)throw Error('Duplicate plan IDs');
 for(const r of plan.requirements){const artifact=context.artifacts.find(a=>a.id===r.source.artifactId);if(!artifact?.text.includes(r.source.quote))throw Error('Requirement quote does not occur in the supplied artifact');}
 const patches=new Set<string>();
 for(const m of plan.mutations){
  if(!plan.requirements.some(r=>r.id===m.requirementId))throw Error('Unknown mutation requirement');
  const source=context.sources.find(s=>s.file===m.file);
  if(!source||!source.code.includes(m.before)||source.code.split(m.before).length!==2||m.before===m.after)throw Error('Mutation must replace one unique match in an allowed source file');
  const hash=digest(JSON.stringify([m.file,m.before,m.after]));if(patches.has(hash))throw Error('Duplicate behavioral mutation');patches.add(hash);
  if(m.probe.kind==='count'&&!/^\d+$/.test(m.probe.expected))throw Error('Count probe expects a nonnegative integer');
  if(m.probe.roles.length&&!c.probeSetup)throw Error('Role probes need the configured existing setup helper');
  if(c.projects.length&&!c.projects.includes(m.probe.project))throw Error('Probe project is outside selected projects');
 }
 return plan;
}
