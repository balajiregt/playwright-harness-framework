import {spawn} from 'node:child_process';
export interface ProcessResult {code:number|null;stdout:string;stderr:string;timedOut:boolean;wallMs:number}
export function runProcess(command:string,args:string[],cwd:string,env:NodeJS.ProcessEnv,timeoutMs:number,input?:string):Promise<ProcessResult>{
 return new Promise((resolve,reject)=>{
  const start=performance.now(),child=spawn(command,args,{cwd,env,stdio:'pipe',detached:process.platform!=='win32'});
  let stdout='',stderr='',timedOut=false,overflow=false,killTimer:NodeJS.Timeout|undefined;
  const kill=(signal:NodeJS.Signals)=>{try{if(process.platform==='win32')child.kill(signal);else process.kill(-child.pid!,signal);}catch{}};
  const timer=setTimeout(()=>{timedOut=true;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),1500);},timeoutMs);
  child.stdout.on('data',b=>{stdout+=b;if(stdout.length>4*1024*1024){overflow=true;kill('SIGTERM');}});
  child.stderr.on('data',b=>{stderr+=b;if(stderr.length>1024*1024){overflow=true;kill('SIGTERM');}});
  child.on('error',()=>{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);reject(Error('Local process could not start'));});
  child.on('close',code=>{if(timedOut||overflow)kill('SIGKILL');clearTimeout(timer);if(killTimer)clearTimeout(killTimer);if(overflow)reject(Error('Process output limit exceeded'));else resolve({code,stdout,stderr,timedOut,wallMs:performance.now()-start});});
  child.stdin.on('error',()=>{});child.stdin.end(input??'');
 });
}
