// Project-local, explicitly configured bridge. No dynamic manuals, CLI or HTTP plugins.
import {CodeModeUtcpClient} from '@utcp/code-mode';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),i=args.indexOf('--config'),wi=args.indexOf('--workload'),pi=args.indexOf('--pair');
if((i<0)===(wi<0)||!args[(wi>=0?wi:i)+1])throw Error('Choose --config FILE or --workload FILE');
const config=i>=0?path.resolve(args[i+1]):null,workload=wi>=0?path.resolve(args[wi+1]):null;
const enabled=['--allow-hosted','--allow-run'].filter(f=>args.includes(f));
const readOnly=Boolean(workload)||args.includes('--read-only');
const originalLog=console.log;console.log=(...values)=>console.error(...values);
const client=await CodeModeUtcpClient.create(root);
const mcp=new Client({name:'mutation-code-mode-adapter',version:'0.1.0'});
try{
 const operation=workload?['analysis-mcp','--workload',workload,...(pi>=0?['--pair',args[pi+1]]:[])]:['mcp','--config',config,...enabled];
 await mcp.connect(new StdioClientTransport({command:process.execPath,args:['--import',path.join(root,'node_modules/tsx/dist/loader.mjs'),path.join(root,'src/mutation-cli.ts'),...operation],cwd:root,stderr:'pipe'}));
 const discovered=await mcp.listTools();
 const catalogue=discovered.tools.filter(t=>!readOnly||t.annotations?.readOnlyHint===true).map(t=>({name:'qa.'+t.name,description:t.description??'',inputs:t.inputSchema,outputs:t.outputSchema??{type:'object'},tags:['mutation']}));
 // Code Mode uses the real MCP catalogue; calls stay with the official SDK.
 // No general-purpose UTCP transport plugins or dynamic tool registration.
 client.getTools=async()=>catalogue;
 client.callTool=async(name,arguments_)=>{
  const tool=catalogue.find(t=>t.name===name);if(!tool)throw Error('Tool is outside the configured mutation MCP');
  const result=await mcp.callTool({name:name.slice(3),arguments:arguments_},undefined,{timeout:900000});
  if(result.isError)throw Error('Local mutation tool failed');
  const block=result.content?.find(c=>c.type==='text');if(!block)throw Error('Missing JSON tool result');return JSON.parse(block.text);
 };
 const interfaces=await client.getAllToolsTypeScriptInterfaces();
 if(!interfaces.includes(workload?'analysis_packet':'context'))throw Error('Local mutation tools not discovered');
 const tools=await client.getTools(),contextTool=tools.find(t=>t.name.endsWith('.context'));
 if(args.includes('--check')&&!workload){
  const name=contextTool.name.slice(3);
  const start=performance.now();
  const classic=await client.callTool(contextTool.name,{});
  const result=await client.callToolChain(`return qa.${name}({});`,30000,128);
  if(result.logs?.some(line=>line.startsWith('[ERROR] Code execution failed:')))throw Error('Code Mode execution failed');
  originalLog(JSON.stringify({mode:'code-mode-roundtrip',tools:tools.map(t=>t.name),sameResult:JSON.stringify(classic)===JSON.stringify(result.result),wallMs:performance.now()-start,result:result.result},null,2));
 }else{
  const server=new McpServer({name:'playwright-mutation-code-mode',version:'0.1.0'});
  server.registerTool('interfaces',{description:'Read interfaces for the configured local Playwright mutation tools.',inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false}},async()=>({content:[{type:'text',text:interfaces}]}));
  server.registerTool('call_tool_chain',{description:'Run bounded JavaScript over the configured local mutation MCP tools. Return only the summary needed.',annotations:{readOnlyHint:readOnly,openWorldHint:false},inputSchema:{code:z.string().min(1).max(20000),timeoutMs:z.number().int().min(1000).max(900000).default(30000)}},async({code,timeoutMs})=>{
   try{const result=await client.callToolChain(code,timeoutMs,128);if(result.logs?.some(line=>line.startsWith('[ERROR] Code execution failed:')))throw Error('Code Mode execution failed');const text=JSON.stringify(result);if(text.length>100000)throw Error('Return a smaller summary');return {content:[{type:'text',text}]};}
   catch{return {isError:true,content:[{type:'text',text:'Code Mode execution failed; check interfaces, capability flags and execution limits.'}]};}
  });
  await server.connect(new StdioServerTransport());
  await new Promise(resolve=>process.stdin.on('end',resolve));
 }
}finally{await mcp.close();await client.close();}
