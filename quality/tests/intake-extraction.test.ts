import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {ROOT} from '../src/context.js';
import type {Extraction} from '../src/intake/types.js';

const python=existsSync(path.join(ROOT,'.venv/bin/python'))?path.join(ROOT,'.venv/bin/python'):'python3';
const script=path.join(ROOT,'python/intake_artifact.py');
const available=(module:string)=>spawnSync(python,['-c',`import importlib.util; raise SystemExit(0 if importlib.util.find_spec(${JSON.stringify(module)}) else 1)`]).status===0;
function extract(file:string,flags:string[]=[],sheet?:string):Extraction{
 const result=spawnSync(python,[...flags,script,file,...(sheet===undefined?[]:['--sheet',sheet])],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'','Parser diagnostics must not expose source snippets');
 return JSON.parse(result.stdout);
}
async function temporary(t:{after:(fn:()=>Promise<void>)=>void}){
 const root=await mkdtemp(path.join(os.tmpdir(),'intake documents with spaces-'));
 t.after(()=>rm(root,{recursive:true,force:true}));return root;
}

test('CSV preserves quoted multiline criteria, logical rows, physical lines and literal zero/false',async t=>{
 const root=await temporary(t),file=path.join(root,'jira.csv');
 const text='Issue key,Acceptance Criteria,Journey,Critical,Count,Enabled\r\nAUTH-1,"Reject invalid\npassword, retain login",login,false,0,false\r\n';
 await writeFile(file,text);const result=extract(file),header=result.segments[0],row=result.segments[1];
 assert.equal(result.format,'csv');assert.equal(result.issues.length,0);assert.equal(header.locator.section,'header');assert.equal(header.fields,undefined);
 assert.deepEqual(row.locator,{row:2,cells:'A2:F2',line:2});
 assert.deepEqual(row.fields,{'Issue key':'AUTH-1','Acceptance Criteria':'Reject invalid\npassword, retain login',Journey:'login',Critical:'false',Count:'0',Enabled:'false'});
 assert.ok(row.text.includes(String(row.fields!['Acceptance Criteria'])));assert.equal(await readFile(file,'utf8'),text);
});

test('ambiguous spreadsheet headers block automatic mapping without losing repeated-column values',async t=>{
 const root=await temporary(t),file=path.join(root,'ambiguous.csv');
 await writeFile(file,'id,criterion,criterion\nA,First required behavior,Second required behavior\n');
 const result=extract(file);assert.ok(result.issues.some(i=>i.code==='ambiguous_headers'&&i.severity==='blocking'));
 assert.match(result.segments[1].text,/First required behavior/);assert.match(result.segments[1].text,/Second required behavior/);
});

test('normalized requirements and native Jira issue exports retain original fields and exact readable quotes',async t=>{
 const root=await temporary(t),criterion='When sign-in fails,\nremain on the login page.';
 const required={id:'AUTH-1',criterion,journey:'login',critical:false};
 const normalized=path.join(root,'requirements.json');await writeFile(normalized,JSON.stringify({version:1,requirements:[required]}));
 const first=extract(normalized);assert.deepEqual(first.segments[0].fields,required);assert.equal(first.segments[0].locator.section,'requirements[0]');assert.ok(first.segments[0].text.includes(criterion));
 const issue={key:'AUTH-1',fields:{summary:'Review sign-in failure',description:{type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text:'Reject invalid password'},{type:'text',text:'and show an error.'}]}]},customfield_12345:criterion}};
 for(const [name,value] of [['jira.json',{issues:[issue]}],['single.json',issue]] as const){
  const file=path.join(root,name);await writeFile(file,JSON.stringify(value));const result=extract(file);
  assert.deepEqual(result.segments[0].fields,issue);assert.ok(result.segments[0].text.includes(criterion));assert.match(result.segments[0].text,/Reject invalid password and show an error\./);
 }
});

test('Markdown keeps source line/section locators and generic JSON stays context rather than invented criteria',async t=>{
 const root=await temporary(t),md=path.join(root,'flow.md'),json=path.join(root,'context.json');
 await writeFile(md,'# Sign in\n\nShow an error for an invalid password.\n## Recovery\nOffer a retry.\n');
 const result=extract(md);assert.deepEqual(result.segments[1].locator,{line:3,section:'Sign in'});assert.equal(result.segments[1].text,'Show an error for an invalid password.');
 await writeFile(json,JSON.stringify({owner:'QA',enabled:false,count:0}));const context=extract(json);
 assert.deepEqual(context.segments[0].fields,{owner:'QA',enabled:false,count:0});assert.match(context.segments[0].text,/enabled: false/);assert.match(context.segments[0].text,/count: 0/);
});

test('image inputs, unavailable optional dependencies and parser failures produce sanitized blocking issues',async t=>{
 const root=await temporary(t),image=path.join(root,'flow.png'),pdf=path.join(root,'spec.pdf'),invalid=path.join(root,'jira.json');
 await writeFile(image,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
 assert.ok(extract(image).issues.some(i=>i.code==='visual_input_requires_review'&&i.severity==='blocking'));
 await writeFile(pdf,'%PDF-1.4\n');assert.ok(extract(pdf,['-S']).issues.some(i=>i.code==='missing_dependency'&&i.severity==='blocking'));
 await writeFile(invalid,'PRIVATE_PARSER_SENTINEL not JSON');const bad=extract(invalid);
 assert.equal(bad.segments.length,0);assert.ok(bad.issues.some(i=>i.code==='parse_failed'&&i.severity==='blocking'));assert.ok(!JSON.stringify(bad).includes('PRIVATE_PARSER_SENTINEL'));
 await writeFile(invalid,'{"key":"FIRST","key":"SECOND"}');assert.ok(extract(invalid).issues.some(i=>i.code==='parse_failed'&&i.severity==='blocking'));
});

test('oversized content, source bytes and table records fail explicitly without partial extraction',async t=>{
 const root=await temporary(t),text=path.join(root,'large.txt'),csv=path.join(root,'many.csv');
 await writeFile(text,'A'.repeat(90001));const content=extract(text);assert.equal(content.segments.length,0);assert.ok(content.issues.some(i=>i.code==='content_limit'));
 await writeFile(text,Buffer.alloc(10*1024*1024+1,65));assert.ok(extract(text).issues.some(i=>i.code==='file_limit'));
 await writeFile(csv,'id,criterion\n'+Array.from({length:2000},(_,i)=>`R${i},Required behavior`).join('\n'));
 const rows=extract(csv);assert.equal(rows.segments.length,0);assert.ok(rows.issues.some(i=>i.code==='row_limit'));
});

test('real XLSX preserves all sheet locators, zero/false and visible blocked formulas',{skip:!available('openpyxl')},async t=>{
 const root=await temporary(t),file=path.join(root,'rtm.xlsx');
 execFileSync(python,['-c',`from openpyxl import Workbook
import sys
b=Workbook(); s=b.active;s.title='RTM'
s.append(['id','criterion','journey','critical','count','enabled'])
s.append(['AUTH-1','Reject an invalid password.','login',False,0,False])
s=b.create_sheet('Calculated');s.append(['id','criterion','journey']);s.append(['AUTH-2','=1+1','login'])
b.save(sys.argv[1])`,file]);
 const result=extract(file),row=result.segments.find(s=>s.locator.sheet==='RTM'&&s.locator.row===2)!;
 assert.equal(row.fields!.critical,false);assert.equal(row.fields!.count,0);assert.equal(row.fields!.enabled,false);assert.equal(row.locator.cells,'A2:F2');
 const formula=result.segments.find(s=>s.locator.sheet==='Calculated'&&s.locator.row===2)!;
 assert.equal(formula.fields!.criterion,'=1+1');assert.ok(result.issues.some(i=>i.code==='formula_requires_literal'&&i.severity==='blocking'&&i.segmentId===formula.id));
 const scoped=extract(file,[],'RTM');assert.deepEqual(scoped.selection,{sheet:'RTM'});
 assert.ok(scoped.segments.length>0&&scoped.segments.every(s=>s.locator.sheet==='RTM'));
 assert.ok(!scoped.issues.some(i=>i.code==='formula_requires_literal'));
 const missing=extract(file,[],'Missing');assert.equal(missing.segments.length,0);assert.ok(missing.issues.some(i=>i.code==='sheet_not_found'&&i.severity==='blocking'));
});

test('real PDF retains every page and blocks nontext pages instead of silently omitting them',{skip:!available('pypdf')},async t=>{
 const root=await temporary(t),file=path.join(root,'mixed.pdf');
 execFileSync(python,['-c',`from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, NumberObject, DecodedStreamObject
import sys
w=PdfWriter(); p=w.add_blank_page(width=200,height=200)
font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
p[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):w._add_object(font)})})
stream=DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 10 100 Td (Reject invalid passwords.) Tj ET');p[NameObject('/Contents')]=w._add_object(stream)
p=w.add_blank_page(width=200,height=200)
image=DecodedStreamObject();image.set_data(bytes([255,0,0]));image.update({NameObject('/Type'):NameObject('/XObject'),NameObject('/Subtype'):NameObject('/Image'),NameObject('/Width'):NumberObject(1),NameObject('/Height'):NumberObject(1),NameObject('/ColorSpace'):NameObject('/DeviceRGB'),NameObject('/BitsPerComponent'):NumberObject(8)})
p[NameObject('/Resources')]=DictionaryObject({NameObject('/XObject'):DictionaryObject({NameObject('/Im0'):w._add_object(image)})})
w.write(sys.argv[1])`,file]);
 const result=extract(file);assert.equal(result.segments.length,2);assert.equal(result.segments[0].locator.page,1);assert.match(result.segments[0].text,/Reject invalid passwords\./);assert.equal(result.segments[1].locator.page,2);assert.equal(result.segments[1].text,'');
 assert.ok(result.issues.some(i=>i.code==='pdf_page_without_text'&&i.severity==='blocking'&&i.segmentId==='page-2'));
 assert.ok(result.issues.some(i=>i.code==='visual_content_review'&&i.segmentId==='page-2'));
});

test('existing real XLS template preserves worksheet/row fields',{skip:!available('xlrd')},()=>{
 const result=extract(path.join(ROOT,'examples/team/requirements.xls'));
 assert.ok(result.segments.some(s=>s.locator.sheet==='Requirements'&&s.locator.row===2&&s.fields?.criterion));
 assert.ok(!result.issues.some(i=>i.severity==='blocking'),JSON.stringify(result.issues));
});

test('real BIFF XLS formula records are blocked rather than accepting or evaluating cached results',{skip:!available('xlrd')},async t=>{
 const root=await temporary(t),file=path.join(root,'formula.xls');
 // Minimal BIFF8 workbook: formula expression is 1, deliberately stale cached value is 999.
 execFileSync(python,['-c',`import struct,pathlib,sys
rec=lambda code,data=b'':struct.pack('<HH',code,len(data))+data
bof=lambda typ:rec(0x0809,struct.pack('<HHHHII',0x600,typ,0xdbb,1997,0x41,6))
label=lambda row,col,text:rec(0x0204,struct.pack('<HHHHB',row,col,0,len(text),0)+text.encode())
name='Requirements'
bounds=lambda offset:rec(0x0085,struct.pack('<IBBBB',offset,0,0,len(name),0)+name.encode())
header=bof(5)+rec(0x0042,struct.pack('<H',1200))+bounds(0)+rec(0xa)
header=bof(5)+rec(0x0042,struct.pack('<H',1200))+bounds(len(header))+rec(0xa)
sheet=bof(0x10)+rec(0x0200,struct.pack('<IIHHH',0,2,0,4,0))
for i,text in enumerate(['id','criterion','journey','critical']):sheet+=label(0,i,text)
for i,text in enumerate(['AUTH-1','Reject invalid passwords.','login']):sheet+=label(1,i,text)
sheet+=rec(0x0006,struct.pack('<HHHdHIH',1,3,0,999.0,0,0,3)+bytes([0x1e,1,0]))+rec(0xa)
pathlib.Path(sys.argv[1]).write_bytes(header+sheet)`,file]);
 const result=extract(file),row=result.segments.find(s=>s.locator.row===2)!;
 assert.match(String(row.fields!.critical),/Formula cell; cached value: 999/);
 assert.ok(result.issues.some(i=>i.code==='formula_requires_literal'&&i.severity==='blocking'&&i.segmentId===row.id));
});
