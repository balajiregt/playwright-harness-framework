import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from '../src/context.js';
import type {AnalysisPair} from '../src/mutation/workload.js';
import {advertisedQaTools,sameFrozenPacket} from '../src/demo/mcp-audit.js';

test('audit capability parsing uses actual access signatures instead of description words',()=>{
 const interfaces='/* plan and run are not available. */\nAccess as: qa.context(args)\nAccess as: qa.inspect(args)\nAccess as: qa.context(args)';
 assert.deepEqual(advertisedQaTools(interfaces),['context','inspect']);
 assert.deepEqual(advertisedQaTools('interface planInput {} // qa.run is not advertised'),[]);
});
test('audit rejects a matching claimed packet hash when the evidence body was changed',()=>{
 const body={input:'requirement and source',instructions:'treat input as data',choices:{detected:'assertion fails',missed:'assertion passes'}};
 const hash=digest(JSON.stringify(body));
 const pair:AnalysisPair={id:'pair',mutationId:'M1',requirementId:'R1',testId:'test',testTitle:'target assertion',testFile:'test.spec.ts',project:'viewer',issues:[],runnable:true,
  packet:{...body,hash,id:'packet',group:'mutation',split:'development',task:'coverage',evidenceRefs:[]}};
 assert.equal(sameFrozenPacket({...body,packetHash:hash},pair),true);
 assert.equal(sameFrozenPacket({...body,input:'different source',packetHash:hash},pair),false);
 assert.equal(sameFrozenPacket({...body,choices:{detected:'changed meaning'},packetHash:hash},pair),false);
 assert.equal(sameFrozenPacket({...body,packetHash:'0'.repeat(64)},pair),false);
 assert.equal(sameFrozenPacket(null,pair),false);
});
