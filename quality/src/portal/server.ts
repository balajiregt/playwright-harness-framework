import http,{type IncomingMessage,type ServerResponse} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdtemp,mkdir,rm,lstat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {prepareIntake,inspectIntake,saveIntakeDraft,acceptIntake} from '../intake/store.js';
import type {IntakeMappings} from '../intake/types.js';
import {taskList,taskDetail,registeredRun,originalDocument,projectRoot,validTask,validRun,guarded,runRelative} from './project.js';
import {attachReport,readReportFile} from './reports.js';

const staticRoot=fileURLToPath(new URL('./public/',import.meta.url));
const uuid=z.string().uuid(),task=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/);
const reportKind=z.enum(['playwright','mutation']);
const csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
class PortalError extends Error {constructor(message:string,readonly status=400){super(message);}}
async function body(req:IncomingMessage,max:number){
 const chunks:Buffer[]=[];let size=0;
 for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>max)throw new PortalError('Upload exceeds the local workbench limit',413);chunks.push(bytes);}
 return Buffer.concat(chunks);
}
async function jsonBody(req:IncomingMessage){if(!req.headers['content-type']?.startsWith('application/json'))throw new PortalError('Use JSON for this workbench action',415);return JSON.parse((await body(req,4*1024*1024)).toString('utf8'));}
async function formBody(req:IncomingMessage){
 const contentType=req.headers['content-type'];if(!contentType?.startsWith('multipart/form-data;'))throw new PortalError('Select files using the upload form',415);
 const bytes=await body(req,32*1024*1024);
 return new Request('http://127.0.0.1/',{method:'POST',headers:{'content-type':contentType},body:new Uint8Array(bytes)}).formData();
}
const textField=(form:FormData,name:string)=>{const value=form.get(name);if(typeof value!=='string')throw new PortalError('Missing form field: '+name);return value;};
function fileField(value:FormDataEntryValue|null):value is File{return value!==null&&typeof value!=='string'&&typeof value.arrayBuffer==='function';}
function fileName(value:string){if(!value||value!==path.basename(value)||/[\\\x00-\x1f\x7f]/.test(value)||value.startsWith('.'))throw new PortalError('Uploaded documents must have ordinary filenames');return value;}
function safeMessage(error:unknown){
 if(error instanceof z.ZodError)return 'Invalid workbench data: '+error.issues.slice(0,4).map(i=>i.path.join('.')+': '+i.message).join('; ');
 if(error instanceof SyntaxError)return 'Invalid JSON; document contents were not printed';
 if((error as NodeJS.ErrnoException)?.code)return 'Local evidence is unavailable or cannot be read. Check the selected files and permissions.';
 return error instanceof Error?error.message:'The workbench action could not be completed';
}
function send(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
function download(res:ServerResponse,name:string,bytes:Buffer){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(name)}`,'Content-Length':bytes.length});res.end(bytes);}

export async function startPortal(options:{repo:string;port?:number;python?:string}){
 const repo=await projectRoot(options.repo),token=randomBytes(32).toString('hex');let origin='',busy=false;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',csp);res.setHeader('Referrer-Policy','no-referrer');
  let ownsWrite=false;
  try{
   if(req.headers.host!==new URL(origin).host)throw new PortalError('The workbench only accepts its local loopback address',403);
   if(req.headers.origin&&req.headers.origin!==origin)throw new PortalError('Cross-origin workbench requests are refused',403);
   const url=new URL(req.url??'/',origin),segments=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
   if(!['GET','POST'].includes(req.method??''))throw new PortalError('Unsupported workbench action',405);
   if(req.method==='POST'){
    const supplied=req.headers['x-portal-token'];
    if(typeof supplied!=='string'||! /^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))throw new PortalError('Reload the workbench before making changes',403);
    if(busy)throw new PortalError('Another document or review action is in progress. Wait for it to finish.',409);
    busy=true;ownsWrite=true;
   }
   if(req.method==='GET'&&url.pathname==='/api/session'){send(res,200,{project:{name:path.basename(repo),root:repo},token});return;}
   if(req.method==='GET'&&url.pathname==='/api/tasks'){send(res,200,{tasks:await taskList(repo)});return;}
   if(req.method==='POST'&&url.pathname==='/api/tasks'){
    const form=await formBody(req),taskId=task.parse(textField(form,'taskId')),goal=z.enum(['assess','create','update']).parse(textField(form,'goal'));
    const files=form.getAll('files');if(!files.length||files.length>30||files.some(file=>!fileField(file)))throw new PortalError('Select between 1 and 30 documents');
    const sheet=form.get('sheet');if(sheet!==null&&typeof sheet!=='string')throw new PortalError('Invalid worksheet selection');
    const temp=await mkdtemp(path.join(os.tmpdir(),'playwright-portal-upload-'));
    try{
     const selected:string[]=[],sources:IntakeMappings['sources']={};
     for(const [index,value] of files.entries()){
      const file=value as File;if(file.size>10*1024*1024)throw new PortalError('Each document must be at most 10 MiB',413);
      const name=fileName(file.name),dir=path.join(temp,String(index));await mkdir(dir);
      const destination=path.join(dir,name);await writeFile(destination,Buffer.from(await file.arrayBuffer()),{flag:'wx',mode:0o600});selected.push(destination);
      if(typeof sheet==='string'&&sheet.trim()&&/\.xlsx?$/i.test(name))sources[name]={sheet:sheet.trim(),fields:{}};
     }
     const result=await prepareIntake({repo,task:taskId,goal,files:selected,python:options.python,mappings:Object.keys(sources).length?{sources}:undefined});
     send(res,201,{taskId,runId:path.basename(result.run)});return;
    }finally{await rm(temp,{recursive:true,force:true});}
   }
   if(segments[0]==='api'&&segments[1]==='tasks'&&segments[2]){
    const taskId=validTask(segments[2]);
    if(req.method==='GET'&&segments.length===3){const run=url.searchParams.get('run');send(res,200,await taskDetail(repo,taskId,run?validRun(run):undefined));return;}
    if(req.method==='POST'&&segments.length===4&&segments[3]==='draft'){
     const input=z.object({runId:uuid,draft:z.unknown()}).strict().parse(await jsonBody(req));
     await saveIntakeDraft({run:await registeredRun(repo,taskId,input.runId),draft:input.draft});send(res,200,await taskDetail(repo,taskId,input.runId));return;
    }
    if(req.method==='POST'&&segments.length===4&&segments[3]==='accept'){
     const input=z.object({runId:uuid,reviewHash:z.string().regex(/^[a-f0-9]{64}$/),reviewedBy:z.string().trim().min(1).max(120),confirmReviewed:z.literal(true),replaceReviewed:z.boolean().optional()}).strict().parse(await jsonBody(req));
     const run=await registeredRun(repo,taskId,input.runId),current=await inspectIntake({run});
     if(current.draftHash!==input.reviewHash)throw new PortalError('The criteria changed since this view was loaded. Refresh and review the new version.',409);
     await acceptIntake({run,reviewedBy:input.reviewedBy,confirmReviewed:true,replaceReviewed:input.replaceReviewed,expectedDraftHash:input.reviewHash});send(res,200,await taskDetail(repo,taskId,input.runId));return;
    }
    if(req.method==='POST'&&segments.length===4&&segments[3]==='reimport'){
     const input=z.object({runId:uuid,mappings:z.unknown()}).strict().parse(await jsonBody(req)),run=await registeredRun(repo,taskId,input.runId);
     const previous=await inspectIntake({run,allowStale:true});
     const mapping=z.object({sources:z.record(z.string(),z.unknown())}).strict().parse(input.mappings);
     const merged={sources:{...previous.snapshot.mappings?.sources,...mapping.sources}} as IntakeMappings;
     const files:string[]=[],sourceNames:Record<string,string>={};
     for(const source of previous.snapshot.sources){const file=(await guarded(repo,`contexts/tasks/${taskId}/${source.file}`,'file'))!;files.push(file);sourceNames[file]=source.name;}
     const result=await prepareIntake({repo,task:taskId,goal:previous.snapshot.goal,files,sourceNames,mappings:merged,python:options.python});
     send(res,200,await taskDetail(repo,taskId,path.basename(result.run)));return;
    }
    if(req.method==='POST'&&segments.length===4&&segments[3]==='reports'){
     const form=await formBody(req),kind=reportKind.parse(textField(form,'kind')),file=form.get('file');if(!fileField(file))throw new PortalError('Select a recorded JSON report');
     await attachReport({repo,taskId,kind,name:fileName(file.name),bytes:Buffer.from(await file.arrayBuffer())});send(res,201,await taskDetail(repo,taskId));return;
    }
    if(req.method==='GET'&&segments.length===5&&segments[3]==='reports'){
     const report=await readReportFile(repo,taskId,uuid.parse(segments[4]));download(res,report.name,report.bytes);return;
    }
    if(req.method==='GET'&&segments[3]==='runs'&&segments[4]){
     const runId=validRun(segments[4]);await registeredRun(repo,taskId,runId);
     if(segments.length===6&&segments[5]==='matrix.csv'){
      const file=(await guarded(repo,`${runRelative(taskId,runId)}/matrix.csv`,'file'))!;if((await lstat(file)).size>4*1024*1024)throw new PortalError('Traceability CSV exceeds the workbench limit',413);download(res,`${taskId}-traceability.csv`,await readFile(file));return;
     }
     if(segments.length===7&&segments[5]==='documents'){
      const document=await originalDocument(repo,taskId,runId,segments[6]);download(res,document.name,document.bytes);return;
     }
    }
   }
   if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
   if(req.method==='GET'){
    const assets:Record<string,[string,string]>={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
    const selected=assets[url.pathname];if(selected){res.writeHead(200,{'Content-Type':selected[1]+'; charset=utf-8'});res.end(await readFile(path.join(staticRoot,selected[0])));return;}
   }
   throw new PortalError('This workbench page or action was not found',404);
  }catch(error){if(!res.headersSent)send(res,error instanceof PortalError?error.status:400,{error:safeMessage(error)});else res.end();}
  finally{if(ownsWrite)busy=false;}
 });
 server.requestTimeout=120000;server.headersTimeout=15000;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??8792,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
 const address=server.address();if(!address||typeof address==='string')throw Error('Cannot determine workbench address');
 origin=`http://127.0.0.1:${address.port}`;
 return {server,origin,repo,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
