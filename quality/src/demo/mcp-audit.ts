import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {McpError} from '@modelcontextprotocol/sdk/types.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT,digest} from '../context.js';
import {loadConfig} from '../mutation/schema.js';
import {readWorkload,assertFresh,type AnalysisPair} from '../mutation/workload.js';
import {openEvidenceClient,codeModeScript} from '../mutation/code-mode-client.js';

export interface AuditEvent {
 transport:'mcp-stdio'|'code-mode-mcp';
 tool:string;
 status:'passed'|'blocked'|'failed'|'skipped';
 startedAt:string;
 durationMs:number;
 requestHash:string;
 resultHash?:string;
 evidencePath:string;
}
export interface McpAuditOptions {configFile:string;workloadFile:string;outputDir:string;node?:string}
export type AuditChecks=Record<string,boolean|'skipped'>;
export function completeAssessment(value:{pairs?:unknown;completed?:unknown;excluded?:unknown}):boolean {
 return Number.isInteger(value.pairs)&&Number(value.pairs)>0&&value.completed===value.pairs&&value.excluded===0;
}
type Reply={isError?:boolean;content?:{type:string;text?:string}[]};
type ObjectValue=Record<string,unknown>;

function object(value:unknown):ObjectValue {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected tool object');
 return value as ObjectValue;
}
function text(reply:Reply):string {
 const block=reply.content?.find(c=>c.type==='text'&&typeof c.text==='string');
 if(!block?.text)throw Error('Missing tool text');
 return block.text;
}
function json(reply:Reply):ObjectValue {return object(JSON.parse(text(reply)));}
function chainResult(reply:Reply):ObjectValue {return object(json(reply).result);}

/** Parse the actual generated access signatures, not words in tool descriptions. */
export function advertisedQaTools(interfaces:string):string[] {
 return [...new Set([...interfaces.matchAll(/Access as:\s*qa\.([A-Za-z_]\w*)\(args\)/g)].map(m=>m[1]))].sort();
}
/** Bind all evidence fields, including the recomputed hash, to the frozen pair. */
export function sameFrozenPacket(value:unknown,pair:AnalysisPair):boolean {
 try{
  const p=object(value),expected=pair.packet;
  return p.packetHash===expected.hash&&p.input===expected.input&&p.instructions===expected.instructions
   &&JSON.stringify(p.choices)===JSON.stringify(expected.choices)
   &&p.packetHash===digest(JSON.stringify({input:p.input,instructions:p.instructions,choices:p.choices}));
 }catch{return false;}
}

/** Actual stdio MCP + native Code Mode checks. No planner or assessment provider is invoked. */
export async function auditMcp({configFile,workloadFile,outputDir,node=process.execPath}:McpAuditOptions):Promise<{campaignDir:string;events:AuditEvent[];checks:AuditChecks}> {
 const output=path.resolve(outputDir),receipts=path.join(output,'mcp-receipts'),auditFile=path.join(output,'mcp-audit.json');
 await mkdir(receipts,{recursive:true});
 const events:AuditEvent[]=[],checks:AuditChecks={livePlan:'skipped',liveAssess:'skipped'};
 const clients:Client[]=[];
 let campaignDir='';
 const save=async(failed=false)=>writeFile(auditFile,JSON.stringify({version:1,kind:'local-mcp-code-mode-audit',
  evidence:'Actual local MCP transports and native Code Mode; provider planning and assessment skipped.',
  failed,campaignDir:campaignDir||null,checks,events},null,2));
 const check=(name:string,value:boolean)=>{checks[name]=value;if(!value)throw Error('Audit check failed: '+name);};
 async function recorded<T>(transport:AuditEvent['transport'],tool:string,request:unknown,action:()=>Promise<T>,summary:(r:T)=>unknown=()=>({}),blocked=false):Promise<T> {
  const startedAt=new Date().toISOString(),start=performance.now(),index=events.length+1;
  const event:AuditEvent={transport,tool,status:'failed',startedAt,durationMs:0,requestHash:digest(JSON.stringify(request)),
   evidencePath:path.join(receipts,`${String(index).padStart(3,'0')}-${tool.replace(/[^a-z0-9_-]/gi,'_')}.json`)};
  let safeSummary:unknown={};
  try{
   const result=await action();
   event.resultHash=digest(JSON.stringify(result));
   safeSummary=summary(result);
   event.status=blocked?'blocked':'passed';
   return result;
  }finally{
   event.durationMs=performance.now()-start;events.push(event);
   // Receipts retain identities/counts only. Raw source, requirements and errors are never copied here.
   await writeFile(event.evidencePath,JSON.stringify({...event,summary:safeSummary},null,2));
   await save(event.status==='failed');
  }
 }
 async function start(transport:AuditEvent['transport'],args:string[]) {
  const client=new Client({name:'playwright-agent-demo-audit',version:'1.0.0'});clients.push(client);
  await recorded(transport,'connect',{command:node,args},async()=>{
   await client.connect(new StdioClientTransport({command:node,args,cwd:ROOT,stderr:'pipe'}));return {connected:true};
  });
  return client;
 }
 async function close(client:Client) {await client.close();clients.splice(clients.indexOf(client),1);}
 async function list(client:Client,transport:AuditEvent['transport']) {
  const result=await recorded(transport,'tools/list',{},()=>client.listTools(),r=>({tools:r.tools.map(t=>t.name).sort()}));
  return result.tools.map(t=>t.name).sort();
 }
 async function call(client:Client,transport:AuditEvent['transport'],name:string,args:ObjectValue={},options:{blocked?:boolean;timeout?:number;summary?:(r:Reply)=>unknown}={}) {
  return recorded(transport,name,{name,arguments:args},async()=>{
   let result:Reply;
   try{result=await client.callTool({name,arguments:args},undefined,{timeout:options.timeout??60000}) as Reply;}
   catch(error){
    // Only an explicit protocol rejection counts as blocked; disconnects/timeouts remain failures.
    if(options.blocked&&error instanceof McpError&&[-32601,-32602].includes(error.code))result={isError:true,content:[{type:'text',text:'Protocol rejected unavailable tool'}]};
    else throw Error('Local MCP request failed');
   }
   if(Boolean(result.isError)!==Boolean(options.blocked))throw Error('Unexpected MCP tool outcome');
   return result;
  },options.summary,options.blocked);
 }
 const directArgs=(...args:string[])=>['--import',path.join(ROOT,'node_modules/tsx/dist/loader.mjs'),path.join(ROOT,'src/mutation-cli.ts'),...args];
 const codeArgs=(...args:string[])=>['--no-node-snapshot',codeModeScript,...args];
 const signatures=async(client:Client)=>{
  const reply=await call(client,'code-mode-mcp','interfaces',{}, {summary:r=>({tools:advertisedQaTools(text(r))})});
  return advertisedQaTools(text(reply));
 };
 const sameNames=(actual:string[],expected:string[])=>JSON.stringify(actual)===JSON.stringify([...expected].sort());
 try{
  const config=await loadConfig(configFile),workload=await readWorkload(workloadFile);
  check('frozenScopeIsSynthetic',workload.scope==='synthetic'&&config.analysis.scope==='synthetic');
  check('atLeastTwoFrozenPairs',workload.pairs.length>=2);
  await assertFresh(config,workload);
  const [selected,other]=workload.pairs;
  const direct=await start('mcp-stdio',directArgs('mcp','--config',path.resolve(configFile)));
  check('directDefaultDiscovery',sameNames(await list(direct,'mcp-stdio'),['context','evidence','inspect','assess']));
  const context=json(await call(direct,'mcp-stdio','context',{}, {summary:r=>({contextHash:json(r).contextHash})}));
  const evidence=json(await call(direct,'mcp-stdio','evidence',{}, {summary:r=>({contextHash:json(r).hash})}));
  const plan=json(await call(direct,'mcp-stdio','inspect',{}, {summary:r=>({contextHash:json(r).contextHash,planHash:digest(JSON.stringify(json(r)))})}));
  check('directEvidenceHashesMatchFrozen',context.contextHash===workload.context.hash&&evidence.hash===workload.context.hash&&plan.contextHash===workload.context.hash);
  check('directPlanMatchesFrozen',digest(JSON.stringify(plan))===digest(JSON.stringify(workload.plan)));
  await call(direct,'mcp-stdio','unknown_demo_tool',{}, {blocked:true});checks.directUnknownToolBlocked=true;
  await call(direct,'mcp-stdio','plan',{}, {blocked:true});checks.directHostedPlanBlocked=true;
  await close(direct);

  const code=await start('code-mode-mcp',codeArgs('--config',path.resolve(configFile),'--allow-run'));
  check('codeModeOuterDiscovery',sameNames(await list(code,'code-mode-mcp'),['interfaces','call_tool_chain']));
  check('codeModeExecutionCapabilities',sameNames(await signatures(code),['context','evidence','inspect','assess','run']));
  const summaryCode='const [c,e,p]=await Promise.all([qa.context({}),qa.evidence({}),qa.inspect({})]); return {contextHash:c.contextHash,evidenceHash:e.hash,planContextHash:p.contextHash,requirements:p.requirements.length,mutations:p.mutations.length};';
  const batch=chainResult(await call(code,'code-mode-mcp','call_tool_chain',{code:summaryCode,timeoutMs:30000},{summary:r=>chainResult(r)}));
  check('codeModeBatchMatchesDirect',JSON.stringify(batch)===JSON.stringify({contextHash:context.contextHash,evidenceHash:evidence.hash,planContextHash:plan.contextHash,requirements:(plan.requirements as unknown[]).length,mutations:(plan.mutations as unknown[]).length}));
  await call(code,'code-mode-mcp','call_tool_chain',{code:'return qa.unknown_demo_tool({});',timeoutMs:30000},{blocked:true});checks.codeModeUnknownToolBlocked=true;
  await call(code,'code-mode-mcp','call_tool_chain',{code:'return qa.plan({});',timeoutMs:30000},{blocked:true});checks.codeModeHostedPlanBlocked=true;

  const readOnly=await start('code-mode-mcp',codeArgs('--config',path.resolve(configFile),'--read-only','--allow-hosted','--allow-run'));
  check('readOnlyOverridesGatingFlags',sameNames(await signatures(readOnly),['context','evidence','inspect']));
  await call(readOnly,'code-mode-mcp','call_tool_chain',{code:'return qa.run({});',timeoutMs:30000},{blocked:true});checks.readOnlyRunBlocked=true;
  await close(readOnly);

  const analysis=await start('mcp-stdio',directArgs('analysis-mcp','--workload',path.resolve(workloadFile),'--pair',selected.id));
  check('frozenDirectDiscovery',sameNames(await list(analysis,'mcp-stdio'),['analysis_packet']));
  const packet=json(await call(analysis,'mcp-stdio','analysis_packet',{pairId:selected.id},{summary:r=>({packetHash:json(r).packetHash})}));
  check('frozenDirectPacketIdentity',sameFrozenPacket(packet,selected));
  await call(analysis,'mcp-stdio','analysis_packet',{pairId:other.id},{blocked:true});checks.frozenDirectOtherPairBlocked=true;
  await close(analysis);

  const frozenCode=await start('code-mode-mcp',codeArgs('--workload',path.resolve(workloadFile),'--pair',selected.id));
  check('frozenCodeModeCapabilities',sameNames(await signatures(frozenCode),['analysis_packet']));
  const frozen=chainResult(await call(frozenCode,'code-mode-mcp','call_tool_chain',{code:`return qa.analysis_packet({pairId:${JSON.stringify(selected.id)}});`,timeoutMs:30000},{summary:r=>({packetHash:chainResult(r).packetHash})}));
  check('frozenCodeModePacketIdentity',sameFrozenPacket(frozen,selected));
  await call(frozenCode,'code-mode-mcp','call_tool_chain',{code:`return qa.analysis_packet({pairId:${JSON.stringify(other.id)}});`,timeoutMs:30000},{blocked:true});checks.frozenCodeModeOtherPairBlocked=true;
  await close(frozenCode);

  // Exercise the production evidence-client seam as well, without running an assessment engine.
  const helper=await openEvidenceClient(node,path.resolve(workloadFile));
  try{
   const result=await recorded('code-mode-mcp','openEvidenceClient.packet',{pairId:selected.id},()=>helper.packet(selected),r=>({packetHash:r.packetHash}));
   check('productionEvidenceClientIdentity',sameFrozenPacket(result,selected));
  }finally{await helper.close();}

  // Exactly one run call, after all read/negative checks. Outer and sandbox limits are explicit.
  const execution=chainResult(await call(code,'code-mode-mcp','call_tool_chain',{code:'return qa.run({});',timeoutMs:900000},{timeout:930000,summary:r=>chainResult(r)}));
  check('executionReturnedCampaign',typeof execution.dir==='string'&&Boolean(execution.metrics));
  campaignDir=path.resolve(String(execution.dir));
  check('campaignInsideConfiguredOutput',campaignDir.startsWith(path.resolve(config.output)+path.sep));
  const campaign=object(JSON.parse(await readFile(path.join(campaignDir,'campaign.json'),'utf8')));
  const metrics=object(JSON.parse(await readFile(path.join(campaignDir,'metrics.json'),'utf8')));
  check('campaignBoundToFrozenEvidence',campaign.contextHash===workload.context.hash&&campaign.repositoryHash===workload.repositoryHash&&campaign.planHash===digest(JSON.stringify(workload.plan))&&campaign.scopeHash===workload.scopeHash);
  check('returnedMetricsMatchSavedCampaign',JSON.stringify(metrics)===JSON.stringify(execution.metrics));
  await close(code);
  await save();
  return {campaignDir,events,checks};
 }catch{
  await save(true);
  throw Error(`Local MCP/Code Mode audit failed; inspect private receipts at ${auditFile}`);
 }finally{
  for(const client of clients)try{await client.close();}catch{/* Cleanup never prints child diagnostics. */}
 }
}
