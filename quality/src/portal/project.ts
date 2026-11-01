import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectIntake} from '../intake/store.js';
import {readReports} from './reports.js';
import {readAgentAnalysis} from './analysis.js';
import type {PortalTaskDetail,PortalTaskSummary} from './types.js';

export function validTask(id:string){if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(id))throw Error('Invalid work-item ID');return id;}
export function validRun(id:string){if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Invalid intake version');return id;}
export async function guarded(root:string,relative:string,kind:'file'|'directory',missing=false){
 const full=path.resolve(root,relative),rel=path.relative(root,full);
 if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Selected path is outside the project');
 let current=root;
 for(const [index,part] of rel.split(path.sep).entries()){
  current=path.join(current,part);
  try{const info=await lstat(current);if(info.isSymbolicLink()||index<rel.split(path.sep).length-1&&!info.isDirectory()||index===rel.split(path.sep).length-1&&(kind==='file'?!info.isFile():!info.isDirectory()))throw Error('Project evidence must use regular files and real directories');}
  catch(error){if(missing&&(error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 }
 return full;
}
export async function projectRoot(value:string){const requested=path.resolve(value),info=await lstat(requested);if(info.isSymbolicLink()||!info.isDirectory())throw Error('Select a real project directory');return realpath(requested);}
export function runRelative(task:string,run:string){return `artifacts/agent-tasks/${validTask(task)}/intake/${validRun(run)}`;}
export async function registeredRun(repo:string,task:string,run:string){return (await guarded(repo,runRelative(task,run),'directory'))!;}
async function jsonFile(file:string){const stat=await lstat(file);if(stat.size>4*1024*1024)throw Error('Saved intake metadata exceeds the workbench limit');return JSON.parse(await readFile(file,'utf8'));}
function matrixRows(text:string):Record<string,string>[] {
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.length))rows.push(row);row=[];cell='';if(rows.length>2001)throw Error('Traceability matrix exceeds 2000 rows');}
  else cell+=c;
 }
 if(quoted)throw Error('Traceability CSV has an unfinished quoted cell');
 if(cell||row.length){row.push(cell);rows.push(row);}
 const headers=rows.shift()??[];if(new Set(headers).size!==headers.length||!headers.includes('Requirement ID')||!headers.includes('Criterion'))throw Error('Traceability CSV needs unique Requirement ID and Criterion columns');
 return rows.map(values=>{if(values.length!==headers.length)throw Error('Traceability CSV row has inconsistent columns');return Object.fromEntries(headers.map((h,i)=>[h,values[i]]));});
}
async function versions(repo:string,task:string){
 const root=await guarded(repo,`artifacts/agent-tasks/${validTask(task)}/intake`,'directory',true);if(!root)return [];
 const result:{id:string;createdAt:string;goal:string}[]=[];
 for(const entry of (await readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.isSymbolicLink()).slice(0,100)){
  validRun(entry.name);const file=(await guarded(repo,`${runRelative(task,entry.name)}/intake.json`,'file'))!;
  const data=await jsonFile(file);if(data.taskId!==task||data.runId!==entry.name||typeof data.createdAt!=='string')throw Error('Saved intake version has mismatched identity');
  result.push({id:entry.name,createdAt:data.createdAt,goal:String(data.goal)});
 }
 return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function taskDetail(repo:string,task:string,selected?:string):Promise<PortalTaskDetail>{
 validTask(task);const runs=await versions(repo,task),reports=await readReports(repo,task);
 const id=selected??runs[0]?.id;if(!id)return {taskId:task,runs,run:null,reports};
 if(!runs.some(r=>r.id===id))throw Error('Selected intake version is not registered for this work item');
 const root=await registeredRun(repo,task,id),value=await inspectIntake({run:root,allowStale:true});
 const briefFile=await guarded(repo,`${runRelative(task,id)}/agent-brief.md`,'file',true);
 const matrixFile=await guarded(repo,`${runRelative(task,id)}/matrix.csv`,'file',true);
 if(matrixFile&&(await lstat(matrixFile)).size>4*1024*1024)throw Error('Traceability CSV exceeds the workbench limit');
 const matrix=matrixFile?matrixRows(await readFile(matrixFile,'utf8')):[];
 const analysis=await readAgentAnalysis(root,{intakeHash:value.snapshot.intakeHash,draftHash:value.draftHash,stale:Boolean(value.stale)});
 return {taskId:task,runs,reports,run:{id,createdAt:value.snapshot.createdAt,goal:value.snapshot.goal,intakeHash:value.snapshot.intakeHash,draftHash:value.draftHash,draft:value.draft,documents:value.snapshot.sources,openQuestions:value.draft.questions.filter(q=>!q.resolution).length,blockingDocuments:value.snapshot.sources.filter(s=>s.extraction.issues.some(i=>i.severity==='blocking')).length,reviewed:value.reviewed,accepted:value.accepted,brief:briefFile?await readFile(briefFile,'utf8'):'',stale:value.stale,mappings:value.snapshot.mappings,matrix,...(analysis?{analysis}:{})}};
}
export async function taskList(repo:string):Promise<PortalTaskSummary[]>{
 const root=await guarded(repo,'artifacts/agent-tasks','directory',true);if(!root)return [];
 const result:PortalTaskSummary[]=[];
 for(const entry of (await readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.isSymbolicLink()).slice(0,500)){
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(entry.name))continue;
  try{
   const detail=await taskDetail(repo,entry.name),run=detail.run;
   result.push({id:entry.name,updatedAt:run?.createdAt??null,runId:run?.id??null,status:run?.stale?'Source changed':run?.blockingDocuments?'Blocked extraction':run?.accepted?'Interpretation accepted':run?'Needs review':'Reports only',criteria:run?.draft.requirements.length??0,openQuestions:run?.openQuestions??0,sources:run?.documents.length??0,testReports:detail.reports.tests.length,mutationReports:detail.reports.mutations.length});
  }catch{result.push({id:entry.name,updatedAt:null,runId:null,status:'Evidence unavailable',criteria:0,openQuestions:0,sources:0,testReports:0,mutationReports:0});}
 }
 return result.sort((a,b)=>(b.updatedAt??'').localeCompare(a.updatedAt??'')||a.id.localeCompare(b.id));
}
export async function originalDocument(repo:string,task:string,run:string,sourceId:string){
 const registered=await registeredRun(repo,task,run),value=await inspectIntake({run:registered});
 const source=value.snapshot.sources.find(s=>s.id===sourceId);if(!source)throw Error('Unknown source document');
 const file=(await guarded(repo,`contexts/tasks/${task}/${source.file}`,'file'))!,bytes=await readFile(file);
 if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Source changed since this intake version');
 return {name:source.name,bytes};
}
