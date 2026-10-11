import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const sha = content => crypto.createHash('sha256').update(content).digest('hex');
const finite = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function collectTrial(metadata, report, reportHash, tasks) {
  const task = tasks.find(t=>t.id===metadata.taskId);
  if (!task || !['baseline','framework'].includes(metadata.arm) || !['live-agent','scripted-validation'].includes(metadata.evidenceKind)) throw Error('Unknown task, arm or evidence kind');
  for (const key of ['trialId','model','modelVersion','targetRevision','promptSha256']) if (typeof metadata[key]!=='string' || !metadata[key].trim()) throw Error(`Missing ${key}`);
  if (!/^[a-zA-Z0-9_-]+$/.test(metadata.trialId) || !/^[a-f0-9]{64}$/.test(metadata.promptSha256) || !/^[a-f0-9]{64}$/.test(metadata.targetRevision)) throw Error('Use a safe trial ID and SHA256 prompt/target hashes');
  if (!Number.isInteger(metadata.repeat) || metadata.repeat < 0) throw Error('Invalid repeat');
  const start=Date.parse(metadata.startedAt),end=Date.parse(metadata.finishedAt);
  if (!Number.isFinite(start)||!Number.isFinite(end)||end<start) throw Error('Invalid timestamps');
  for (const field of ['humanCorrectionMs','incorrectChanges']) if (metadata[field]!==null && !finite(metadata[field])) throw Error(`Use a measured nonnegative ${field} or null`);
  if (metadata.incorrectChanges!==null && !Number.isInteger(metadata.incorrectChanges)) throw Error('Incorrect change count must be integer');
  if ((metadata.humanCorrectionMs!==null || metadata.incorrectChanges!==null) && !metadata.reviewerEvidence) throw Error('Measured human corrections require reviewer evidence');
  if (metadata.usage!==null && (!metadata.usage || !['inputTokens','outputTokens'].every(k=>Number.isInteger(metadata.usage[k])&&metadata.usage[k]>=0) || !metadata.usage.source)) throw Error('Usage requires integer token counts and provider evidence source');
  const tests=[];const visit=s=>{for(const c of s.suites??[])visit(c);for(const spec of s.specs??[])for(const t of spec.tests??[])tests.push({title:spec.title,expected:t.expectedStatus??'passed',results:t.results??[]});};visit(report);
  const checks=task.requiredTests.map(title=>{
    const matches=tests.filter(t=>t.title===title);
    return { title, observed:matches.length, passed:matches.length===1 && matches[0].expected==='passed' && matches[0].results.length===1 && matches[0].results[0].status==='passed' };
  });
  let cost=null;
  if (metadata.pricing!==null) {
    const p=metadata.pricing;
    if (!metadata.usage || !p || !finite(p.inputPerMillion) || !finite(p.outputPerMillion) || typeof p.currency!=='string' || !p.source || !Number.isFinite(Date.parse(p.asOf))) throw Error('Pricing requires dated provider rates, currency and actual usage');
    cost={amount:(metadata.usage.inputTokens*p.inputPerMillion+metadata.usage.outputTokens*p.outputPerMillion)/1e6,currency:p.currency,classification:'estimated-from-reported-usage',ratesAsOf:p.asOf,source:p.source};
  }
  return {schemaVersion:1,...metadata,reportSha256:reportHash,checks,correctCompletion:checks.every(c=>c.passed),requiredCheckCoverage:checks.filter(c=>c.passed).length/checks.length,elapsedMs:end-start,cost};
}
export function summarizeTrials(records) {
  const seen=new Set(); const repeats=new Set(); for(const r of records) {if(seen.has(r.trialId))throw Error('Duplicate trial identity');seen.add(r.trialId);const key=JSON.stringify([r.taskId,r.model,r.modelVersion,r.targetRevision,r.evidenceKind,r.arm,r.repeat]);if(repeats.has(key))throw Error('Duplicate arm/repeat');repeats.add(key);}
  const groups={};
  for(const r of records){const key=JSON.stringify([r.taskId,r.model,r.modelVersion,r.targetRevision,r.evidenceKind]);const g=groups[key]??={taskId:r.taskId,model:r.model,modelVersion:r.modelVersion,targetRevision:r.targetRevision,evidenceKind:r.evidenceKind,baseline:[],framework:[]};g[r.arm].push(r);}
  return Object.values(groups).map(g=>{
    const summarize=rows=>({trials:rows.length,correct:rows.filter(r=>r.correctCompletion).length,correctCompletionRate:rows.length?rows.filter(r=>r.correctCompletion).length/rows.length:null,medianElapsedMs:median(rows.map(r=>r.elapsedMs)),humanCorrectionObserved:rows.filter(r=>r.humanCorrectionMs!==null).length,medianHumanCorrectionMs:median(rows.filter(r=>r.humanCorrectionMs!==null).map(r=>r.humanCorrectionMs)),incorrectChangesObserved:rows.filter(r=>r.incorrectChanges!==null).length,medianIncorrectChanges:median(rows.filter(r=>r.incorrectChanges!==null).map(r=>r.incorrectChanges)),costObserved:rows.filter(r=>r.cost!==null).length,estimatedCostByCurrency:rows.filter(r=>r.cost!==null).reduce((sum,r)=>({...sum,[r.cost.currency]:(sum[r.cost.currency]??0)+r.cost.amount}),{})});
    const paired=g.baseline.filter(b=>g.framework.some(f=>f.repeat===b.repeat));
    return {...g,baseline:summarize(g.baseline),framework:summarize(g.framework),pairedRepeats:paired.length,claim:'Descriptive controlled results only; no production or hiring-impact claim.'};
  });
}
function median(values){if(!values.length)return null;const v=[...values].sort((a,b)=>a-b),n=v.length;return n%2?v[Math.floor(n/2)]:(v[n/2-1]+v[n/2])/2;}
if (process.argv[1]===fileURLToPath(import.meta.url)) {
 try {
  const [command,metadataPath,reportPath]=process.argv.slice(2);
  const dir=path.resolve('benchmark-results/trials');
  if(command==='collect'){
    const m=JSON.parse(fs.readFileSync(metadataPath,'utf8'));const raw=fs.readFileSync(reportPath,'utf8');
    const tasks=JSON.parse(fs.readFileSync(new URL('./tasks.json',import.meta.url),'utf8'));
    const row=collectTrial(m,JSON.parse(raw),sha(raw),tasks);
    fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,row.trialId+'.json'),JSON.stringify(row,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({trialId:row.trialId,correctCompletion:row.correctCompletion,elapsedMs:row.elapsedMs,cost:row.cost}));
  } else if(command==='summary'){
    const records=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))):[];
    console.log(JSON.stringify({schemaVersion:1,groups:summarizeTrials(records),limitations:['Manual reviewer fields are self-reported with evidence, never inferred.','Null metrics mean unavailable, not zero.','A passing required test set is an operational oracle, not exhaustive correctness.']},null,2));
  } else throw Error('Use collect METADATA.json PLAYWRIGHT.json or summary');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
