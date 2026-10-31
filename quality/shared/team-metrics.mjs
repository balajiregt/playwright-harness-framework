// Closed public contract. No arbitrary strings, identifiers, evidence or reviewer notes.
const obj=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('|')!==[...keys].sort().join('|'))throw Error('Unexpected metrics fields');};
const count=v=>Number.isSafeInteger(v)&&v>=0;
const measure=v=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0);
export function validateTeamMetrics(d){
 obj(d,['schemaVersion','protocol','runId','generatedAt','provider','datasetKind','modelConfigHash','hardware','counts','coverage','smoke','performance','quality']);
 if(!['repository','synthetic-fixture'].includes(d.datasetKind)||d.schemaVersion!==1||d.protocol!=='team-evaluation-v1'||!['laya','ollama','llamacpp'].includes(d.provider)||!/^[a-f0-9-]{36}$/.test(d.runId)||!/^[a-f0-9]{64}$/.test(d.modelConfigHash)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(d.generatedAt)||!Number.isFinite(Date.parse(d.generatedAt)))throw Error('Invalid run metadata');
 obj(d.hardware,['platform','arch','ramBytes']);if(!['darwin','linux','win32','freebsd','aix','openbsd','sunos'].includes(d.hardware.platform)||!['arm64','x64','arm','ia32','ppc64','s390x','riscv64'].includes(d.hardware.arch)||!count(d.hardware.ramBytes))throw Error('Invalid hardware metadata');
 obj(d.counts,['requirements','tests','runnableTests','pairs','attempted','valid','errors','excluded','notRun']);
 if(Object.values(d.counts).some(v=>!count(v)))throw Error('Invalid counts');
 const n=d.counts;if(n.runnableTests>n.tests||n.pairs!==n.requirements*n.runnableTests||n.pairs!==n.valid+n.errors+n.excluded+n.notRun||n.attempted!==n.valid+n.errors)throw Error('Contradictory denominators');
 obj(d.coverage,['covered','partial','uncovered','needsJudgment','reviewed']);if(Object.values(d.coverage).some(v=>!count(v))||d.coverage.reviewed!==0||d.coverage.covered+d.coverage.partial+d.coverage.uncovered+d.coverage.needsJudgment!==n.requirements)throw Error('Invalid coverage totals');
 obj(d.smoke,['selectedTests','mandatoryRequirements','estimatedCoveredRequirements','missingRequirements','dependencyConflicts','unknownDurationTests','insufficientHistoryTests','unreliableTests','budgetMs','estimatedSerialMs','withinBudget','approved','measuredSmokeMs','faultRetention']);
 for(const k of ['selectedTests','mandatoryRequirements','estimatedCoveredRequirements','missingRequirements','dependencyConflicts','unknownDurationTests','insufficientHistoryTests','unreliableTests'])if(!count(d.smoke[k]))throw Error('Invalid smoke counts');
 const s=d.smoke;if(s.selectedTests>n.tests||s.mandatoryRequirements>n.requirements||s.estimatedCoveredRequirements+s.missingRequirements!==s.mandatoryRequirements||s.unknownDurationTests>s.selectedTests||s.insufficientHistoryTests>s.selectedTests||s.unreliableTests>n.tests||s.dependencyConflicts>n.tests||s.approved!==false||s.measuredSmokeMs!==null||s.faultRetention!==null||!measure(s.budgetMs)||!s.budgetMs||!measure(s.estimatedSerialMs)||s.withinBudget!==(s.estimatedSerialMs===null?null:s.estimatedSerialMs<=s.budgetMs)||s.unknownDurationTests&&s.estimatedSerialMs!==null)throw Error('Invalid smoke measurements');
 obj(d.performance,['evaluationWallMs','clientPeakRssBytes','modelPeakRssBytes','latencySamples','p50Ms','p95Ms','inputTokens','outputTokens']);
 if(Object.values(d.performance).some(v=>!measure(v))||d.performance.latencySamples!==n.valid||!count(d.performance.clientPeakRssBytes)||d.performance.evaluationWallMs===null||(!n.valid&&(d.performance.p50Ms!==null||d.performance.p95Ms!==null))||(n.valid&&(d.performance.p50Ms===null||d.performance.p95Ms===null||d.performance.p50Ms>d.performance.p95Ms)))throw Error('Invalid performance measurements');
 obj(d.quality,['reviewedLabels','accuracy']);if(d.quality.reviewedLabels!==0||d.quality.accuracy!==null)throw Error('Unreviewed predictions cannot claim accuracy');
 return d;
}
