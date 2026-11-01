import path from 'node:path';
import {readFile,lstat} from 'node:fs/promises';
import {startPortal} from './portal/server.js';
import {attachReport} from './portal/reports.js';
import {projectRoot,validTask} from './portal/project.js';

const help=`Playwright Agent local workbench
  portal [serve] --repo PROJECT [--port 8792] [--python PATH]
  portal attach --repo PROJECT --task LOGIN-123 --kind playwright|mutation --file REPORT.json

Runs only on 127.0.0.1. Upload and review documents, inspect traceability,
and attach recorded test/mutation reports. No model, test, mutation campaign,
publication or deployment starts when the portal is opened.
`;
async function main(){
 const args=process.argv.slice(2);if(args.includes('--help')||args[0]==='help'){console.log(help);return;}
 const command=args[0]&&!args[0].startsWith('--')?args.shift()!:'serve';if(!['serve','attach'].includes(command))throw Error('Use portal help');
 const names=command==='serve'?['--repo','--port','--python']:['--repo','--task','--kind','--file'],flags:Record<string,string>={};
 while(args.length){const key=args.shift()!,value=args.shift();if(!names.includes(key)||!value||value.startsWith('--')||Object.hasOwn(flags,key))throw Error('Invalid portal arguments; use portal help');flags[key]=value;}
 if(!flags['--repo'])throw Error('--repo is required');
 const repo=await projectRoot(flags['--repo']);
 if(command==='attach'){
  const kind=flags['--kind'];if(kind!=='playwright'&&kind!=='mutation'||!flags['--task']||!flags['--file'])throw Error('attach requires --task, --kind and --file');
  const file=path.resolve(flags['--file']),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size>5*1024*1024)throw Error('Select a regular JSON report of at most 5 MiB');
  console.log(JSON.stringify(await attachReport({repo,taskId:validTask(flags['--task']),kind,name:path.basename(file),bytes:await readFile(file)}),null,2));return;
 }
 const port=flags['--port']?Number(flags['--port']):8792;if(!Number.isInteger(port)||port<1024||port>65535)throw Error('--port must be between 1024 and 65535');
 const app=await startPortal({repo,port,python:flags['--python']?path.resolve(flags['--python']):undefined});
 console.log(`Playwright Agent workbench: ${app.origin}\nProject: ${repo}\nKeep this process running while using the local portal. Ctrl+C stops it.`);
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0),()=>process.exit(1));});
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Cannot start the local workbench');process.exitCode=1;});
