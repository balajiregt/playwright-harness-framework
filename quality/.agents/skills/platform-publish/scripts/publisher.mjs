import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateConfig, validateMeasurementInput, validateAggregate, validateMetricsFeed} from './contract.mjs';

export const canonical = value => JSON.stringify(value && typeof value === 'object' ? Array.isArray(value) ? value.map(v=>JSON.parse(canonical(v))) : Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])) : value);
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function prepare(config, input) {
  validateMeasurementInput(input, config);
  const data = {schemaVersion:1, projectId:config.projectId, policyHash:digest(config), observedAt:input.observedAt, source:{repository:config.repository, revision:input.revision, dirty:input.dirty}, status:input.status, scope:config.scope, methodologyUrl:config.methodologyUrl, limitations:config.limitations, metrics:config.metrics.map(d=>({...d,...input.values[d.id]}))};
  const result = {...data,runId:digest(data)}; validatePrepared(result,config); return result;
}
export function validatePrepared(data,config) {
  validateAggregate(data,config); const {runId,...body} = data;
  if (digest(body) !== runId || digest(config) !== data.policyHash) throw Error('Prepared export or publication policy changed; prepare again'); return data;
}
export function mergeFeed(previous, data, repository = data.source.repository) {
  if (previous) validateMetricsFeed(previous,data.projectId,repository);
  const duplicate = previous?.runs.find(r=>r.runId===data.runId);
  if (duplicate && canonical(duplicate)!==canonical(data)) throw Error('Conflicting run identity');
  const runs = [...(previous?.runs.filter(r=>r.runId!==data.runId)??[]),data].sort((a,b)=>b.observedAt.localeCompare(a.observedAt)||b.runId.localeCompare(a.runId)).slice(0,50);
  return validateMetricsFeed({schemaVersion:1,projectId:data.projectId,runs},data.projectId,repository);
}
function git(args,cwd,env,allowed=[0]) {
  const r = spawnSync('git',args,{cwd,env,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
  if (r.error || !allowed.includes(r.status)) throw Error('Git '+args[0]+' failed; check access, connectivity and branch permissions'); return r;
}
export function publishToGit(config,data,{remote=config.repository+'.git',beforePush=null}={}) {
  validateConfig(config); validatePrepared(data,config);
  const env = {...process.env,GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_NAME:'Platform publisher',GIT_AUTHOR_EMAIL:'platform-publisher@users.noreply.github.com',GIT_COMMITTER_NAME:'Platform publisher',GIT_COMMITTER_EMAIL:'platform-publisher@users.noreply.github.com'};
  if (process.env.GITHUB_ACTIONS === 'true') {
    const token = process.env.GH_PLATFORM_TOKEN; if (!token) throw Error('GH_PLATFORM_TOKEN is required in Actions');
    const i=Number(env.GIT_CONFIG_COUNT??0); if (!Number.isSafeInteger(i)||i<0) throw Error('Invalid Git environment');
    Object.assign(env,{GIT_CONFIG_COUNT:String(i+1),['GIT_CONFIG_KEY_'+i]:'http.https://github.com/.extraheader',['GIT_CONFIG_VALUE_'+i]:'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64')});
  }
  const folder = fs.mkdtempSync(path.join(os.tmpdir(),'platform-publish-'));
  try {
    git(['init','--quiet'],folder,env); git(['remote','add','origin',remote],folder,env);
    for (let attempt=0;attempt<3;attempt++) {
      const exists=git(['ls-remote','--exit-code','--heads','origin','refs/heads/'+config.branch],folder,env,[0,2]).status===0;
      let previous=null;
      if (exists) {
        git(['fetch','--quiet','origin',config.branch],folder,env); git(['checkout','--quiet','-B',config.branch,'FETCH_HEAD'],folder,env);
        const info=git(['ls-tree','FETCH_HEAD','--',config.feedPath],folder,env).stdout;
        if (info && !info.startsWith('100644 blob ')) throw Error('Feed must be a regular JSON file');
        if (info) previous=JSON.parse(git(['show','FETCH_HEAD:'+config.feedPath],folder,env).stdout);
      } else if (attempt===0) git(['checkout','--quiet','--orphan',config.branch],folder,env);
      else throw Error('Publication branch disappeared during retry');
      const merged=mergeFeed(previous,data,config.repository);
      if (previous && canonical(merged)===canonical(previous)) return {status:'already-published',runId:data.runId};
      fs.writeFileSync(path.join(folder,config.feedPath),JSON.stringify(merged,null,2)+'\n',{flag:'w'});
      git(['add','--',config.feedPath],folder,env); git(['-c','core.hooksPath=/dev/null','commit','--quiet','-m','Publish '+data.projectId+' metrics '+data.runId.slice(0,12)],folder,env);
      if (beforePush) beforePush(attempt);
      const pushed=git(['push','--quiet','origin','HEAD:refs/heads/'+config.branch],folder,env,[0,1,128]);
      if (pushed.status===0) return {status:'published',runId:data.runId};
    }
    throw Error('Publication failed after three attempts; retry the same prepared export');
  } finally { fs.rmSync(folder,{recursive:true,force:true}); }
}
