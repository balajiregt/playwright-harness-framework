import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT} from './context.js';
import {configSchema,loadConfig} from './team/config.js';
import {importRequirements} from './team/requirements.js';
import {collect,applyHistory} from './team/collect.js';
import {makeProvider} from './team/providers.js';
import {evaluate} from './team/evaluate.js';
import {saveReport} from './team/report.js';
import {publishMetrics} from './team/publish.js';
import {runComparison,attachReviews,saveComparison,executeSmoke,type Comparison,type ComparisonProvider} from './team/comparison.js';
import {validateComparisonMetrics} from '../shared/comparison-metrics.mjs';
import {validateTeamMetrics} from './team/metrics.js';
const args=process.argv.slice(2),command=args.shift();
function flag(name:string,fallback?:string){const i=args.indexOf('--'+name);if(i<0)return fallback;const value=args[i+1];if(!value||value.startsWith('--'))throw Error(`Missing --${name} value`);return value;}
async function main(){
 if(!command||command==='help'){console.log('qa init --repo PATH --requirements FILE [--config FILE]\nqa import|collect|record|run --config FILE\nqa compare --providers laya,jev --allow-hosted --config FILE [--reviews FILE]\nqa record --comparison --config FILE\nqa review --report comparison.json --reviews labels.json\nqa smoke --report comparison.json --provider laya|jev --config FILE\nqa validate-metrics --metrics FILE\nqa publish --metrics FILE [--repository owner/repo]\nFormats: JSON, XLS, XLSX, DOCX, DOC. Hosted comparison and publication are explicit.');return;}
 const configFile=path.resolve(flag('config','decision-bench.config.local.json')!);
 if(command==='init'){
  const repo=flag('repo'),requirements=flag('requirements');if(!repo||!requirements)throw Error('init requires --repo and --requirements');
  const c=configSchema.parse({version:1,repo:path.resolve(repo),requirements:path.resolve(requirements),python:path.join(ROOT,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python'),output:path.join(ROOT,'artifacts/team'),playwrightConfig:flag('playwright-config','playwright.config.ts')});
  await writeFile(configFile,JSON.stringify(c,null,2),{flag:'wx'});console.log(`Created ${configFile}. Configure local provider and smoke policy; run qa import to inspect normalized requirements.`);return;
 }
 if(command==='validate-metrics'||command==='publish'){
  const file=flag('metrics');if(!file)throw Error('--metrics is required');
  if(command==='validate-metrics'){const data=JSON.parse(await readFile(file,'utf8'));(data.schemaVersion===2?validateComparisonMetrics:validateTeamMetrics)(data);console.log('Valid metrics-only export');}
  else console.log(await publishMetrics(file,flag('repository')));return;
 }
 if(command==='review'||command==='smoke'){
  const file=flag('report');if(!file)throw Error('--report is required');const report=JSON.parse(await readFile(file,'utf8')) as Comparison;
  if(report.kind!=='playwright-decision-comparison')throw Error('Expected comparison.json');
  const dir=path.dirname(path.resolve(file));
  if(command==='review'){const reviews=flag('reviews');if(!reviews)throw Error('--reviews is required');const input=JSON.parse(await readFile(reviews,'utf8'));attachReviews(report,input);await writeFile(path.join(dir,`review-event-${randomUUID()}.json`),JSON.stringify(input,null,2));await saveComparison(dir,report);}
  else{const provider=flag('provider');if(provider!=='laya'&&provider!=='jev')throw Error('--provider must be laya or jev');if(!await executeSmoke(await loadConfig(configFile),report,provider,dir))process.exitCode=1;}
  console.log(`Updated local report: ${path.join(dir,'index.html')}`);return;
 }
 if(!['import','collect','record','run','compare'].includes(command))throw Error('Unknown command; use qa help');
 const c=await loadConfig(configFile);await mkdir(c.output,{recursive:true});
 if(command==='compare'){const providers=(flag('providers','laya')!.split(',')) as ComparisonProvider[];const {dir,report}=await runComparison(c,providers,args.includes('--allow-hosted'),flag('reviews'));console.log(`Local report: ${path.join(dir,'index.html')}\nPrivate viewer import: ${path.join(dir,'comparison.json')}\nMetrics-only export: ${path.join(dir,'metrics.json')}`);if(Object.values(report.runs).some(r=>r.cells.some(x=>x.status==='error')))process.exitCode=2;return;}
 if(command==='import'){const requirements=await importRequirements(c.requirements,c.python);const dest=path.join(c.output,'requirements.normalized.json');await writeFile(dest,JSON.stringify(requirements,null,2));console.log(`Imported ${requirements.requirements.length} requirements: ${dest}`);return;}
 if(command==='record'||command==='collect'){
  const inventory=await collect(c,command==='record',args.includes('--comparison'));const file=path.join(c.output,command==='record'?`history-${randomUUID()}.json`:'inventory.json');await writeFile(file,JSON.stringify(inventory,null,2));console.log(`${inventory.tests.length} tests: ${file}${command==='record'?'\nAdd this file to config.history to use measured duration and reliability.':''}`);if(command==='record'&&inventory.executionStatus!=='passed')process.exitCode=1;return;
 }
 const requirements=await importRequirements(c.requirements,c.python);const inventory=await applyHistory(await collect(c),c.history);
 const pairs=requirements.requirements.length*inventory.tests.filter(t=>t.runnable).length;if(pairs>c.maxPairs)throw Error(`Needs ${pairs} pairs; configured maxPairs is ${c.maxPairs}. Narrow projects/requirements or explicitly raise the limit.`);
 const provider=await makeProvider(c);
 try{let report=await evaluate(c,requirements.requirements,inventory,provider,(n,total)=>{if(n===total||n%10===0)console.log(`Processed ${n}/${total} pairs`);});const dir=path.join(c.output,report.runId);await saveReport(dir,report);const errors=report.cells.filter(c=>c.status==='error').length;console.log(`${report.cells.filter(c=>c.status==='evaluated').length} valid decisions; ${errors} provider errors. All findings require review.`);if(errors)process.exitCode=2;console.log(`Local report: ${path.join(dir,'index.html')}\nPublic export: ${path.join(dir,'metrics.json')}`);}finally{provider.close();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Command failed');process.exitCode=1;});
