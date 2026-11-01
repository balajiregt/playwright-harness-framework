import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const documents=['epic.md','jira-tickets.json','requirements.json'] as const;

/** Verify the tracked synthetic task in place; preparation never copies or changes task files. */
export async function prepareTask(target:string,product:string){
 const relative=path.relative(path.resolve(product),path.resolve(target));
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Demo task must remain inside the selected product');
 const productInfo=await lstat(product);
 if(productInfo.isSymbolicLink()||!productInfo.isDirectory())throw Error('Selected product must be a real directory');
 const root=await realpath(product),task=path.join(root,relative);
 let current=root;
 for(const part of relative.split(path.sep)){
  current=path.join(current,part);
  try{const info=await lstat(current);if(info.isSymbolicLink()||!info.isDirectory())throw Error('Demo task ancestors must be real directories');}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;throw Error('Bundled demo task directory is missing. Restore it from the repository or source ZIP.');}
 }
 const entries=await readdir(task,{withFileTypes:true});
 if(entries.some(entry=>!(documents as readonly string[]).includes(entry.name)))throw Error('Unexpected entry in the bundled demo task. Keep private work items in a separate task folder.');
 const files:{file:string;sha256:string}[]=[];
 for(const name of documents){
  if(!entries.some(entry=>entry.name===name))throw Error(`Bundled demo task is missing ${name}. Restore the tracked file from the repository or source ZIP.`);
  const file=path.join(task,name),info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink())throw Error('Demo task documents must be regular files, not directories or symlinks');
  const source=await readFile(file);
  if(!source.toString('utf8').trim())throw Error(`Bundled demo task document is empty: ${name}`);
  files.push({file:name,sha256:createHash('sha256').update(source).digest('hex')});
 }
 return {task,files};
}
