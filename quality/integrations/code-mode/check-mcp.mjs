import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2);
const config=args[args.indexOf('--config')+1];if(!args.includes('--config')||!config)throw Error('--config is required');
const client=new Client({name:'code-mode-protocol-check',version:'1.0.0'});
try{
 await client.connect(new StdioClientTransport({command:process.execPath,args:['--no-node-snapshot',path.join(dir,'server.mjs'),'--config',path.resolve(config),...(args.includes('--read-only')?['--read-only']:[])],cwd:dir,stderr:'pipe'}));
 const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),['interfaces','call_tool_chain']);
 const interfaces=await client.callTool({name:'interfaces',arguments:{}});assert.match(interfaces.content[0].text,/qa/);
 if(args.includes('--read-only')){assert.ok(!interfaces.content[0].text.includes('assessInput'));assert.equal(tools.tools.find(t=>t.name==='call_tool_chain').annotations.readOnlyHint,true);}
 const code='const context=qa.context({}); const plan=qa.inspect({}); return {contextHash:context.contextHash,requirements:plan.requirements.length,mutations:plan.mutations.length};';
 const result=await client.callTool({name:'call_tool_chain',arguments:{code,timeoutMs:30000}});assert.ok(!result.isError);
 const parsed=JSON.parse(result.content[0].text);assert.ok(parsed.result.requirements>0&&parsed.result.mutations>0);
 console.log(JSON.stringify({protocol:'real-mcp-to-code-mode-to-mutation-mcp',tools:tools.tools.map(t=>t.name),result:parsed.result},null,2));
}finally{await client.close();}
