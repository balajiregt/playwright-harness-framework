import {createHash} from 'node:crypto';
import type {DraftRequirement,FieldMapping,IntakeMappings,IntakeQuestion,IntakeSource,Segment,SourceRef} from './types.js';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex').slice(0,16);
const key=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
const scalar=(value:unknown)=>typeof value==='string'?value.trim():typeof value==='number'||typeof value==='boolean'?String(value):'';
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const aliases:Record<keyof FieldMapping,string[]>={
 id:['id','requirementid','reqid','acid'],criterion:['criterion','acceptancecriteria','acceptancecriterion','expectedresult'],
 journey:['journey','feature'],critical:['critical','priority'],ticket:['jirakey','issuekey','key'],testId:['testcaseid','testid'],status:['status']
};
function lookup(row:Record<string,unknown>,field:string):unknown {
 if(Object.hasOwn(row,field))return row[field];
 return field.split('.').reduce<unknown>((v,k)=>record(v)?v[k]:undefined,row);
}
/** Jira rich-text descriptions stay plain evidence; headings are still required. */
function plain(value:unknown):string {
 if(typeof value==='string')return value;
 if(!record(value))return '';
 if(typeof value.text==='string')return value.text;
 if(value.type==='hardBreak')return '\n';
 if(!Array.isArray(value.content))return '';
 const children=value.content.map(plain);
 return value.type==='listItem'?'- '+children.join('').trim():children.join(['doc','bulletList','orderedList'].includes(String(value.type))?'\n':'')+(value.type==='paragraph'||value.type==='heading'?'\n':'');
}
function acceptanceSection(description:string):string|undefined {
 const lines=description.split(/\r?\n/);
 const heading=/^\s*(?:(?:#{1,6}|h[1-6]\.)\s*)?\*{0,2}Acceptance\s+(?:Criteria|Criterion)\*{0,2}\s*(?::\s*(.*)|$)/i;
 const start=lines.findIndex(line=>heading.test(line));
 if(start<0)return undefined;
 const first=lines[start].match(heading)![1]??'',body=[first];
 for(const line of lines.slice(start+1)){
  if(/^\s*(?:#{1,6}\s+|h[1-6]\.\s+|(?:Technical details|Implementation|Notes|Out of scope|Definition of done)\s*:)/i.test(line))break;
  body.push(line);
 }
 return body.join('\n').trim()||undefined;
}
/** Split explicit list items, never infer boundaries from commas or conjunctions. */
function criteria(text:string):string[] {
 const marker=/^\s*(?:[-*•]\s+|\d+[.)]\s+|AC[- ]?\d+\s*[:.)-]\s*)(.+)$/i;
 const lines=text.split(/\r?\n/);
 if(!lines.some(line=>marker.test(line)))return [text.trim()].filter(Boolean);
 const result:string[]=[];
 for(const line of lines){const match=line.match(marker);if(match)result.push(match[1].trim());else if(line.trim()&&result.length)result[result.length-1]+='\n'+line.trim();}
 return result;
}
const uniqueRefs=(refs:SourceRef[])=>[...new Map(refs.map(r=>[JSON.stringify(r),r])).values()];

export function buildDraft(sources:IntakeSource[],mappings:IntakeMappings={sources:{}}):{requirements:DraftRequirement[];questions:IntakeQuestion[]} {
 const candidates:DraftRequirement[]=[],questions=new Map<string,IntakeQuestion>();
 function question(sourceIds:string[],code:string,message:string){
  const ids=[...new Set(sourceIds)].sort(),id='Q-'+hash(JSON.stringify([ids,code]));
  if(!questions.has(id))questions.set(id,{id,message,sourceIds:ids});
 }
 for(const source of [...sources].sort((a,b)=>a.id.localeCompare(b.id))){
  const ids=[source.id],mapping=mappings.sources[source.name]??mappings.sources[source.id]??mappings.sources[source.file];
  const q=(code:string,message:string)=>question(ids,code,`${source.name}: ${message}`);
  for(const issue of source.extraction.issues)q('extraction:'+issue.code+':'+(issue.segmentId??''),`Extraction ${issue.severity}: ${issue.message}`);
  let selected=0;
  for(const segment of source.extraction.segments){
   if(mapping?.sheet!==undefined&&segment.locator.sheet!==mapping.sheet)continue;
   if(segment.locator.section==='header')continue;
   selected++;
   if(!segment.text.trim()){q('empty:'+segment.id,'Empty extracted segment requires review.');continue;}
   if(!segment.fields){q('unstructured:'+segment.id,'Review this unstructured document/flow segment and propose source-bound acceptance criteria; prose is not automatically a requirement.');continue;}
   const rows=Array.isArray(segment.fields.requirements)?segment.fields.requirements:[segment.fields];
   for(const raw of rows){
    if(!record(raw)){q('record:'+segment.id,'A structured record is not an object; review its extraction.');continue;}
    const nested=record(raw.fields)?raw.fields:undefined;
    const columns=[...Object.keys(raw),...Object.keys(nested??{}).map(k=>'fields.'+k)];
    const blocked=new Set<keyof FieldMapping>();
    const get=(field:keyof FieldMapping):unknown=>{
     const explicit=mapping?.fields[field];
     if(explicit!==undefined){const value=lookup(raw,explicit);if(value===undefined){blocked.add(field);q('mapping:'+field+':'+explicit,`Mapped ${field} field "${explicit}" is absent; fix the mapping or input.`);}return value;}
     const matches=columns.filter(c=>aliases[field].includes(key(c.startsWith('fields.')?c.slice(7):c)));
     if(matches.length>1){blocked.add(field);q('columns:'+field+':'+matches.sort().join(','),`Multiple ${field} columns (${matches.join(', ')}) need an explicit field mapping; no column was chosen.`);return undefined;}
     return matches.length?lookup(raw,matches[0]):undefined;
    };
    const suppliedId=scalar(get('id')),ticket=scalar(get('ticket'));
    let text=plain(get('criterion')).trim();
    const isJira=Boolean(nested&&ticket);
    if(!text&&isJira&&!mapping?.fields.criterion&&!blocked.has('criterion')){
     text=acceptanceSection(plain(nested!.description))??'';
     if(!text)q('jira-ac:'+ticket,`Ticket ${ticket} has no explicit acceptance-criteria section. Review its description; technical prose was not converted into criteria.`);
    }
    if(!text){q('criterion:'+segment.id,'No unambiguous acceptance criterion was found. Select the criterion field or supply a reviewed source-bound proposal.');continue;}
    let journey=scalar(get('journey'))||mapping?.defaultJourney?.trim()||'';
    if(!journey||journey.length>120){journey='Unassigned';q('journey','Journey/feature is missing or invalid. Draft uses "Unassigned"; review all affected criteria before acceptance.');}
    const rawCritical=get('critical'),criticalValue=record(rawCritical)?rawCritical.name:rawCritical,criticalText=scalar(criticalValue).toLowerCase().replace(/[ _-]/g,'');
    let critical:boolean;
    if(typeof criticalValue==='boolean')critical=criticalValue;
    else if(['true','yes','y','1','critical','blocker','highest','high','p0','p1'].includes(criticalText))critical=true;
    else if(['false','no','n','0','noncritical','normal','medium','low','lowest','p2','p3','p4'].includes(criticalText))critical=false;
    else{critical=true;q('criticality','Criticality/priority is missing, ambiguous or unrecognized. Draft conservatively uses critical=true; review all affected criteria before acceptance.');}
    const testValue=get('testId'),status=scalar(get('status'));
    const testIds=scalar(testValue).split(/[,;\n]+/).map(v=>v.trim()).filter(Boolean);
    if(testValue!==undefined&&!scalar(testValue))q('links:'+segment.id,'Supplied test links are not scalar IDs; review the historical traceability claims.');
    if(status&&!testIds.length)q('status:'+segment.id,'Supplied status has no test ID. It remains source evidence, not observed runtime or acceptance.');
    const parts=isJira||ticket?criteria(text):[text];
    for(const [i,criterion] of parts.entries()){
     if(criterion.length<5||criterion.length>8000){q('length:'+segment.id+':'+i,'Criterion length is outside the requirements interface; review and split it explicitly.');continue;}
     let id=(ticket&&(isJira||parts.length>1)?`${ticket}-AC-${i+1}`:suppliedId)|| (ticket?`${ticket}-AC-${i+1}`:'REQ-'+hash(criterion));
     if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(id)){
      q('id:'+segment.id+':'+id,'Supplied requirement/ticket ID is invalid for the requirements interface. A stable provisional ID was generated for review.');id='REQ-'+hash(id+'\n'+criterion);
     }
     const quote=segment.text.includes(criterion)?criterion:segment.text;
     candidates.push({id,criterion,journey,critical,sources:[{sourceId:source.id,segmentId:segment.id,quote}],...(testIds.length?{suppliedLinks:testIds.map(testId=>({testId,...(status?{status}:{})}))}:{})});
    }
   }
  }
  if(!selected)q('no-segments',mapping?.sheet!==undefined?`Selected sheet "${mapping.sheet}" has no extracted segments.`:'No extracted segments are available for review.');
 }
 const requirements:DraftRequirement[]=[];
 for(const candidate of candidates.sort((a,b)=>a.id.localeCompare(b.id)||a.criterion.localeCompare(b.criterion))){
  const exact=requirements.find(r=>r.criterion===candidate.criterion);
  if(exact){
   const sourceIds=[...exact.sources,...candidate.sources].map(s=>s.sourceId);
   if(exact.id!==candidate.id)question(sourceIds,'duplicate-identity:'+hash(candidate.criterion),`Identical criterion text has supplied IDs ${exact.id} and ${candidate.id}. Draft merged it under ${exact.id}; review identity before acceptance.`);
   if(exact.journey!==candidate.journey||exact.critical!==candidate.critical)question(sourceIds,'duplicate-metadata:'+hash(candidate.criterion),'Identical criterion text has conflicting journey or criticality. Draft retains one journey and conservative criticality; review the source metadata.');
   exact.critical=exact.critical||candidate.critical;
   exact.sources=uniqueRefs([...exact.sources,...candidate.sources]);
   const links=[...exact.suppliedLinks??[],...candidate.suppliedLinks??[]];
   if(links.length)exact.suppliedLinks=[...new Map(links.map(l=>[JSON.stringify(l),l])).values()];
   continue;
  }
  const conflict=requirements.find(r=>r.id===candidate.id);
  if(conflict){
   question([...conflict.sources,...candidate.sources].map(s=>s.sourceId),'conflict:'+candidate.id,`Requirement ID ${candidate.id} has conflicting criterion text. Both candidates remain in the draft; resolve their identity and meaning before acceptance.`);
   candidate.id=candidate.id.slice(0,53)+'-CONFLICT-'+hash(candidate.criterion);
  }
  requirements.push(candidate);
 }
 return {requirements,questions:[...questions.values()].sort((a,b)=>a.id.localeCompare(b.id))};
}

function cell(value:string):string {
 const safe=/^[\s\uFEFF]*[=+\-@]/.test(value)?"'"+value:value;
 return '"'+safe.replace(/"/g,'""')+'"';
}
/** Supplied RTM links/status remain separate from observed test/assertion/runtime evidence. */
export function matrixCsv(requirements:DraftRequirement[]):string {
 const rows=[['Requirement ID','Criterion','Source refs','Journey','Scenario','Role','State','Test','Assertion','Assessment','Runtime','Supplied test IDs (historical)','Supplied statuses (historical)'],
  ...requirements.map(r=>[r.id,r.criterion,r.sources.map(s=>`${s.sourceId}/${s.segmentId}: ${s.quote}`).join('\n'),r.journey,'','','','','','unknown','not run',r.suppliedLinks?.map(l=>l.testId).join('\n')??'',r.suppliedLinks?.map(l=>`${l.testId}: ${l.status??'not supplied'}`).join('\n')??''])];
 return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
