import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {prepareIntake,reviewIntake,acceptIntake} from './intake/store.js';

const help=`Playwright Agent document intake — local files, no model calls or publication

intake prepare --repo PROJECT --task LOGIN-123 --goal create|update|assess
  --file DOCUMENT [--file DOCUMENT ...] [--mapping MAPPING.json] [--python PYTHON]
intake review --run RUN_DIRECTORY [--draft DRAFT.json]
intake accept --run RUN_DIRECTORY [--draft DRAFT.json]
  --reviewed-by NAME --confirm-reviewed [--replace-reviewed]

Prepare freezes selected originals in the project's private contexts/tasks/<ID>/.
Drafts, source segments and review evidence stay under artifacts/agent-tasks/<ID>/.
The coding agent handles the draft JSON; testers review criteria and clarifications.
Accept confirms requirement interpretation only. No test or product is marked passed.
File and run paths are caller-relative; --task is an ID, never a path.
`;
async function main(){
 const [command,...args]=process.argv.slice(2);if(!command||command==='help'||command==='--help'){console.log(help);return;}
 const allowed:Record<string,string[]>={prepare:['--repo','--task','--goal','--file','--mapping','--python'],review:['--run','--draft'],accept:['--run','--draft','--reviewed-by','--confirm-reviewed','--replace-reviewed']};
 if(!Object.hasOwn(allowed,command))throw Error('Unknown intake command; use intake help');
 const flags:Record<string,string>={},files:string[]=[];
 while(args.length){const key=args.shift()!;if(!allowed[command].includes(key)||key!=='--file'&&Object.hasOwn(flags,key))throw Error('Unknown or duplicate intake argument; use intake help');
  if(['--confirm-reviewed','--replace-reviewed'].includes(key)){flags[key]='true';continue;}
  const value=args.shift();if(!value||value.startsWith('--'))throw Error('Missing intake argument value');
  if(key==='--file')files.push(path.resolve(value));else flags[key]=value;
 }
 if(command==='prepare'){
  if(!flags['--repo']||!flags['--task'])throw Error('prepare requires --repo and --task');
  const goal=flags['--goal']??'assess';if(!['create','update','assess'].includes(goal))throw Error('--goal must be create, update or assess');
  const mappings=flags['--mapping']?JSON.parse(await readFile(path.resolve(flags['--mapping']),'utf8')):undefined;
  console.log(JSON.stringify(await prepareIntake({repo:path.resolve(flags['--repo']),task:flags['--task'],files,goal:goal as 'create'|'update'|'assess',python:flags['--python']?path.resolve(flags['--python']):undefined,mappings}),null,2));
 }else{
  if(!flags['--run'])throw Error(command+' requires --run');
  const options={run:path.resolve(flags['--run']),draft:flags['--draft']?path.resolve(flags['--draft']):undefined};
  console.log(JSON.stringify(command==='review'?await reviewIntake(options):await acceptIntake({...options,reviewedBy:flags['--reviewed-by']??'',confirmReviewed:flags['--confirm-reviewed']==='true',replaceReviewed:flags['--replace-reviewed']==='true'}),null,2));
 }
}
main().catch(error=>{console.error(error instanceof z.ZodError?'Invalid intake data: '+error.issues.slice(0,5).map(i=>i.path.join('.')+': '+i.message).join('; '):error instanceof SyntaxError?'Invalid intake JSON; source content was not printed':error.message);process.exitCode=1;});
