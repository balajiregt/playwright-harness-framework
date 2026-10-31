import {readFile,writeFile,mkdir,stat,realpath} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {ROOT,digest} from '../context.js';
import {compactEvidence} from './evidence.js';
import {insideRepo,type Config} from './config.js';
const exec=promisify(execFile);
export interface Evidence {code:string;sources:{ref:string;file:string;code:string;sha256:string}[];issues:string[];fingerprint:string}
export interface TeamTest {id:string;title:string;project:string;file:string;line:number;column:number;runnable:boolean;dependencies:string[];evidence:Evidence;durationMs:number|null;passRate:number|null;runs:number;results:{status:string;expectedStatus:string;retry:number;durationMs:number}[]}
export interface Inventory {version:1;mode:'list'|'run';complete:boolean;executionStatus?:string;createdAt:string;wallMs:number|null;tests:TeamTest[]}
export function projectDependencies(tests:TeamTest[],projects:string[]):string[]{
 return projects.flatMap(project=>{const found=tests.filter(t=>t.project===project).map(t=>t.id);return found.length?found:[`uncollected-project:${project}`];});
}
export async function sourceEvidence(repo:string,file:string,line:number,column:number,maxBytes:number):Promise<Evidence>{
 repo=await realpath(repo);
 const sources:Evidence['sources']=[],issues:string[]=[];const seen=new Set<string>();let total=0;let code='';
 let options:ts.CompilerOptions={allowJs:true,moduleResolution:ts.ModuleResolutionKind.NodeNext};
 const tsconfig=ts.findConfigFile(repo,ts.sys.fileExists);
 if(tsconfig){const r=ts.readConfigFile(tsconfig,ts.sys.readFile);if(!r.error)options={...options,...ts.parseJsonConfigFileContent(r.config,ts.sys,path.dirname(tsconfig)).options};}
 async function visit(input:string){
  let absolute:string;try{absolute=await insideRepo(repo,input);}catch{issues.push('dependency_outside_repository_or_missing');return;}
  if(seen.has(absolute))return;seen.add(absolute);
  if(seen.size>30){issues.push('source_file_limit');return;}
  if(!/\.(?:[cm]?[jt]sx?)$/.test(absolute)){issues.push('unsupported_dependency_type');return;}
  const size=(await stat(absolute)).size;if(total+size>maxBytes){issues.push('source_byte_limit');return;}total+=size;
  const text=await readFile(absolute,'utf8');const sf=ts.createSourceFile(absolute,text,ts.ScriptTarget.Latest,true);
  sources.push({ref:`source-${sources.length+1}`,file:path.relative(repo,absolute),code:text,sha256:digest(text)});
  let target:ts.CallExpression|undefined;
  if(absolute===path.resolve(repo,file)){
   const pos=sf.getPositionOfLineAndCharacter(line-1,column-1);let best:ts.CallExpression|undefined;
   function find(n:ts.Node){if(ts.isCallExpression(n)&&n.getStart(sf)<=pos&&n.end>=pos&&(!best||n.end-n.getStart(sf)<best.end-best.getStart(sf)))best=n;ts.forEachChild(n,find);}find(sf);
   target=best;code=best?best.getText(sf):'';if(!code)issues.push('test_body_not_resolved');
  }
  // Remove unrelated test declarations from model context while retaining imports,
  // fixture definitions and the selected test's enclosing hooks. Hash original source.
  const removals:{start:number;end:number}[]=[];
  function rootName(e:ts.Expression):string{if(ts.isIdentifier(e))return e.text;if(ts.isPropertyAccessExpression(e))return rootName(e.expression);return '';}
  const testRoot=target?rootName(target.expression):'test';
  function isolate(n:ts.Node){
   if(ts.isCallExpression(n)&&rootName(n.expression)===testRoot&&n.arguments.some(a=>ts.isArrowFunction(a)||ts.isFunctionExpression(a))){
    const name=n.expression.getText(sf);const isHook=/\.(beforeEach|afterEach|beforeAll|afterAll)$/.test(name);
    const containsTarget=target&&n.pos<=target.pos&&n.end>=target.end;
    if(!isHook&&!containsTarget){removals.push({start:n.getStart(sf),end:n.end});return;}
   }
   ts.forEachChild(n,isolate);
  }
  isolate(sf);let isolated=text;for(const span of removals.sort((a,b)=>b.start-a.start))isolated=isolated.slice(0,span.start)+isolated.slice(span.start,span.end).replace(/[^\n\r]/g,' ')+isolated.slice(span.end);
  sources[sources.length-1].code=isolated;
  function dependencies(n:ts.Node){
   if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword)issues.push('dynamic_import_requires_review');
   if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='require')issues.push('commonjs_dependency_requires_review');
   ts.forEachChild(n,dependencies);
  }dependencies(sf);
  for(const statement of sf.statements){
   let spec:string|undefined;
   if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)&&!statement.importClause?.isTypeOnly)spec=statement.moduleSpecifier.text;
   if(ts.isExportDeclaration(statement)&&statement.moduleSpecifier&&ts.isStringLiteral(statement.moduleSpecifier))spec=statement.moduleSpecifier.text;
   if(!spec||spec==='@playwright/test'||spec==='playwright/test'||spec.startsWith('node:'))continue;
   const resolved=ts.resolveModuleName(spec,absolute,options,ts.sys).resolvedModule;
   if(!resolved||resolved.isExternalLibraryImport||resolved.resolvedFileName.includes(`${path.sep}node_modules${path.sep}`)){issues.push('external_or_unresolved_helper');continue;}
   await visit(resolved.resolvedFileName);
  }
 }
 await visit(file);
 return {code,sources,issues:[...new Set(issues)],fingerprint:digest(JSON.stringify(sources.map(s=>[s.file,s.sha256])))};
}
export async function collect(c:Config,execute=false,compact=false,testList?:string):Promise<Inventory>{
 c={...c,repo:await realpath(c.repo)};
 await mkdir(c.output,{recursive:true});const rawFile=path.join(c.output,`collection-${randomUUID()}.json`);
 const require=createRequire(path.join(c.repo,'package.json'));let cli:string;
 try{cli=require.resolve('@playwright/test/cli');}catch{throw Error('Install the target repository dependencies first; @playwright/test is missing');}
 const config=await insideRepo(c.repo,c.playwrightConfig);
 const args=[cli,'test','--config',config,...(execute?[]:['--list']),...(testList?['--test-list',testList]:[]),`--reporter=${path.join(ROOT,'scripts/team-reporter.cjs')}`,...c.projects.map(p=>`--project=${p}`)];
 let failed=false;
 try{await exec(process.execPath,args,{cwd:c.repo,env:{...process.env,DECISION_INVENTORY_FILE:rawFile,DECISION_COLLECT_MODE:execute?'run':'list'},timeout:execute?3600000:120000,maxBuffer:1024*1024});}catch{failed=true;}
 let raw:any;try{raw=JSON.parse(await readFile(rawFile,'utf8'));}catch{throw Error('Playwright collection failed. Check the repository config using its own test --list command.');}
 if(!raw.complete||!Array.isArray(raw.tests)||!raw.tests.length||(!execute&&failed))throw Error('Incomplete or empty Playwright inventory');
 const tests:TeamTest[]=[];
 for(const t of raw.tests){
  const absolute=await insideRepo(c.repo,t.file),file=path.relative(c.repo,absolute);
  let evidence=await sourceEvidence(c.repo,file,t.line,t.column,c.maxSourceBytes);
  if(compact)evidence=compactEvidence(evidence,t.roles);
  tests.push({id:digest(JSON.stringify([file,t.line,t.column,t.project,t.titlePath])).slice(0,20),title:t.title,project:t.project,file,line:t.line,column:t.column,runnable:t.expectedStatus==='passed',dependencies:[],evidence,durationMs:null,passRate:null,runs:0,results:t.results});
 }
 for(const t of tests)if(tests.filter(x=>x.file===t.file&&x.line===t.line&&x.column===t.column&&x.project===t.project).length>1)t.evidence.issues.push('parameterized_test_binding_requires_review');
 for(let i=0;i<tests.length;i++)tests[i].dependencies=projectDependencies(tests,raw.tests[i].projectDependencies??[]);
 if(new Set(tests.map(t=>t.id)).size!==tests.length)throw Error('Ambiguous duplicate test identity');
 return {version:1,mode:execute?'run':'list',complete:true,executionStatus:raw.status,createdAt:new Date().toISOString(),wallMs:execute?raw.wallMs:null,tests};
}
export async function applyHistory(inventory:Inventory,files:string[]){
 const histories:Inventory[]=[];const seen=new Set<string>();
 for(const file of files){const text=await readFile(file,'utf8');if(seen.has(digest(text)))continue;seen.add(digest(text));const h=JSON.parse(text) as Inventory;if(h.version!==1||h.mode!=='run'||!Array.isArray(h.tests))throw Error('History must be produced by qa record');histories.push(h);}
 for(const t of inventory.tests){
  const samples=histories.flatMap(h=>h.tests.filter(x=>x.id===t.id&&x.evidence?.fingerprint===t.evidence.fingerprint).map(x=>x.results)).filter(r=>r?.length&&r[0].status!=='skipped');
  if(!samples.length)continue;
  if(samples.flat().some(r=>!Number.isFinite(r.durationMs)||r.durationMs<0||!['passed','failed','timedOut','interrupted','skipped'].includes(r.status)))throw Error('Invalid execution history');
  t.results=samples.at(-1)!;t.runs=samples.length;t.passRate=samples.filter(r=>r[0].status==='passed'&&r[0].expectedStatus==='passed').length/samples.length;
  const durations=samples.map(r=>r.reduce((s,x)=>s+x.durationMs,0)).sort((a,b)=>a-b);t.durationMs=durations[Math.ceil(.95*durations.length)-1];
 }
 return inventory;
}
