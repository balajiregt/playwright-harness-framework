import {z} from 'zod';
import path from 'node:path';
import {readFile,realpath} from 'node:fs/promises';

export const relativePath=z.string().min(1).max(240).refine(s=>!path.isAbsolute(s)&&!s.split(/[\\/]/).some(p=>p==='..'||p.startsWith('.')),'Use a relative non-hidden path');
export const configSchema=z.object({
 version:z.literal(1),repo:z.string(),artifactDir:z.string(),output:z.string().default('artifacts/mutations'),
 playwrightConfig:relativePath.default('playwright.config.ts'),sourceFiles:z.array(relativePath).min(1).max(8),
 projects:z.array(z.string()).default([]),maxMutations:z.number().int().min(1).max(10).default(3),
 baselineRuns:z.number().int().min(2).max(5).default(2),testTimeoutMs:z.number().int().min(1000).max(60000).default(5000),
 suiteTimeoutMs:z.number().int().min(10000).max(900000).default(180000),
 env:z.record(z.string(),z.string()).default({}),python:z.string().default('.venv/bin/python'),
 probeSetup:z.object({module:relativePath,export:z.string().regex(/^[A-Za-z_$][\w$]*$/)}).optional(),
 readiness:z.object({testId:z.string().min(1),text:z.string()}).optional(),
 codexModel:z.string().optional(),codexTimeoutMs:z.number().int().min(10000).max(900000).default(180000),
 laya:z.object({device:z.enum(['auto','mps','cpu']).default('auto'),maxPairs:z.number().int().min(1).max(2000).default(200)}).default({device:'auto',maxPairs:200}),
 analysis:z.object({scope:z.enum(['synthetic','local']).default('local'),codeModeNode:z.string().optional()}).strict().default({scope:'local'})
}).strict();
export type MutationConfig=z.infer<typeof configSchema>;
export const requirement=z.object({id:z.string().regex(/^[\w-]{1,60}$/),criterion:z.string().min(5).max(2000),critical:z.boolean(),source:z.object({artifactId:z.string(),quote:z.string().min(5).max(2000)}).strict()}).strict();
export const mutation=z.object({id:z.string().regex(/^[\w-]{1,60}$/),requirementId:z.string(),description:z.string().min(5).max(500),file:relativePath,before:z.string().min(1).max(4000),after:z.string().min(1).max(4000),probe:z.object({project:z.string(),path:z.string().refine(s=>s.startsWith('/')&&!s.startsWith('//')&&!s.includes('://')),testId:z.string().min(1).max(120),kind:z.enum(['count','text']),expected:z.string().max(1000),roles:z.array(z.string()).max(8)}).strict()}).strict();
export const planSchema=z.object({version:z.literal(1),contextHash:z.string().regex(/^[a-f0-9]{64}$/),requirements:z.array(requirement).min(1).max(30),mutations:z.array(mutation).min(1).max(10)}).strict();
export type MutationPlan=z.infer<typeof planSchema>;
export type Mutant=z.infer<typeof mutation>;
export async function loadConfig(file:string){
 const full=path.resolve(file),base=path.dirname(full),c=configSchema.parse(JSON.parse(await readFile(full,'utf8')));
 c.repo=await realpath(path.resolve(base,c.repo));c.artifactDir=await realpath(path.resolve(base,c.artifactDir));
 c.output=path.resolve(base,c.output);c.python=path.resolve(base,c.python);
 for(const file of c.sourceFiles)if(!/\.[cm]?[jt]sx?$/.test(file)||/(^|[\\/])(playwright|tests?|e2e|node_modules|artifacts)([\\/]|$)|\.(spec|test|config)\./i.test(file)||file===c.probeSetup?.module)throw Error('Mutations may target application or mock source, never tests, setup helpers or config');
 for(const [key,value] of Object.entries(c.env)){
  if(!/^(APP_URL|MOCKSERVER_URL|APP_PORT|MOCKSERVER_PORT)$/.test(key))throw Error('Only explicit local app/mockserver environment overrides are supported');
  if(key.endsWith('_URL')){const u=new URL(value);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Use a plain loopback app URL');}
  else if(!/^\d+$/.test(value)||Number(value)<1024||Number(value)>65535)throw Error('Invalid local port');
 }
 return c;
}
