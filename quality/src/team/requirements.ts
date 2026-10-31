import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../context.js';
import {requirementsSchema} from './config.js';
const exec=promisify(execFile);
export async function importRequirements(file:string,python:string){
 if((await stat(file)).size>10*1024*1024)throw Error('Requirement input exceeds 10 MiB');
 let raw:unknown;
 if(path.extname(file).toLowerCase()==='.json')raw=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
 else{try{const {stdout}=await exec(python,[path.join(ROOT,'python/import_requirements.py'),file],{timeout:45000,maxBuffer:4*1024*1024});raw=JSON.parse(stdout);}catch(e){const message=(e as any).stderr?.trim();throw Error(message||'Document import failed; install importer dependencies and check the format');}}
 return requirementsSchema.parse(raw);
}
