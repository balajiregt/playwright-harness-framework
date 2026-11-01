import path from 'node:path';
import {readFile,lstat} from 'node:fs/promises';
import {startPortal} from './portal/server.js';
import {attachReport} from './portal/reports.js';
import {projectRoot,validTask,validRun,registeredRun} from './portal/project.js';
import {recordAgentAnalysis} from './portal/analysis.js';

const help=`Playwright Agent local report viewer
  portal [serve] --repo PROJECT [--task LOGIN-123] [--port 8792]
  portal analysis --repo PROJECT --task LOGIN-123 --run UUID --file analysis.md
  portal attach --repo PROJECT --task LOGIN-123 --kind playwright|mutation --file REPORT.json

Runs only on 127.0.0.1. The browser is read-only: inspect the agent's saved
analysis, source-linked criteria, traceability and recorded test/mutation results.
Finish the requested work in your coding agent and project CLI, then open its
task report. Partial and assess-only reports preserve missing/not-run evidence.
The analysis and attach commands prepare local artifacts outside the browser;
they do not execute tests, approve criteria or invoke another model.
--file paths are caller-relative.
`;
async function main(){
 const args=process.argv.slice(2);if(args.includes('--help')||args[0]==='help'){console.log(help);return;}
 const command=args[0]&&!args[0].startsWith('--')?args.shift()!:'serve';if(!['serve','attach','analysis'].includes(command))throw Error('Use portal help');
 const names=command==='serve'?['--repo','--task','--port']:command==='analysis'?['--repo','--task','--run','--file']:['--repo','--task','--kind','--file'],flags:Record<string,string>={};
 while(args.length){const key=args.shift()!;if(command==='serve'&&['--allow-run','--run-config','--python'].includes(key))throw Error('The portal is now a read-only report viewer. Use the intake and project test/mutation CLI commands in your coding agent.');if(!names.includes(key)||Object.hasOwn(flags,key))throw Error('Invalid portal arguments; use portal help');const value=args.shift();if(!value||value.startsWith('--'))throw Error('Invalid portal arguments; use portal help');flags[key]=value;}
 if(!flags['--repo'])throw Error('--repo is required');
 const repo=await projectRoot(flags['--repo']);
 if(command==='analysis'){
  if(!flags['--task']||!flags['--run']||!flags['--file'])throw Error('analysis requires --task, --run and --file');
  const run=await registeredRun(repo,validTask(flags['--task']),validRun(flags['--run']));
  console.log(JSON.stringify(await recordAgentAnalysis({run,file:path.resolve(flags['--file'])}),null,2));return;
 }
 if(command==='attach'){
  const kind=flags['--kind'];if(kind!=='playwright'&&kind!=='mutation'||!flags['--task']||!flags['--file'])throw Error('attach requires --task, --kind and --file');
  const file=path.resolve(flags['--file']),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>5*1024*1024)throw Error('Select a regular JSON report of at most 5 MiB');
  console.log(JSON.stringify(await attachReport({repo,taskId:validTask(flags['--task']),kind,name:path.basename(file),bytes:await readFile(file)}),null,2));return;
 }
 const port=flags['--port']?Number(flags['--port']):8792;if(!Number.isInteger(port)||port<1024||port>65535)throw Error('--port must be between 1024 and 65535');
 const task=flags['--task']?validTask(flags['--task']):undefined;
 const app=await startPortal({repo,port});
 const url=new URL(app.origin);if(task)url.hash=new URLSearchParams({task,tab:'overview'}).toString();
 console.log(`Playwright Agent report viewer: ${url}\nProject: ${repo}\nRead-only: saved evidence, no browser uploads, edits or execution.\nKeep this process running while viewing reports. Ctrl+C stops it.`);
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0),()=>process.exit(1));});
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Cannot start the local report viewer');process.exitCode=1;});
