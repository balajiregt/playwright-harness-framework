import http,{type ServerResponse} from 'node:http';
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {taskList,taskDetail,registeredRun,originalDocument,projectRoot,validTask,validRun,guarded,runRelative} from './project.js';
import {readReportFile} from './reports.js';

const staticRoot=fileURLToPath(new URL('./public/',import.meta.url));
const uuid=z.string().uuid();
const csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
class PortalError extends Error {constructor(message:string,readonly status=400){super(message);}}
function safeMessage(error:unknown){
 if(error instanceof z.ZodError)return 'Invalid report selection: '+error.issues.slice(0,4).map(i=>i.path.join('.')+': '+i.message).join('; ');
 if(error instanceof SyntaxError)return 'Invalid saved JSON; document contents were not printed';
 if((error as NodeJS.ErrnoException)?.code)return 'Local evidence is unavailable or cannot be read. Check the selected files and permissions.';
 return error instanceof Error?error.message:'The saved report could not be read';
}
function send(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
function download(res:ServerResponse,name:string,bytes:Buffer){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="download"; filename*=UTF-8\'\''+encodeURIComponent(name),'Content-Length':bytes.length});res.end(bytes);}

/** Reads the agent's saved artifacts. No uploads, edits, execution or recovery writes. */
export async function startPortal(options:{repo:string;port?:number}){
 const repo=await projectRoot(options.repo);let origin='';
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',csp);res.setHeader('Referrer-Policy','no-referrer');
  try{
   if(req.headers.host!==new URL(origin).host)throw new PortalError('The report viewer only accepts its local loopback address',403);
   if(req.headers.origin&&req.headers.origin!==origin)throw new PortalError('Cross-origin report requests are refused',403);
   if(req.method!=='GET'){res.setHeader('Allow','GET');throw new PortalError('The report viewer is read-only. Use your coding agent and project CLI for changes and execution.',405);}
   const url=new URL(req.url??'/',origin),segments=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
   if(url.pathname==='/api/session'){send(res,200,{project:{name:path.basename(repo),root:repo}});return;}
   if(url.pathname==='/api/tasks'){send(res,200,{tasks:await taskList(repo)});return;}
   if(segments[0]==='api'&&segments[1]==='tasks'&&segments[2]){
    const taskId=validTask(segments[2]);
    if(segments.length===3){const run=url.searchParams.get('run');send(res,200,await taskDetail(repo,taskId,run?validRun(run):undefined));return;}
    if(segments.length===5&&segments[3]==='reports'){
     const report=await readReportFile(repo,taskId,uuid.parse(segments[4]));download(res,report.name,report.bytes);return;
    }
    if(segments[3]==='runs'&&segments[4]){
     const runId=validRun(segments[4]);await registeredRun(repo,taskId,runId);
     if(segments.length===6&&segments[5]==='matrix.csv'){
      const file=(await guarded(repo,runRelative(taskId,runId)+'/matrix.csv','file'))!;
      if((await lstat(file)).size>4*1024*1024)throw new PortalError('Traceability CSV exceeds the viewer limit',413);
      download(res,taskId+'-traceability.csv',await readFile(file));return;
     }
     if(segments.length===7&&segments[5]==='documents'){
      const document=await originalDocument(repo,taskId,runId,segments[6]);download(res,document.name,document.bytes);return;
     }
    }
   }
   if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
   const assets:Record<string,[string,string]>={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
   const selected=assets[url.pathname];
   if(selected){res.writeHead(200,{'Content-Type':selected[1]+'; charset=utf-8'});res.end(await readFile(path.join(staticRoot,selected[0])));return;}
   throw new PortalError('This report page or saved artifact was not found',404);
  }catch(error){if(!res.headersSent)send(res,error instanceof PortalError?error.status:400,{error:safeMessage(error)});else res.end();}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??8792,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
 const address=server.address();if(!address||typeof address==='string')throw Error('Cannot determine report viewer address');
 origin='http://127.0.0.1:'+address.port;
 return {server,origin,repo,close:async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
