import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import type {MutationConfig} from './schema.js';
import {mutationTools} from './tools.js';
export async function serveMutationMcp(c:MutationConfig,options:{allowHosted?:boolean;allowRun?:boolean}){
 const tools=mutationTools(c,options),server=new McpServer({name:'playwright-mutations',version:'0.1.0'});
 const names={context:'List artifact identities and source scope; no raw text.',evidence:'Read passive downloaded requirements and allowed source.',inspect:'Read the existing input-bound mutation plan.',plan:'Ask Codex CLI for a bounded requirement-linked mutation plan.',assess:'Run local Laya predictions on the planned faults and existing tests.',run:'Execute the planned behavioral faults in an isolated local copy, returning aggregate results.'};
 for(const name of Object.keys(names) as (keyof typeof names)[]){
  if(name==='plan'&&!options.allowHosted||name==='run'&&!options.allowRun)continue;
  server.registerTool(name,{description:names[name],inputSchema:{},annotations:{readOnlyHint:['context','evidence','inspect'].includes(name),destructiveHint:false,openWorldHint:name==='plan'}},async()=>{
   try{const value=await tools[name]();return {content:[{type:'text' as const,text:JSON.stringify(value)}]};}
   catch{return {isError:true,content:[{type:'text' as const,text:'Mutation tool failed. Verify local config, input freshness and required access; diagnostic text withheld.'}]};}
  });
 }
 // Protocol stdout must contain only MCP messages.
 console.log=(...args)=>console.error(...args);
 await server.connect(new StdioServerTransport());
}
