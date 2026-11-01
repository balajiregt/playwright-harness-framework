import test from 'node:test';
import assert from 'node:assert/strict';
import type {IntakeSource,Segment} from '../src/intake/types.js';
import {buildDraft,matrixCsv} from '../src/intake/normalize.js';

function source(name:string,rows:Record<string,unknown>[],id=name):IntakeSource {
 return {id,name,file:'inputs/'+name,sha256:'a'.repeat(64),bytes:100,extraction:{version:1,format:'table',issues:[],segments:rows.map((fields,i)=>({id:'row-'+(i+1),text:JSON.stringify(fields),fields,locator:{row:i+2,sheet:'Requirements'}}))}};
}
const row=(id='AC-1',criterion='Invalid credentials retain the login page.')=>({'Req ID':id,'Acceptance Criteria':criterion,Feature:'Login',Critical:'Yes'});
function bound(result:ReturnType<typeof buildDraft>,sources:IntakeSource[]){
 for(const requirement of result.requirements)for(const ref of requirement.sources){const segment=sources.find(s=>s.id===ref.sourceId)?.extraction.segments.find(s=>s.id===ref.segmentId);assert.ok(segment?.text.includes(ref.quote),JSON.stringify(ref));}
}
test('known table aliases retain exact source quotes and historical RTM claims without runtime acceptance',()=>{
 const input=source('matrix.xlsx',[{...row(),'TestCaseID':'TC-1; TC-2',Status:'Passed'}]);
 const draft=buildDraft([input]);assert.equal(draft.questions.length,0);assert.equal(draft.requirements.length,1);bound(draft,[input]);
 assert.deepEqual(draft.requirements[0].suppliedLinks,[{testId:'TC-1',status:'Passed'},{testId:'TC-2',status:'Passed'}]);
 const csv=matrixCsv(draft.requirements);assert.ok(csv.includes('"unknown","not run"'));assert.ok(csv.includes('Supplied statuses (historical)'));assert.ok(csv.includes('TC-1: Passed'));
});
test('structured table header segments are metadata and do not create unstructured review questions',()=>{
 for(const name of ['criteria.csv','criteria.xlsx']){
  const input=source(name,[row()]);
  input.extraction.segments.unshift({id:'header',text:'Req ID | Acceptance Criteria | Feature | Critical',locator:{sheet:'Requirements',row:1,section:'header'}});
  const draft=buildDraft([input]);assert.equal(draft.requirements.length,1);assert.equal(draft.questions.length,0);bound(draft,[input]);
 }
});
test('ambiguous columns need explicit mapping; filename and sheet mappings select only intended records',()=>{
 const input=source('custom.xlsx',[{...row(),'Expected Result':'A different result.'}]);
 input.extraction.segments.push({...input.extraction.segments[0],id:'other-sheet',locator:{sheet:'Notes',row:2}});
 const ambiguous=buildDraft([input]);assert.equal(ambiguous.requirements.length,0);assert.ok(ambiguous.questions.some(q=>q.message.includes('Multiple criterion columns')));
 const draft=buildDraft([input],{sources:{'custom.xlsx':{sheet:'Requirements',fields:{criterion:'Expected Result'}}}});
 assert.equal(draft.requirements.length,1);assert.equal(draft.requirements[0].criterion,'A different result.');assert.equal(draft.questions.length,0);bound(draft,[input]);
 const missing=buildDraft([input],{sources:{'custom.xlsx':{sheet:'Absent',fields:{criterion:'Expected Result'}}}});assert.equal(missing.requirements.length,0);assert.ok(missing.questions.some(q=>q.message.includes('has no extracted segments')));
});
test('missing or unknown criticality and journey are source-level review questions with conservative draft values',()=>{
 const input=source('unknown.csv',[{RequirementID:'R1',AcceptanceCriterion:'First acceptance criterion.',Priority:'Urgent'}, {RequirementID:'R2',AcceptanceCriterion:'Second acceptance criterion.'}]);
 const draft=buildDraft([input]);assert.equal(draft.requirements.length,2);assert.equal(draft.questions.filter(q=>q.message.includes('Criticality/priority')).length,1);assert.equal(draft.questions.filter(q=>q.message.includes('Journey/feature')).length,1);
 assert.ok(draft.requirements.every(r=>r.critical&&r.journey==='Unassigned'));
 assert.deepEqual(buildDraft([input]),draft);
});
test('Jira explicit AC bullets become stable ticket AC IDs while technical descriptions remain review questions',()=>{
 const input=source('jira.json',[{key:'QA-42',fields:{description:'Implementation details\nAcceptance Criteria:\n- Invalid passwords show an error.\n- Valid users reach their dashboard.\nNotes: internal design',Feature:'Login',Priority:{name:'High'}}}]);
 const draft=buildDraft([input]);assert.deepEqual(draft.requirements.map(r=>r.id),['QA-42-AC-1','QA-42-AC-2']);assert.equal(draft.requirements[0].criterion,'Invalid passwords show an error.');assert.equal(draft.questions.length,0);bound(draft,[input]);
 const technical=source('technical.json',[{key:'QA-43',fields:{description:'Acceptance Criteria are discussed in the design.\nChange the authentication cache.'}}]);
 const review=buildDraft([technical]);assert.equal(review.requirements.length,0);assert.ok(review.questions.some(q=>q.message.includes('no explicit acceptance-criteria section')));
 const ambiguous=source('ambiguous-jira.json',[{key:'QA-46',fields:{AcceptanceCriteria:'One explicit result.',ExpectedResult:'A conflicting explicit result.',description:'Acceptance Criteria:\n- A fallback must not override ambiguous columns.'}}]);
 assert.equal(buildDraft([ambiguous]).requirements.length,0);
});
test('Jira ADF headings and explicit nested custom-field mappings are supported without guessing field semantics',()=>{
 const input=source('adf.json',[{key:'QA-44',fields:{description:{type:'doc',content:[{type:'heading',content:[{type:'text',text:'Acceptance Criteria'}]},{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'A failed login remains signed out.'}]}]}]}]},Feature:'Login',Priority:'High'}}]);
 const draft=buildDraft([input]);assert.equal(draft.requirements[0].criterion,'A failed login remains signed out.');bound(draft,[input]);
 const custom=source('custom.json',[{key:'QA-45',fields:{customfield_100:'The viewer cannot export accounts.',Feature:'Accounts',Priority:'Low'}}]);
 const mapped=buildDraft([custom],{sources:{'custom.json':{fields:{criterion:'fields.customfield_100'}}}});
 assert.equal(mapped.requirements[0].criterion,'The viewer cannot export accounts.');assert.equal(mapped.requirements[0].critical,false);assert.equal(mapped.questions.length,0);
});
test('normalized JSON requirements, duplicate IDs/text and conflicting records keep their source evidence',()=>{
 const first=source('normalized.json',[{version:1,requirements:[{id:'R1',criterion:'A viewer cannot export accounts.',journey:'Accounts',critical:true}]}]);
 const duplicate=source('rtm.xlsx',[row('R1','A viewer cannot export accounts.')]);duplicate.extraction.segments[0].fields!.Feature='Accounts';duplicate.extraction.segments[0].text=JSON.stringify(duplicate.extraction.segments[0].fields);
 const merged=buildDraft([first,duplicate]);assert.equal(merged.requirements.length,1);assert.equal(merged.requirements[0].sources.length,2);assert.equal(merged.questions.length,0);bound(merged,[first,duplicate]);
 const conflict=source('conflict.csv',[row('R1','A viewer can export all accounts.')]);
 const conflicting=buildDraft([first,conflict]);assert.equal(conflicting.requirements.length,2);assert.equal(new Set(conflicting.requirements.map(r=>r.id)).size,2);assert.ok(conflicting.questions.some(q=>q.message.includes('conflicting criterion text')));bound(conflicting,[first,conflict]);
 assert.deepEqual(buildDraft([first,conflict]),buildDraft([conflict,first]));
});
test('identical text with different supplied IDs merges refs but requires explicit identity review',()=>{
 const input=source('aliases.csv',[row('R2'),row('R1')]);const draft=buildDraft([input]);assert.equal(draft.requirements.length,1);assert.equal(draft.requirements[0].id,'R1');assert.equal(draft.requirements[0].sources.length,2);assert.ok(draft.questions.some(q=>q.message.includes('supplied IDs')));
});
test('unstructured pages and extraction issues produce questions instead of fabricated requirements',()=>{
 const input=source('flow.pdf',[]);input.extraction.format='pdf';input.extraction.segments=[{id:'page-1',text:'Login → Dashboard. Technical diagram notes.',locator:{page:1}} as Segment];input.extraction.issues=[{code:'low-text',severity:'warning',message:'Review diagram labels.'}];
 const draft=buildDraft([input]);assert.equal(draft.requirements.length,0);assert.equal(draft.questions.length,2);assert.ok(draft.questions.some(q=>q.message.includes('unstructured document/flow')));
});
test('CSV protects formula-leading cells and preserves quotes/newlines as one escaped cell',()=>{
 const input=source('formula.csv',[row('R1','=HYPERLINK("https://example.test","label")')]);
 const draft=buildDraft([input]);draft.requirements[0].journey=' \t+SUM(1,2)';draft.requirements[0].suppliedLinks=[{testId:'@danger',status:'=execute()'}];
 const csv=matrixCsv(draft.requirements);
 assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"",""label"")"'));
 assert.ok(csv.includes('"\' \t+SUM(1,2)"'));assert.ok(csv.includes('"\'@danger"'));assert.ok(csv.includes('"\'@danger: =execute()"'));
 assert.ok(csv.endsWith('\r\n'));assert.ok(csv.includes('"unknown","not run"'));
});
