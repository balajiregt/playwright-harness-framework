import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import {ROOT} from '../context.js';
import type {AnalysisPair} from './workload.js';
export const codeModeScript=path.join(ROOT,'integrations/code-mode/server.mjs');
export async function openEvidenceClient(node:string,workloadFile:string){
 const client=new Client({name:'frozen-analysis-engine',version:'1.0.0'});
 try{await client.connect(new StdioClientTransport({command:node,args:['--no-node-snapshot',codeModeScript,'--workload',path.resolve(workloadFile)],cwd:ROOT,stderr:'pipe'}));}
 catch{await client.close();throw Error('Code Mode could not start. Install integrations/code-mode and run with its Node version (Node 22 recommended).');}
 return {async packet(pair:AnalysisPair){
  const response=await client.callTool({name:'call_tool_chain',arguments:{code:`return qa.analysis_packet({pairId:${JSON.stringify(pair.id)}});`,timeoutMs:30000}});
  if(response.isError)throw Error('Code Mode evidence request failed');
  const block=(response.content as {type:string;text?:string}[]).find(c=>c.type==='text');
  const raw=JSON.parse(block?.text??'{}').result;
  if(!raw||raw.packetHash!==pair.packet.hash||raw.input!==pair.packet.input||raw.instructions!==pair.packet.instructions||JSON.stringify(raw.choices)!==JSON.stringify(pair.packet.choices))throw Error('Code Mode returned different evidence');
  return raw as {packetHash:string;input:string;instructions:string;choices:Record<string,string>};
 },close:()=>client.close()};
}
