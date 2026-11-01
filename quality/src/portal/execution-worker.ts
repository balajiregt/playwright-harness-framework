// A private worker; the browser never supplies a command, provider or environment.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadConfig} from '../mutation/schema.js';
import {loadContext,validatePlan} from '../mutation/context.js';
import {runCampaign,healthy} from '../mutation/runner.js';
import {stopMutationProcesses} from '../mutation/process.js';

let stopping=false,killTimer:NodeJS.Timeout|undefined,stage='registered request';
const stop=()=>{
 if(stopping)return;stopping=true;stopMutationProcesses();
 killTimer=setTimeout(()=>{stopMutationProcesses('SIGKILL');process.exit(143);},1500);
};
process.on('SIGTERM',stop);process.on('SIGINT',stop);
try{
 const request=JSON.parse(await readFile(process.argv[2],'utf8')) as {repo:string;config:string;plan:string;contextHash:string;configHash:string;planHash:string;output:string;report:string};
 const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
 if(sha(await readFile(request.config))!==request.configHash||sha(await readFile(request.plan))!==request.planHash)throw Error('Mutation scope changed before execution');
 stage='configuration';const c=await loadConfig(request.config);
 if(c.repo!==request.repo)throw Error('Mutation repository differs from the selected project');
 c.output=request.output;
 stage='context';const context=await loadContext(c);
 if(context.hash!==request.contextHash)throw Error('Mutation context changed before execution');
 stage='reviewed plan';const plan=validatePlan(JSON.parse(await readFile(request.plan,'utf8')),context,c);
 if(stopping)throw Error('Mutation worker stopped');
 stage='isolated campaign';const result=await runCampaign(c,plan);
 if(stopping)throw Error('Mutation worker stopped');
 // Copy the actual saved campaign, including finally-produced restoration evidence.
 stage='campaign export';await writeFile(request.report,await readFile(path.join(result.dir,'campaign.json')),{flag:'wx',mode:0o600});
 const r=result.report;
 if(r.baseline.length<2||!r.baseline.every(healthy)||!r.restored||!healthy(r.restored)||!r.originalUnchanged||r.faults.some(f=>f.status==='not_run')){
  console.error('Mutation pipeline was incomplete or unhealthy. The partial campaign report remains available.');process.exitCode=2;
 }
}catch(error){
 // Raw errors and document text are never printed to the server console.
 const code=(error as NodeJS.ErrnoException).code;
 console.error(stopping?'Mutation execution stopped.':`Mutation execution failed during ${stage}${typeof code==='string'&&/^[A-Z_]+$/.test(code)?` (${code})`:''}; inspect the private campaign and registered configuration.`);
 process.exitCode=stopping?143:1;
}finally{if(killTimer)clearTimeout(killTimer);stopMutationProcesses('SIGKILL');}
