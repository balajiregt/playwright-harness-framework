import type {Requirement} from '../team/config.js';

export interface Locator {page?:number;sheet?:string;row?:number;line?:number;cells?:string;section?:string}
export interface Segment {id:string;text:string;locator:Locator;fields?:Record<string,unknown>}
export interface ExtractionIssue {code:string;severity:'warning'|'blocking';message:string;segmentId?:string}
export interface Extraction {version:1;format:string;segments:Segment[];issues:ExtractionIssue[];selection?:{sheet:string}}
export interface IntakeSource {id:string;name:string;file:string;sha256:string;bytes:number;extraction:Extraction}
export interface SourceRef {sourceId:string;segmentId:string;quote:string}
export interface DraftRequirement extends Requirement {
  sources:SourceRef[];
  suppliedLinks?:{testId:string;status?:string}[];
}
export interface IntakeQuestion {id:string;message:string;sourceIds:string[];resolution?:string}
export interface IntakeDraft {version:1;intakeHash:string;requirements:DraftRequirement[];questions:IntakeQuestion[]}
export type FieldMapping=Partial<Record<'id'|'criterion'|'journey'|'critical'|'ticket'|'testId'|'status',string>>;
export interface SourceMapping {sheet?:string;fields:FieldMapping;defaultJourney?:string}
export interface IntakeMappings {sources:Record<string,SourceMapping>}
export interface IntakeSnapshot {
  version:1;kind:'playwright-task-intake';runId:string;createdAt:string;
  repo:string;taskId:string;taskDirectory:string;goal:'create'|'update'|'assess';
  sources:IntakeSource[];questions:IntakeQuestion[];intakeHash:string;
  mappings?:IntakeMappings;
}
