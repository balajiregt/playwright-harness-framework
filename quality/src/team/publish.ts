import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateComparisonMetrics} from '../../shared/comparison-metrics.mjs';
import {validateTeamMetrics} from './metrics.js';
const exec=promisify(execFile);
export async function publishMetrics(file:string,repository='balajiregt/playwright-decision-bench'){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))throw Error('Invalid GitHub repository');
 const text=await readFile(file,'utf8');if(text.length>30000)throw Error('Metrics file exceeds size limit');
 const parsed=JSON.parse(text),validate=parsed.schemaVersion===2?validateComparisonMetrics:validateTeamMetrics;
 const metrics=validate(parsed);const feed=parsed.schemaVersion===2?'comparison-metrics.json':'team-metrics.json';
 const temp=await mkdtemp(path.join(os.tmpdir(),'decision-metrics-'));
 const checkout=path.join(temp,'results');
 const git=async(args:string[])=>exec('git',args,{cwd:checkout,timeout:60000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
 try{
  try{await exec('git',['clone','--depth','1','--single-branch','--branch','benchmark-results',`https://github.com/${repository}.git`,checkout],{timeout:60000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});}
  catch{throw Error('Cannot read results branch. Git and authenticated repository access are required.');}
  for(let attempt=0;attempt<3;attempt++){
   if(attempt){await git(['fetch','origin','benchmark-results']);await git(['reset','--hard','origin/benchmark-results']);}
   let runs:any[]=[];
   try{
    const data=JSON.parse(await readFile(path.join(checkout,feed),'utf8'));
    if(Object.keys(data).sort().join(',')!=='runs,schemaVersion'||data.schemaVersion!==1||!Array.isArray(data.runs)||data.runs.length>100)throw Error('Invalid existing metrics feed');
    runs=data.runs.map(validate);
   }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Existing team metrics feed is invalid');}
   runs=[metrics,...runs.filter(r=>r.runId!==metrics.runId)].slice(0,100);
   await writeFile(path.join(checkout,feed),JSON.stringify({schemaVersion:1,runs},null,2)+'\n');
   await git(['add','--',feed]);
   if(!(await git(['diff','--cached','--name-only'])).stdout.trim())return `https://github.com/${repository}/blob/benchmark-results/${feed}`;
   await git(['-c','user.name=Decision Bench','-c','user.email=decision-bench@users.noreply.github.com','commit','-m','Publish local Playwright evaluation metrics']);
   try{await git(['push','origin','HEAD:benchmark-results']);return `https://github.com/${repository}/blob/benchmark-results/${feed}`;}
   catch{if(attempt===2)throw Error('Metrics publication failed; authenticate Git with repository write access. No force push was attempted.');}
  }
 }finally{await rm(temp,{recursive:true,force:true});}
}
