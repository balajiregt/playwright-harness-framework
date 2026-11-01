import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const productRoot=fileURLToPath(new URL('../',import.meta.url));
export const qualityRoot=path.join(productRoot,'quality');
const scripts={
  intake:['src/intake-cli.ts'],
  portal:['src/portal-cli.ts'],
  demo:['src/demo-cli.ts'],
  qa:['src/team-cli.ts'], mutation:['src/mutation-cli.ts'], export:['src/mutation-cli.ts','export'],
  'context:resolve':['src/workflow-cli.ts','resolve'], 'review:preview':['src/workflow-cli.ts','preview'],
  'benchmark:crm:preview':['src/workflow-cli.ts','preview','--input','benchmarks/crm-inputs.json'],
  'compare:preview':['src/comparison-cli.ts','preview'], 'bench:preview':['src/bench-cli.ts','preview'],
  'bench:preflight':['src/bench-cli.ts','preflight'], 'bench:live':['src/bench-cli.ts','live'],
  'bench:report':['src/bench-refresh.ts'], 'benchmark:metrics':['src/benchmark-metrics.ts']
};
export function qualityInvocation(command,args=[],runtime={}) {
  const root=runtime.root??qualityRoot,node=runtime.node??process.execPath;
  const require=createRequire(path.join(root,'package.json'));
  if(command==='benchmark:export')command='export';
  if(command==='code-mode')return {command:node,args:['--no-node-snapshot',path.join(root,'integrations/code-mode/server.mjs'),...args]};
  if(command==='platform:publish')return {command:node,args:[path.join(root,'.agents/skills/platform-publish/scripts/cli.mjs'),...args]};
  if(command==='typecheck')return {command:node,args:[require.resolve('typescript/bin/tsc'),'--project',path.join(root,'tsconfig.json'),...args]};
  if(command==='test')return {command:node,args:['--import',pathToFileURL(require.resolve('tsx')).href,'--test',...readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.ts')).map(f=>path.join(root,'tests',f)),...args]};
  const selected=scripts[command];
  if(!selected)throw Error('Unknown quality command. Use qa, mutation, export or code-mode.');
  if(command==='export'&&!args.some(a=>a==='--policy'||a.startsWith('--policy=')))args=[...args,'--policy',path.join(root,'.platform-publish.json')];
  return {command:node,args:['--import',pathToFileURL(require.resolve('tsx')).href,path.join(root,selected[0]),...selected.slice(1),...args]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const invocation=qualityInvocation(process.argv[2],process.argv.slice(3));
    // Preserve caller cwd so supplied config, report and repository paths keep their meaning.
    const child=spawn(invocation.command,invocation.args,{cwd:process.cwd(),env:process.env,stdio:'inherit'});
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
    child.on('error',()=>{console.error('Cannot start Playwright Agent quality command. Run npm ci --prefix quality.');process.exitCode=1;});
    child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
  }catch(error){console.error(error.code==='MODULE_NOT_FOUND'?'Quality dependencies are missing. Run npm ci --prefix quality.':error.message);process.exitCode=1;}
}
