import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {ROOT,digest} from '../context.js';
import {validateWorkload,type Workload} from '../mutation/workload.js';
import {healthy,type Campaign} from '../mutation/runner.js';
import {bindCampaign} from '../mutation/analysis.js';
import {campaignMetrics} from '../mutation/report.js';

const hash=z.string().regex(/^[a-f0-9]{64}$/),count=z.number().int().nonnegative();
const stats=z.object({startTime:z.string(),duration:z.number().nonnegative(),expected:count,skipped:count,unexpected:count,flaky:count});
const eventSchema=z.object({transport:z.enum(['mcp-stdio','code-mode-mcp']),tool:z.string(),status:z.enum(['passed','blocked','failed','skipped']),startedAt:z.string(),durationMs:z.number().nonnegative(),requestHash:hash,resultHash:hash,evidencePath:z.string()});
const checks=z.record(z.string(),z.union([z.boolean(),z.literal('skipped')]));
const auditSchema=z.object({version:z.literal(1),kind:z.literal('local-mcp-code-mode-audit'),failed:z.literal(false),campaignDir:z.string(),checks,events:z.array(eventSchema).min(1)});
const graphSchema=z.object({version:z.literal(1),status:z.literal('passed'),counts:z.object({sourceNodes:count,sourceEdges:count,candidateTests:count,testCases:count,routes:count,heuristicCoveredRoutes:count,gaps:count,duplicateCandidates:count,overlapCandidates:count})}).passthrough();
const summarySchema=z.object({version:z.literal(1),scope:z.literal('synthetic CRM demonstration'),createdAt:z.string().datetime(),corePassed:z.literal(true),passed:z.literal(true),productAccepted:z.literal(false),sourceHash:hash,sourceRevision:z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/).nullable(),dirty:z.boolean().nullable(),sourceUnchanged:z.literal(true),
 browser:stats,live:z.object({codex:z.literal('skipped'),laya:z.literal('skipped')}),workload:z.object({hash,pairs:count,contextHash:hash}),
 campaign:z.object({dir:z.string(),runId:z.string(),baseline:z.array(z.object({status:z.string(),tests:count})),restored:z.string(),originalUnchanged:z.literal(true),faults:z.array(z.unknown())}),
 mcp:z.object({checks,events:z.array(eventSchema)}),graphs:graphSchema,
 matrix:z.array(z.object({criterion:z.string(),assessment:z.enum(['supported','missing assertion','partial','unknown'])})).min(1)});
type Measurement={value:number|null;state:'measured'|'unavailable';sampleSize:number|null};
export interface DemoEvidence {summary:unknown;audit:unknown;graphs:unknown;campaign:Campaign;workload:Workload;browser:unknown;receipts:Record<string,unknown>}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const requireEvidence=(condition:unknown,message:string)=>{if(!condition)throw Error('Community demo evidence: '+message);};
const measured=(value:number,sampleSize:number):Measurement=>({value,state:'measured',sampleSize});
const unavailable=():Measurement=>({value:null,state:'unavailable',sampleSize:null});

/** Only authored policy definitions become public; raw evidence is used exclusively for binding/counts. */
export function demoMeasurements(input:DemoEvidence,definitions:{id:string}[]){
 const s=summarySchema.parse(input.summary),a=auditSchema.parse(input.audit),g=graphSchema.parse(input.graphs),w=validateWorkload(input.workload),c=input.campaign;
 requireEvidence(w.scope==='synthetic','non-synthetic workload');
 requireEvidence(c?.version===1&&c.kind==='playwright-behavioral-mutations','missing mutation campaign');
 bindCampaign(w,c);
 requireEvidence(equal(w.plan.mutations.map(m=>m.id).sort(),['DASHBOARD-METRIC-ZERO','VIEWER-READONLY-OFF'])&&c.baseline.length===2,'wrong bounded demo fault/baseline scope');
 requireEvidence(c.runId===s.campaign.runId&&a.campaignDir===s.campaign.dir,'campaign identity mismatch');
 requireEvidence(c.contextHash===s.workload.contextHash&&c.contextHash===w.context.hash&&c.plan.contextHash===c.contextHash,'context identity mismatch');
 requireEvidence(c.repositoryHash===s.sourceHash&&c.repositoryHash===w.repositoryHash,'repository identity mismatch');
 requireEvidence(c.planHash===digest(JSON.stringify(w.plan))&&c.planHash===digest(JSON.stringify(c.plan))&&c.scopeHash===w.scopeHash,'plan or execution scope mismatch');
 requireEvidence(s.workload.hash===w.hash&&s.workload.pairs===w.pairs.length,'frozen workload mismatch');
 requireEvidence(equal(s.mcp.checks,a.checks)&&equal(s.mcp.events,a.events),'summary/audit mismatch');
 requireEvidence(Object.keys(a.checks).length===27,'incomplete demo audit inventory');
 requireEvidence(a.checks.livePlan==='skipped'&&a.checks.liveAssess==='skipped'&&Object.entries(a.checks).every(([k,v])=>k==='livePlan'||k==='liveAssess'?v==='skipped':v===true),'incomplete or changed audit checks');
 requireEvidence(a.events.every(e=>e.status==='passed'||e.status==='blocked'),'incomplete audit events');
 requireEvidence(equal(s.graphs,g),'graph manifest mismatch');
 const complete=(run:NonNullable<Campaign['restored']>)=>healthy(run)&&run.tests.length===6&&run.tests.every(t=>t.expectedStatus==='passed'&&t.results.length===1&&t.results[0].status==='passed');
 requireEvidence(c.originalUnchanged&&c.baseline.every(complete)&&c.restored&&complete(c.restored),'unhealthy/incomplete baseline/restoration or source change');
 requireEvidence(equal(s.campaign.baseline,c.baseline.map(b=>({status:b.status,tests:b.tests.length})))&&s.campaign.restored===c.restored!.status&&equal(s.campaign.faults,c.faults),'summary/campaign mismatch');
 const browser=z.object({stats,errors:z.array(z.unknown()),suites:z.array(z.unknown())}).parse(input.browser);
 const tests:Record<string,unknown>[]=[];
 function visit(value:unknown){const suite=value as {specs?:{tests?:Record<string,unknown>[]}[];suites?:unknown[]};for(const spec of suite.specs??[])tests.push(...spec.tests??[]);for(const nested of suite.suites??[])visit(nested);}
 browser.suites.forEach(visit);
 requireEvidence(equal(s.browser,browser.stats)&&browser.errors.length===0&&tests.length===s.browser.expected&&tests.length===6,'browser report mismatch');
 requireEvidence(tests.every(t=>t.expectedStatus==='passed'&&Array.isArray(t.results)&&t.results.length===1&&(t.results[0] as {status:string}).status==='passed')&&s.browser.unexpected===0&&s.browser.flaky===0&&s.browser.skipped===0,'incomplete browser execution');
 const seen=new Set<string>(),receiptSummaries:Record<string,unknown>[]=[];
 for(const event of a.events){
  const name=path.basename(event.evidencePath);requireEvidence(!seen.has(name),'duplicate audit receipt');seen.add(name);
  const raw=input.receipts[name];requireEvidence(raw,'missing audit receipt');
  const receipt=eventSchema.parse(raw);requireEvidence(equal(receipt,event),'receipt identity mismatch');
  receiptSummaries.push((raw as {summary:Record<string,unknown>}).summary??{});
 }
 const index=(tool:string)=>a.events.findIndex(e=>e.transport==='mcp-stdio'&&e.tool===tool&&e.status==='passed');
 requireEvidence(index('context')>=0&&index('evidence')>=0&&index('inspect')>=0,'missing direct evidence receipts');
 requireEvidence(receiptSummaries[index('context')].contextHash===c.contextHash&&receiptSummaries[index('evidence')].contextHash===c.contextHash&&receiptSummaries[index('inspect')].planHash===c.planHash,'audit evidence hashes mismatch');
 const executions=receiptSummaries.filter(r=>r.dir!==undefined&&r.metrics!==undefined);
 requireEvidence(executions.length===1&&executions[0].dir===a.campaignDir&&equal(executions[0].metrics,campaignMetrics(c)),'execution receipt/campaign mismatch');
 requireEvidence(new Set(s.matrix.map(m=>m.criterion)).size===s.matrix.length,'duplicate matrix criterion');
 for(const fault of c.faults){
  const criterion=s.matrix.find(m=>m.criterion===fault.requirementId);
  requireEvidence(criterion&&fault.attempts.length===2&&['killed','survived'].includes(fault.status),'incomplete fault evidence');
  requireEvidence(fault.status!=='survived'||criterion!.assessment!=='supported','surviving fault incorrectly accepted');
 }
 const supported=s.matrix.filter(m=>m.assessment==='supported').length,missing=s.matrix.filter(m=>m.assessment==='missing assertion').length;
 requireEvidence(s.matrix.length===8&&supported===7&&missing===1&&c.faults.find(f=>f.id==='VIEWER-READONLY-OFF')?.status==='killed'&&c.faults.find(f=>f.id==='DASHBOARD-METRIC-ZERO')?.status==='survived','changed bounded demo acceptance scope');
 const cm=campaignMetrics(c),checkValues=Object.values(a.checks),passedEvents=a.events.filter(e=>e.status==='passed').length;
 const values:Record<string,Measurement>={
  'browser-passed':measured(s.browser.expected,tests.length),'browser-skipped':measured(s.browser.skipped,tests.length),
  'mcp-checks':measured(checkValues.length,checkValues.length),'mcp-checks-passed':measured(checkValues.filter(v=>v===true).length,checkValues.length),'mcp-checks-skipped':measured(checkValues.filter(v=>v==='skipped').length,checkValues.length),
  'mcp-receipts':measured(a.events.length,a.events.length),'mcp-receipts-passed':measured(passedEvents,a.events.length),'mcp-expected-blocks':measured(a.events.filter(e=>e.status==='blocked').length,a.events.length),
  'faults-requested':measured(cm.requested,cm.requested),'faults-killed':measured(cm.killed,cm.requested),'faults-survived':measured(cm.survived,cm.requested),
  'healthy-baselines':measured(c.baseline.length,c.baseline.length),'restored-green':measured(1,1),'original-source-unchanged':measured(1,1),
  'criteria-total':measured(s.matrix.length,s.matrix.length),'criteria-supported':measured(supported,s.matrix.length),'criteria-missing-assertion':measured(missing,s.matrix.length),
  'graph-source-nodes':measured(g.counts.sourceNodes,1),'graph-source-edges':measured(g.counts.sourceEdges,1),'graph-candidate-tests':measured(g.counts.candidateTests,1),'graph-test-cases':measured(g.counts.testCases,1),
  'graph-routes':measured(g.counts.routes,1),'graph-candidate-gaps':measured(g.counts.gaps,1),'graph-duplicate-candidates':measured(g.counts.duplicateCandidates,1),'graph-overlap-candidates':measured(g.counts.overlapCandidates,1),
  'codex-planned-faults':unavailable(),'laya-assessed-pairs':unavailable(),'provider-runtime-agreement':unavailable()
 };
 for(const definition of definitions)requireEvidence(Object.hasOwn(values,definition.id),'unmapped policy metric');
 // No-Git extraction cannot establish a clean Git revision. Do not borrow the later pushed SHA.
 return {observedAt:s.createdAt,revision:s.sourceRevision,dirty:s.dirty??true,status:s.productAccepted?'completed':'partial',values:Object.fromEntries(definitions.map(d=>[d.id,values[d.id]]))};
}

/** Prepare and validate privately through the bundled publisher. This helper never publishes. */
export async function exportDemoMetrics({evidenceDir,policyFile,outputFile}:{evidenceDir:string;policyFile:string;outputFile:string}){
 const root=path.resolve(evidenceDir),read=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
 const summary=await read(path.join(root,'summary.json')),s=summarySchema.parse(summary),audit=await read(path.join(root,'mcp-audit.json'));
 requireEvidence(/^[a-zA-Z0-9_-]+$/.test(s.campaign.runId),'unsafe campaign identity');
 const receipts:Record<string,unknown>={};
 for(const event of auditSchema.parse(audit).events){const name=path.basename(event.evidencePath);requireEvidence(/^\d{3}-[a-zA-Z0-9_-]+\.json$/.test(name),'unsafe receipt identity');receipts[name]=await read(path.join(root,'mcp-receipts',name));}
 const evidence:DemoEvidence={summary,audit,receipts,graphs:await read(path.join(root,'graphs/manifest.json')),browser:await read(path.join(root,'browser/results.json')),
  campaign:await read(path.join(root,'mutations',s.campaign.runId,'campaign.json')),workload:await read(path.join(root,'mutations/frozen',s.workload.hash,'workload.json'))};
 const policy=await read(path.resolve(policyFile));
 requireEvidence(policy.scope==='synthetic'&&policy.projectId==='agentic-playwright','wrong publication policy');
 const measurements=demoMeasurements(evidence,policy.metrics);
 const {prepare,validatePrepared}=await import(pathToFileURL(path.join(ROOT,'.agents/skills/platform-publish/scripts/publisher.mjs')).href);
 const prepared=prepare(policy,measurements);validatePrepared(prepared,policy);
 const output=path.resolve(outputFile);
 await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(prepared,null,2)+'\n',{flag:'wx'});
 return {prepared:output,scope:'synthetic' as const,destination:policy.repository+'/'+policy.branch+'/'+policy.feedPath,published:false as const,observedAt:prepared.observedAt,runId:prepared.runId};
}
