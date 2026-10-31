import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {loadContext,validatePlan} from './context.js';
import type {MutationConfig} from './schema.js';
import {planWithCodex} from './codex.js';
import {assessWithLaya} from './laya.js';
import {runCampaign} from './runner.js';
import {campaignMetrics} from './report.js';
import {digest} from '../context.js';
import {treeHash} from './runner.js';

export function mutationTools(c:MutationConfig,options:{allowHosted?:boolean;allowRun?:boolean}={}){
 const planFile=path.join(c.output,'plan.json');
 const plan=async()=>validatePlan(JSON.parse(await readFile(planFile,'utf8')),await loadContext(c),c);
 return {
  async context(){const v=await loadContext(c);return {contextHash:v.hash,artifacts:v.artifacts.map(a=>({id:a.id,file:a.file,characters:a.text.length})),sourceFiles:v.sources.map(s=>s.file)};},
  async evidence(){return loadContext(c);},
  async plan(){if(!options.allowHosted)throw Error('Codex planning requires explicit --allow-hosted');const ctx=await loadContext(c),result=await planWithCodex(c,ctx);await mkdir(c.output,{recursive:true});await writeFile(planFile,JSON.stringify(result.plan,null,2));await writeFile(path.join(c.output,'planner.json'),JSON.stringify(result.metadata,null,2));return {planFile,requirements:result.plan.requirements.length,mutations:result.plan.mutations.map(m=>({id:m.id,requirementId:m.requirementId,description:m.description})),metadata:result.metadata};},
  async inspect(){return plan();},
  async assess(){const result=await assessWithLaya(c,await plan());await writeFile(path.join(c.output,'laya.json'),JSON.stringify(result,null,2));return {pairs:result.cells.length,completed:result.cells.filter(c=>c.status==='evaluated').length,excluded:result.cells.filter(c=>c.status==='excluded').length,metadata:result.metadata};},
  async run(){if(!options.allowRun)throw Error('Mutation execution requires explicit --allow-run');let a;try{a=JSON.parse(await readFile(path.join(c.output,'laya.json'),'utf8'));}catch{}const p=await plan();if(a?.contextHash!==p.contextHash||a?.planHash!==digest(JSON.stringify(p))||a?.repositoryHash!==await treeHash(c.repo))a=undefined;const {dir,report}=await runCampaign(c,p,a);return {dir,metrics:campaignMetrics(report)};}
 };
}
