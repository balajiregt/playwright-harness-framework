import {loadConfig} from './mutation/schema.js';
import {mutationTools} from './mutation/tools.js';
import {serveMutationMcp} from './mutation/mcp.js';
import {serveAnalysisMcp} from './mutation/analysis-mcp.js';
import {freezeWorkload} from './mutation/workload.js';
import {compareAnalysis} from './mutation/analysis.js';
import {exportPlatform} from './mutation/platform.js';
const args=process.argv.slice(2),command=args.shift();
function flag(name:string,fallback?:string){const i=args.indexOf('--'+name);if(i<0)return fallback;const v=args[i+1];if(!v||v.startsWith('--'))throw Error('Missing --'+name+' value');return v;}
async function main(){
 if(!command||command==='help'){console.log('mutation context|evidence|plan|inspect|assess|run|mcp --config FILE\nmutation freeze --catalogue FILE --config FILE\nmutation compare --workload FILE --engines laya,codex --config FILE --allow-hosted [--allow-run | --campaign FILE] [--imports FILE,FILE]\nplan/codex require --allow-hosted; execution requires --allow-run. Detailed artifacts stay local.');return;}
 if(command==='analysis-mcp'){const file=flag('workload');if(!file)throw Error('--workload is required');await serveAnalysisMcp(file,flag('pair'));return;}
 if(command==='export'){const file=flag('report');if(!file)throw Error('--report is required');console.log(JSON.stringify(await exportPlatform(file,flag('policy','.platform-publish.json')!),null,2));return;}
 const c=await loadConfig(flag('config','mutation.config.local.json')!),options={allowHosted:args.includes('--allow-hosted'),allowRun:args.includes('--allow-run')};
 if(command==='freeze'){const result=await freezeWorkload(c,flag('catalogue',c.output+'/plan.json')!);console.log(JSON.stringify({file:result.file,hash:result.workload.hash,pairs:result.workload.pairs.length},null,2));return;}
 if(command==='compare'){const workload=flag('workload');if(!workload)throw Error('--workload is required');const result=await compareAnalysis(c,workload,flag('engines','laya,codex')!.split(',').filter(e=>e!=='none'),{...options,campaignFile:flag('campaign'),imports:flag('imports')?.split(','),previousFile:flag('previous')});console.log(JSON.stringify({report:result.dir+'/index.html',metrics:result.metrics},null,2));if(result.report.engines.some(e=>e.cells.some(c=>c.status==='error'||c.status==='not_run')))process.exitCode=2;return;}
 if(command==='mcp'){await serveMutationMcp(c,options);return;}
 const tools=mutationTools(c,options);if(!Object.hasOwn(tools,command))throw Error('Unknown mutation command');
 console.log(JSON.stringify(await tools[command as keyof typeof tools](),null,2));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Mutation command failed');process.exitCode=1;});
