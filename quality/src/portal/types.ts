import type {IntakeDraft,IntakeSource,IntakeMappings} from '../intake/types.js';
import type {AgentAnalysis} from './analysis.js';

export interface PortalRun {
 id:string;createdAt:string;goal:string;intakeHash:string;draftHash:string;
 draft:IntakeDraft;documents:IntakeSource[];openQuestions:number;blockingDocuments:number;
 reviewed:boolean;accepted:boolean;
 stale?:string;mappings?:IntakeMappings;
 matrix?:Record<string,string>[];
 analysis?:AgentAnalysis;
}
export interface TestReportView {
 id:string;kind:'playwright';name:string;importedAt:string;recordedAt:string|null;
 durationMs:number|null;reportErrors:string[];reportErrorCount:number;
 counts:{expected:number;unexpected:number;skipped:number;flaky:number;total:number};
 tests:{title:string;project:string;status:string;durationMs:number|null;errors:string[];errorCount:number;
  outcome:'expected'|'unexpected'|'flaky'|'skipped';expectedStatus:string;file?:string;line?:number;column?:number;
  attempts:{status:string;retry:number|null;durationMs:number|null;errors:string[];errorCount:number}[];
 }[];
 limitations:string[];
}
export interface ExecutionSummary {
 status:string;errors:number;tests:number;passed:number;failed:number;skipped:number;other:number;
 assertionFailures:number;durationMs:number;
}
export interface MutationReportView {
 id:string;kind:'mutation';name:string;importedAt:string;recordedAt:string|null;runId:string;
 counts:{requested:number;killed:number;survived:number;notActivated:number;invalid:number;inconclusive:number;notRun:number};
 baselines:ExecutionSummary[];restored:string|null;restoration:ExecutionSummary|null;originalUnchanged:boolean;
 faults:{id:string;requirementId:string;criterion:string;description:string;status:string;reason?:string;baselineProbe?:string;mutantProbe?:string;killingTests:string[];killingTestCount:number;attempts:ExecutionSummary[]}[];
 limitations:string[];
}
export interface PortalTaskDetail {
 taskId:string;runs:{id:string;createdAt:string;goal:string}[];run:PortalRun|null;
 reports:{tests:TestReportView[];mutations:MutationReportView[]};
}
export interface PortalTaskSummary {
 id:string;updatedAt:string|null;runId:string|null;status:string;
 criteria:number;openQuestions:number;sources:number;testReports:number;mutationReports:number;
}
