import type {IntakeDraft,IntakeSource,IntakeMappings} from '../intake/types.js';

export interface PortalRun {
 id:string;createdAt:string;goal:string;intakeHash:string;draftHash:string;
 draft:IntakeDraft;documents:IntakeSource[];openQuestions:number;blockingDocuments:number;
 reviewed:boolean;accepted:boolean;brief:string;
 stale?:string;mappings?:IntakeMappings;
 matrix?:Record<string,string>[];
}
export interface TestReportView {
 id:string;kind:'playwright';name:string;importedAt:string;recordedAt:string|null;
 counts:{expected:number;unexpected:number;skipped:number;flaky:number;total:number};
 tests:{title:string;project:string;status:string;durationMs:number|null;errors:string[]}[];
 limitations:string[];
}
export interface MutationReportView {
 id:string;kind:'mutation';name:string;importedAt:string;recordedAt:string|null;runId:string;
 counts:{requested:number;killed:number;survived:number;notActivated:number;invalid:number;inconclusive:number;notRun:number};
 baselines:{status:string;tests:number}[];restored:string|null;originalUnchanged:boolean;
 faults:{id:string;requirementId:string;status:string;reason?:string;baselineProbe?:string;mutantProbe?:string;killingTests:string[]}[];
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
