import {readFile,writeFile,mkdir,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function prepareTask(template:string,target:string,product:string){
 const relative=path.relative(path.resolve(product),path.resolve(target));
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Demo task must remain inside the selected product');
 const root=await realpath(product),task=path.join(root,relative);
 let current=root;
 for(const part of relative.split(path.sep)){
  current=path.join(current,part);
  try{const info=await lstat(current);if(info.isSymbolicLink()||!info.isDirectory())throw Error('Demo task ancestors must be real directories');}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 }
 const pending:{destination:string;source:Buffer}[]=[],files:{file:string;sha256:string}[]=[];
 for(const entry of await readdir(template,{withFileTypes:true})){
  if(!entry.isFile()||entry.name.startsWith('.'))throw Error('Demo task template must contain regular public files only');
  const source=await readFile(path.join(template,entry.name)),destination=path.join(task,entry.name);
  let existing:Buffer|undefined;
  try{const info=await lstat(destination);if(!info.isFile()||info.isSymbolicLink())throw Error('Task documents must be regular files');existing=await readFile(destination);}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(existing&&!existing.equals(source))throw Error(`Existing demo task differs: ${entry.name}. Preserve it and choose another work item.`);
  if(!existing)pending.push({destination,source});
  files.push({file:entry.name,sha256:createHash('sha256').update(source).digest('hex')});
 }
 // Nothing is created until every existing ancestor and document has passed.
 await mkdir(task,{recursive:true});
 for(const item of pending)await writeFile(item.destination,item.source,{flag:'wx'});
 return {task,files};
}
