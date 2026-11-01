'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const tabs = [['overview','Overview'],['artifacts','Artifacts'],['criteria','Acceptance criteria'],['traceability','Traceability'],['tests','Test reports'],['mutations','Mutation reports']];
  const state = {project:null,token:null,tasks:[],detail:null,draft:null,tab:'overview',sourceId:null,editIndex:-1,dirty:false,busy:false,reviewer:'',confirmed:false,replaceReviewed:false,preview:false};
  let fieldId=0,requestId=0,toastTimer;
  const chartColors=['#128775','#d4a14b','#8a9eac','#737dad','#b86572','#699eb1','#a9805a'];
  // Deliberately separate from the live task/draft state. Nothing here is sent to an API.
  const illustrativeDetail={taskId:'RECEIVING-482',run:{id:'illustration',createdAt:'2030-04-18T09:15:00Z',goal:'assess',accepted:false,reviewed:true,blockingDocuments:0,documents:[{name:'receiving-notes.md',extraction:{format:'md'}},{name:'example-criteria.json',extraction:{format:'json'}},{name:'example-links.csv',extraction:{format:'csv'}}],draft:{requirements:Array.from({length:5},(_,index)=>({id:'EXAMPLE-'+(index+1),sources:[{sourceId:'illustrative-source',segmentId:'example-segment',quote:'Fictional source quotation.'}]})),questions:[{id:'example-question-1'},{id:'example-question-2'}]},matrix:[{Assessment:'supported'},{Assessment:'supported'},{Assessment:'partial'},{Assessment:'unknown'},{Assessment:'unknown'}]},reports:{tests:[{name:'illustrative-playwright-report.json',importedAt:'2030-04-18T09:32:00Z',counts:{expected:10,unexpected:1,skipped:1,flaky:0,total:12}}],mutations:[{name:'illustrative-mutation-report.json',importedAt:'2030-04-18T09:40:00Z',counts:{requested:4,killed:2,survived:1,inconclusive:1,notActivated:0,invalid:0,notRun:0}}]}};

  function node(tag,attributes={},...children){
    const element=document.createElement(tag);
    for(const [key,value] of Object.entries(attributes)){
      if(value===undefined||value===null)continue;
      if(key.startsWith('on')&&typeof value==='function')element.addEventListener(key.slice(2).toLowerCase(),value);
      else if(key==='class')element.className=value;
      else if(['value','checked','disabled','hidden','selected','readOnly'].includes(key))element[key]=value;
      else element.setAttribute(key,String(value));
    }
    for(const child of children.flat(Infinity))if(child!==null&&child!==undefined&&child!==false)element.append(child instanceof Node?child:document.createTextNode(String(child)));
    return element;
  }
  const button=(text,action,className='button secondary',disabled=false)=>node('button',{type:'button',class:className,onClick:action,disabled},text);
  const badge=(text,tone='')=>node('span',{class:'pill '+tone},text);
  const run=()=>state.detail?.run;
  const readonly=()=>Boolean(run()?.accepted||run()?.stale);
  const taskUrl=(suffix='')=>'/api/tasks/'+encodeURIComponent(state.detail.taskId)+suffix;
  const runUrl=()=>taskUrl('/runs/'+encodeURIComponent(run().id));
  const docUrl=source=>runUrl()+'/documents/'+encodeURIComponent(source.id);
  const download=(text,url,className='button secondary small')=>node('a',{href:url,class:className,download:''},text);
  const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded';
  const bytes=value=>value<1024?value+' B':value<1024*1024?(value/1024).toFixed(1)+' KB':(value/1024/1024).toFixed(1)+' MB';
  const goal=value=>({create:'Create tests',update:'Update tests',assess:'Assess coverage'}[value]||value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const unresolved=()=>state.draft?.questions.filter(q=>!q.resolution?.trim())??[];
  const sourceFor=id=>run()?.documents.find(source=>source.id===id);
  const segmentFor=ref=>sourceFor(ref.sourceId)?.extraction.segments.find(segment=>segment.id===ref.segmentId);
  function locator(value={}){return [value.page!==undefined?'Page '+value.page:null,value.sheet?'Sheet '+value.sheet:null,value.row!==undefined?'row '+value.row:null,value.cells||null,value.line!==undefined?'line '+value.line:null,value.section||null].filter(Boolean).join(' · ')||'Document record';}
  function notify(message){clearTimeout(toastTimer);$('#live-status').textContent=message;$('#live-status').hidden=false;toastTimer=setTimeout(()=>{$('#live-status').hidden=true;},6500);}
  function clearError(){$('#error-banner').hidden=true;$('#error-banner').replaceChildren();}
  function showError(error){$('#error-banner').textContent=error instanceof Error?error.message:'The request could not be completed.';$('#error-banner').hidden=false;}
  async function api(url,{method='GET',body}={}){
    if(state.preview&&method!=='GET')throw Error('Layout preview is read-only. Exit the preview to work with project evidence.');
    const headers={};
    if(method!=='GET')headers['X-Portal-Token']=state.token;
    if(body!==undefined&&!(body instanceof FormData)){headers['Content-Type']='application/json';body=JSON.stringify(body);}
    const response=await fetch(url,{method,headers,body,credentials:'same-origin',cache:'no-store'});
    let data;try{data=await response.json();}catch{throw Error('The local workbench returned an unreadable response.');}
    if(!response.ok)throw Error(typeof data.error==='string'?data.error:'The request could not be completed ('+response.status+').');
    return data;
  }
  function working(value){state.busy=value;document.body.setAttribute('aria-busy',String(value));$('#upload-submit').disabled=value;updateReviewControls();}
  async function action(fn){if(state.busy)return;clearError();working(true);try{await fn();}catch(error){showError(error);}finally{working(false);}}
  function syncLocation(){if(state.preview||!state.detail)return;const params=new URLSearchParams({task:state.detail.taskId,tab:state.tab});if(run())params.set('run',run().id);history.replaceState(null,'','#'+params.toString());}
  function markDirty(){state.dirty=true;const pill=$('#unsaved');if(pill)pill.hidden=false;updateReviewControls();}
  function takeDetail(detail){state.detail=detail;state.draft=detail.run?clone(detail.run.draft):null;state.dirty=false;state.editIndex=-1;state.confirmed=false;state.sourceId=detail.run?.documents[0]?.id??null;render();syncLocation();}
  async function reloadTasks(){const result=await api('/api/tasks');state.tasks=result.tasks;renderTasks();}
  async function selectTask(id,version){
    if(state.dirty&&!window.confirm('Discard the unsaved draft changes before opening another version?'))return;
    const current=++requestId;clearError();notify('Loading work item…');
    try{const detail=await api('/api/tasks/'+encodeURIComponent(id)+(version?'?run='+encodeURIComponent(version):''));if(current!==requestId)return;takeDetail(detail);closeMenu();$('#live-status').hidden=true;}catch(error){if(current===requestId)showError(error);}
  }
  function selectTab(id,focus=false){state.tab=id;render();syncLocation();if(focus)$('#tab-'+id)?.focus();}
  function openNew(existing=false){
    if(state.preview){notify('Layout preview is read-only. Exit it to create a real work item.');return;}
    if(!state.token){notify('Waiting for the local project connection. Refresh if it does not connect.');return;}
    if(state.dirty&&!window.confirm('Continue with a new intake? Unsaved draft changes will be discarded when the new version opens.'))return;
    $('#task-form').reset();$('#upload-error').hidden=true;$('#task-dialog-title').textContent=existing?'Add an intake version':'New work item';
    if(existing&&state.detail){$('#task-id').value=state.detail.taskId;$('#task-goal').value=run()?.goal||'assess';}
    $('#task-dialog').showModal();$('#task-id').focus();
  }
  function closeMenu(){const restoreFocus=$('#sidebar').contains(document.activeElement)&&window.matchMedia('(max-width:760px)').matches;$('#sidebar').classList.remove('mobile-open');$('.app-shell').inert=false;$('#sidebar-scrim').hidden=true;$('#menu-toggle').setAttribute('aria-expanded','false');$('#menu-toggle').setAttribute('aria-label','Open work item navigation');if(restoreFocus)$('#menu-toggle').focus();}
  function empty(title,text,actionButton,symbol='◇'){return node('div',{class:'empty'},node('div',{class:'empty-symbol','aria-hidden':'true'},symbol),node('h2',{},title),node('p',{},text),actionButton);}
  function field(label,input,hint){const id='field-'+(++fieldId);input.id=id;return node('label',{class:'field',for:id},label,input,hint?node('small',{},hint):null);}
  function textField(label,value,onInput,options={}){return field(label,node('input',{type:'text',value,onInput:event=>onInput(event.target.value),...options}));}
  function checkbox(label,checked,onChange,options={}){return node('label',{class:'check-field'},node('input',{type:'checkbox',checked,onChange:event=>onChange(event.target.checked),...options}),node('span',{},label));}
  function notice(title,text,tone=''){return node('div',{class:'notice '+tone},node('strong',{},title),text);}

  function renderTasks(){
    if(state.preview)return;
    $('#task-count').textContent=state.tasks.length;
    $('#task-list').replaceChildren(...(state.tasks.length?state.tasks.map(task=>node('button',{type:'button',class:'task-button'+(state.detail?.taskId===task.id?' active':''),'aria-current':state.detail?.taskId===task.id?'page':undefined,onClick:()=>selectTask(task.id)},node('span',{class:'task-icon','aria-hidden':'true'},'▤'),node('span',{},node('strong',{},task.id),node('small',{},task.criteria+' criteria · '+(task.status==='accepted'?'requirements accepted':task.openQuestions?task.openQuestions+' open questions':task.status))))):[node('p',{class:'sidebar-empty'},'Your next ticket starts here.')]));
  }
  function renderHeader(){
    const header=$('#work-item-header');header.replaceChildren();
    if(!state.detail)return;
    const meta=node('div',{class:'heading-meta'},badge(run()?goal(run().goal):'No intake yet','outline'),run()?badge(run().accepted?'Requirements accepted':'Draft interpretation',run().accepted?'good':'warning'):null,node('span',{id:'unsaved',class:'pill warning',hidden:!state.dirty},'Unsaved changes'));
    if(state.detail.runs.length){
      const select=node('select',{'aria-label':'Intake version',onChange:event=>selectTask(state.detail.taskId,event.target.value)},...state.detail.runs.map(item=>node('option',{value:item.id,selected:item.id===run()?.id},date(item.createdAt))));
      meta.append(node('label',{class:'run-select'},'Intake version',select));
    }
    const actions=node('div',{class:'heading-actions'},button('Add documents',()=>openNew(true),'button secondary'),run()?download('Download matrix ↓',runUrl()+'/matrix.csv','button secondary'):null);
    header.append(node('div',{class:'page-heading'},node('div',{},node('div',{class:'breadcrumb'},'WORK ITEM / '+state.detail.taskId),node('h1',{},state.detail.taskId),node('p',{class:'muted'},'Requirements, source references and observed results in one place.'),meta),actions));
    if(run()?.stale)header.append(notice('The source material has changed',String(run().stale)+' Create a new intake version before editing or accepting this draft.','warning'));
    if(run()?.accepted)header.append(notice('This requirements version is accepted','The accepted interpretation is read-only. Add a new intake version for changes. Test and mutation results are reviewed separately.'));
  }
  function tabCount(id){return ({artifacts:run()?.documents.length,criteria:state.draft?.requirements.length,tests:state.detail?.reports.tests.length,mutations:state.detail?.reports.mutations.length})[id];}
  function renderTabs(){
    const bar=$('#tab-bar');bar.hidden=!state.detail;bar.replaceChildren();if(!state.detail)return;
    tabs.forEach(([id,title],index)=>bar.append(node('button',{type:'button',class:'tab',id:'tab-'+id,role:'tab','aria-selected':String(state.tab===id),'aria-controls':'view-panel',tabindex:state.tab===id?'0':'-1',onClick:()=>selectTab(id),onKeydown:event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();selectTab(tabs[next][0],true);}}},title,tabCount(id)!==undefined?node('small',{},tabCount(id)):null)));
    $('#view-panel').setAttribute('role','tabpanel');$('#view-panel').setAttribute('aria-labelledby','tab-'+state.tab);
  }
  function renderWelcome(){
    return node('div',{class:'crm-overview'},node('div',{class:'crm-welcome'},node('div',{},node('div',{class:'eyebrow'},'PLAYWRIGHT AGENT / PROJECT OVERVIEW'),node('h1',{},'Your testing work, in view.'),node('p',{},'Follow each work item from its source documents to reviewed requirements and recorded results.')),node('div',{class:'crm-welcome-actions'},button('New work item  ＋',()=>openNew(),'button primary'),button('Preview the layout',()=>setPreview(true),'button secondary'))),renderDashboard(null),node('div',{class:'crm-empty-next'},node('span',{class:'crm-next-icon','aria-hidden':'true'},'▤'),node('div',{},node('h2',{},'Start with one work item'),node('p',{},'Add the ticket and its source documents when you are ready. No criteria or execution outcomes are assumed.'))));
  }
  function svgNode(tag,attributes={},...children){const element=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attributes))element.setAttribute(key,String(value));for(const child of children)element.append(child instanceof Node?child:document.createTextNode(String(child)));return element;}
  function ring(groups,available,total,label){
    const titleId='chart-title-'+(++fieldId),circumference=2*Math.PI*55;
    const graphic=svgNode('svg',{viewBox:'0 0 150 150',class:'crm-ring',role:'img','aria-labelledby':titleId},svgNode('title',{id:titleId},available?label+': '+groups.map(group=>group.label+' '+group.value).join(', '):'No recorded '+label.toLowerCase()+' data'),svgNode('circle',{cx:75,cy:75,r:55,fill:'none',stroke:'#eaf0f3','stroke-width':16}));
    let offset=0;for(const [index,group]of groups.entries()){if(!available||!total||!group.value)continue;const length=circumference*group.value/total;graphic.append(svgNode('circle',{cx:75,cy:75,r:55,fill:'none',stroke:group.color||chartColors[index%chartColors.length],'stroke-width':16,'stroke-dasharray':length+' '+circumference,'stroke-dashoffset':-offset,transform:'rotate(-90 75 75)'}));offset+=length;}
    graphic.append(svgNode('text',{x:75,y:74,'text-anchor':'middle',class:'crm-ring-value'},available?total:'—'),svgNode('text',{x:75,y:94,'text-anchor':'middle',class:'crm-ring-label'},label));
    return graphic;
  }
  function legend(groups,available){return node('div',{class:'crm-legend'},...groups.map((group,index)=>node('div',{class:'crm-legend-row'},svgNode('svg',{width:8,height:8,viewBox:'0 0 8 8','aria-hidden':'true'},svgNode('circle',{cx:4,cy:4,r:4,fill:group.color||chartColors[index%chartColors.length]})),node('span',{},group.label),node('strong',{},available?group.value:'—'))));}
  function chartHeader(title,qualifier,preview=false){return node('div',{class:'crm-chart-heading'},node('div',{},node('h2',{},title),node('p',{},qualifier)),preview?badge('Illustrative','warning'):null);}
  function barChart(groups,available){const max=Math.max(1,...groups.map(group=>group.value||0));return node('div',{class:'crm-bars'},...groups.map((group,index)=>node('div',{class:'crm-bar-row'},node('div',{class:'crm-bar-label'},node('span',{},group.label),node('strong',{},available?group.value:'—')),svgNode('svg',{viewBox:'0 0 300 7',preserveAspectRatio:'none','aria-hidden':'true'},svgNode('rect',{width:300,height:7,rx:3.5,fill:'#eaf0f3'}),svgNode('rect',{width:available?300*(group.value||0)/max:0,height:7,rx:3.5,fill:group.color||chartColors[index%chartColors.length]})))));}
  function newest(reports){return reports.slice().sort((a,b)=>Date.parse(b.importedAt)-Date.parse(a.importedAt))[0]||null;}
  function renderDashboard(detail,{preview=false,draft=detail?.run?.draft}={}){
    const current=detail?.run,hasIntake=Boolean(current),requirements=draft?.requirements||[],documents=current?.documents||[],test=newest(detail?.reports.tests||[]),mutation=newest(detail?.reports.mutations||[]);
    const linked=requirements.filter(requirement=>requirement.sources.some(ref=>ref.quote?.trim())).length,questions=draft?.questions.filter(question=>!question.resolution?.trim()).length;
    const reportCount=hasIntake?detail.reports.tests.length+detail.reports.mutations.length:null;
    const kpis=[['Work items',preview?1:state.tasks.length,preview?'Fictional work item':'In this project'],['Requirements review',hasIntake?(current.accepted?'Accepted':current.reviewed?'Draft validated':'Needs review'):'—','Interpretation, not product acceptance'],['Open questions',hasIntake?questions:'—',hasIntake?'In this intake version':'Select a work item'],['Attached reports',reportCount??'—','Imported evidence, not re-execution']];
    const tiles=node('div',{class:'crm-kpis'},...kpis.map(([title,value,note],index)=>node('article',{class:'crm-kpi'},node('div',{class:'crm-kpi-top'},node('span',{},title),node('span',{class:'crm-kpi-icon','aria-hidden':'true'},['▤','✓','?','↗'][index])),node('strong',{class:typeof value==='string'&&value.length>4?'crm-kpi-word':''},value),node('p',{},note))));
    const stages=[['Documents',hasIntake?documents.length:null,'Original sources'],['Criteria',hasIntake?requirements.length:null,'Expected outcomes'],['Traceability',hasIntake?linked:null,'Criteria linked to sources'],['Test results',test?.counts.total??null,'Tests in latest report'],['Mutations',mutation?.counts.requested??null,'Faults in latest campaign']];
    const pipeline=node('section',{class:'crm-pipeline'},node('div',{class:'crm-pipeline-heading'},node('h2',{},'The evidence pipeline'),node('span',{},preview?'Fictional example':hasIntake?'Selected work item':'Select or create a work item')),node('div',{class:'crm-pipeline-stages'},...stages.map(([title,value,note],index)=>node('div',{class:'crm-stage'+(value!==null?' populated':'')},node('span',{class:'crm-stage-step'},String(index+1).padStart(2,'0')),node('div',{},node('h3',{},title),node('strong',{},value??'—'),node('p',{},note)),index<stages.length-1?node('span',{class:'crm-stage-arrow','aria-hidden':'true'},'→'):null))));
    const accepted=current?.accepted?requirements.length:0,missing=requirements.length-linked;
    const interpretation=[{label:'Accepted interpretation',value:accepted,color:'#128775'},{label:'Draft criteria',value:current?.accepted?0:linked,color:'#d4a14b'},{label:'Source quotation needed',value:current?.accepted?0:missing,color:'#8a9eac'}];
    const matrix=current?.matrix,assessmentMap=new Map();for(const row of matrix||[]){const value=row.Assessment?.trim()||'unknown';assessmentMap.set(value,(assessmentMap.get(value)||0)+1);}
    const assessmentColors=new Map([['supported','#128775'],['covered','#128775'],['partial','#d4a14b'],['missing','#bb6570'],['missing assertion','#bb6570'],['uncovered','#bb6570']]);
    const assessments=Array.from(assessmentMap,([label,value])=>({label,value,color:assessmentColors.get(label.toLowerCase())||'#8a9eac'}));
    const interpretationCard=node('section',{class:'crm-chart-card crm-interpretation-card'},chartHeader('Requirements & traceability','Review state and recorded assessment stay separate.',preview),node('div',{class:'crm-dual-charts'},node('div',{class:'crm-mini-chart'},node('h3',{},'Interpretation review'),node('div',{class:'crm-donut-layout'},ring(interpretation,hasIntake,requirements.length,'criteria'),legend(interpretation,hasIntake))),node('div',{class:'crm-mini-chart'},node('h3',{},'Recorded matrix labels'),node('div',{class:'crm-donut-layout'},ring(assessments,Boolean(matrix?.length),matrix?.length||0,'matrix rows'),assessments.length?legend(assessments,true):node('p',{class:'crm-chart-empty'},'No matrix assessments recorded.')))),node('p',{class:'crm-chart-foot'},'Matrix labels are recorded by the reviewer or coding agent. The workbench does not independently verify assertion coverage.'));
    const formats=new Map();for(const source of documents){const format=source.extraction.format.toUpperCase();formats.set(format,(formats.get(format)||0)+1);}
    const formatGroups=Array.from(formats,([label,value])=>({label,value}));
    const formatsCard=node('section',{class:'crm-chart-card'},chartHeader('Source format mix','Original documents in this intake.',preview),node('div',{class:'crm-format-ring'},ring(formatGroups,hasIntake,documents.length,'documents')),formatGroups.length?legend(formatGroups,true):node('p',{class:'crm-chart-empty'},'No source documents selected.'),hasIntake&&!preview?button('Inspect artifacts →',()=>selectTab('artifacts'),'button quiet small'):null);
    const testGroups=[{label:'Expected outcomes',value:test?.counts.expected,color:'#128775'},{label:'Unexpected outcomes',value:test?.counts.unexpected,color:'#bb6570'},{label:'Skipped',value:test?.counts.skipped,color:'#d4a14b'},{label:'Flaky',value:test?.counts.flaky,color:'#737dad'}];
    const testsCard=node('section',{class:'crm-chart-card'},chartHeader('Test outcomes',test?'Latest imported Playwright report':'No Playwright report attached',preview),node('div',{class:'crm-test-chart'},ring(testGroups,Boolean(test),test?.counts.total||0,'tests'),legend(testGroups,Boolean(test))),node('p',{class:'crm-chart-foot'},test?test.name:'Run your project tests, then attach the JSON report.'),node('p',{class:'crm-evidence-note'},'Imported counts. Task association and execution are not independently verified.'));
    const mutationGroups=[{label:'Killed',value:mutation?.counts.killed,color:'#128775'},{label:'Survived',value:mutation?.counts.survived,color:'#d4a14b'},{label:'Inconclusive',value:mutation?.counts.inconclusive,color:'#8a9eac'},{label:'Not activated',value:mutation?.counts.notActivated,color:'#699eb1'},{label:'Invalid',value:mutation?.counts.invalid,color:'#bb6570'},{label:'Not run',value:mutation?.counts.notRun,color:'#a9b6bf'}];
    const mutationCard=node('section',{class:'crm-chart-card'},chartHeader('Mutation outcomes',mutation?'Latest imported campaign · '+mutation.counts.requested+' requested faults':'No mutation campaign attached',preview),barChart(mutationGroups,Boolean(mutation)),node('p',{class:'crm-chart-foot'},mutation?mutation.name:'Fault outcomes stay unavailable until a report is attached.'));
    const activity=[];if(current)activity.push({title:'Intake captured',text:documents.length+' original documents in this version',at:current.createdAt,kind:'intake'});for(const report of detail?.reports.tests||[])activity.push({title:'Playwright report imported',text:report.name,at:report.importedAt,kind:'tests'});for(const report of detail?.reports.mutations||[])activity.push({title:'Mutation report imported',text:report.name,at:report.importedAt,kind:'mutation'});
    activity.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const activityCard=node('section',{class:'crm-chart-card'},chartHeader('Activity & provenance',preview?'Illustrative events':'Recorded intake and report imports',preview),activity.length?node('ol',{class:'crm-activity'},...activity.slice(0,5).map(item=>node('li',{},node('span',{class:'crm-activity-dot','aria-hidden':'true'}),node('div',{},node('h3',{},item.title),node('p',{},item.text),node('time',{datetime:item.at},date(item.at)))))):node('div',{class:'crm-chart-empty crm-activity-empty'},node('span',{'aria-hidden':'true'},'◷'),node('p',{},'No recorded activity yet. Your first intake will appear here.')));
    return node('div',{class:'crm-dashboard'},tiles,pipeline,node('div',{class:'crm-chart-grid'},interpretationCard,formatsCard,testsCard,mutationCard,activityCard));
  }
  function setPreview(value){state.preview=value;closeMenu();$('#error-banner').hidden=true;render();notify(value?'Illustrative layout preview opened. No project evidence was created.':'Returned to the live project workspace.');}
  function renderPreview(){
    document.body.classList.add('preview-mode');$('#project-name').textContent='Illustrative layout';$('#project-root').textContent='Fictional data in this browser view only.';$('#task-count').textContent='1 example';$('#new-task').disabled=true;$('#refresh').disabled=true;$('#preview-toggle').textContent='Exit preview';$('#preview-toggle').setAttribute('aria-pressed','true');$('.local-badge').replaceChildren(node('span',{class:'local-dot','aria-hidden':'true'}),'Layout preview');
    $('#task-list').replaceChildren(node('div',{class:'task-button active'},node('span',{class:'task-icon','aria-hidden':'true'},'▤'),node('span',{},node('strong',{},illustrativeDetail.taskId),node('small',{},'Fictional receiving workflow'))));
    $('#work-item-header').replaceChildren(node('div',{class:'preview-banner'},node('div',{},node('strong',{},'Illustrative layout preview — not project evidence'),node('p',{},'Fictional values show the layout. Upload, edit, import and acceptance actions are disabled.')),button('Exit preview',()=>setPreview(false),'button secondary small')),node('div',{class:'page-heading'},node('div',{},node('div',{class:'breadcrumb'},'FICTIONAL WORK ITEM / RECEIVING WORKFLOW'),node('h1',{},illustrativeDetail.taskId),node('p',{class:'muted'},'A client-only example of the CRM-style evidence overview.'))));
    $('#tab-bar').hidden=false;$('#tab-bar').replaceChildren(...tabs.map(([id,title])=>node('button',{type:'button',class:'tab',role:'tab','aria-selected':String(id==='overview'),disabled:id!=='overview',tabindex:id==='overview'?'0':'-1'},title)));
    $('#context-panel').hidden=true;$('#context-panel').replaceChildren();$('#workspace-grid').classList.add('no-context');$('#view-panel').removeAttribute('aria-labelledby');$('#view-panel').setAttribute('aria-label','Illustrative layout preview');$('#view-panel').replaceChildren(renderDashboard(illustrativeDetail,{preview:true}));
  }
  function renderContext(){
    const host=$('#context-panel'),show=Boolean(state.detail&&state.tab!=='overview');host.hidden=!show;host.replaceChildren();$('#workspace-grid').classList.toggle('no-context',!show);if(!show)return;
    const current=run(),source=sourceFor(state.sourceId);
    const card=node('section',{class:'context-card'},node('div',{class:'eyebrow'},'REVIEW CONTEXT'),node('h2',{},source?source.name:'This work item'));
    if(source){
      const rows=[['Format',source.extraction.format.toUpperCase()],['Size',bytes(source.bytes)],['Text segments',source.extraction.segments.length],['Selected sheet',source.extraction.selection?.sheet||'All available content']];
      card.append(...rows.map(([key,value])=>node('div',{class:'context-row'},node('span',{},key),node('strong',{},value))),download('Download original ↓',docUrl(source)),node('details',{class:'details'},node('summary',{},'Source fingerprint'),node('code',{class:'hash'},source.sha256)));
    }else{
      card.append(node('div',{class:'context-row'},node('span',{},'Documents'),node('strong',{},current?.documents.length??'Not supplied')),node('div',{class:'context-row'},node('span',{},'Unresolved questions'),node('strong',{},current?unresolved().length:'Not assessed')),node('div',{class:'context-row'},node('span',{},'Requirements'),node('strong',{},current?.accepted?'Accepted interpretation':'Awaiting review')));
    }
    if(current)card.append(node('dl',{},node('dt',{},'Intake recorded'),node('dd',{},date(current.createdAt)),node('dt',{},'Task intent'),node('dd',{},goal(current.goal))));
    host.append(card,node('section',{class:'context-card'},node('div',{class:'eyebrow'},'WHAT ACCEPTANCE MEANS HERE'),node('h2',{},'Keep the source in view'),node('p',{},'Accepting criteria records your review of the requirements interpretation. It does not mark the application or its tests as passed.')),node('div',{class:'context-note'},node('strong',{},'Continue in your coding agent'),'Use the task brief to inspect source, build a test matrix and make the requested test changes. Import the resulting reports here.'));
  }
  async function copyBrief(){try{await navigator.clipboard.writeText(run().brief);notify('Agent brief copied. Paste it into your coding agent in this project.');}catch{const details=$('#agent-brief');if(details){details.open=true;details.scrollIntoView({block:'center'});}notify('Clipboard access is unavailable. Select and copy the brief shown below.');}}
  function renderOverview(){
    const current=run();if(!current)return empty('Start with the task documents','This work item has no intake version yet. Add the ticket and source documents to prepare a review.',button('Add source documents',()=>openNew(true),'button primary'));
    const criteria=state.draft.requirements.length,questions=unresolved().length,blockers=current.blockingDocuments;
    let nextTitle,nextText,nextButton;
    if(blockers){nextTitle='Review the document issues';nextText='Some source content could not be read or needs a different export. Resolve the extraction blockers before accepting criteria.';nextButton=button('Inspect artifacts  →',()=>selectTab('artifacts'),'button secondary small');}
    else if(!criteria){nextTitle='Prepare a source-linked interpretation';nextText='Use the agent brief to review these documents in your coding agent, then add the criteria and exact source quotations here.';nextButton=button('Copy agent brief',copyBrief,'button secondary small');}
    else if(!current.accepted){nextTitle='Review the acceptance criteria';nextText='Check each expected outcome and source quotation. Resolve open questions, save the draft, then explicitly accept the interpretation.';nextButton=button('Review criteria  →',()=>selectTab('criteria'),'button secondary small');}
    else{nextTitle='Take a clear brief to your coding agent';nextText='Your requirements interpretation is recorded. Continue with source review, a test matrix and the requested test work in the selected project.';nextButton=button('Copy agent brief',copyBrief,'button secondary small');}
    const brief=node('section',{class:'panel'},node('div',{class:'panel-head'},node('div',{},node('h2',{},'Continue in your coding agent'),node('p',{},'Use the same project, task context and reviewed requirements.')),button('Copy brief',copyBrief,'button secondary small')),node('details',{class:'details',id:'agent-brief'},node('summary',{},'Read the task brief'),node('pre',{class:'brief'},current.brief)));
    return node('div',{},renderDashboard(state.detail,{draft:state.draft}),node('section',{class:'next-step'},node('div',{class:'eyebrow'},'YOUR NEXT STEP'),node('h2',{},nextTitle),node('p',{},nextText),nextButton),brief);
  }
  function renderMapping(source){
    const previous=run().mappings?.sources?.[source.name]||{},inputs={};
    const details=node('details',{class:'details'},node('summary',{},'Map columns or select a worksheet'));
    const form=node('form',{},node('p',{class:'muted'},'Choose which fields contain the requirements. Reimport creates a new intake version and preserves the original file.'));
    inputs.sheet=node('input',{type:'text',value:previous.sheet??source.extraction.selection?.sheet??'',placeholder:'All worksheets'});
    form.append(field('Worksheet',inputs.sheet));
    const grid=node('div',{class:'mapping-grid'});
    for(const [key,label] of [['id','Criterion ID'],['criterion','Acceptance criterion'],['journey','Journey'],['critical','Critical flag'],['ticket','Ticket key'],['testId','Supplied test ID'],['status','Supplied test status']]){inputs[key]=node('input',{type:'text',value:previous.fields?.[key]||'',placeholder:key==='criterion'?'e.g. Acceptance Criteria':'Exact column or field name'});grid.append(field(label,inputs[key]));}
    inputs.defaultJourney=node('input',{type:'text',value:previous.defaultJourney||'',placeholder:'e.g. sign-in'});grid.append(field('Default journey',inputs.defaultJourney));form.append(grid,node('p',{class:'muted'},'Supplied RTM links are retained as document claims. They do not prove that the referenced tests exist or pass.'),node('div',{class:'mapping-actions'},node('button',{type:'submit',class:'button secondary small',disabled:state.busy},'Reimport with this mapping')));
    form.addEventListener('submit',event=>{event.preventDefault();if(state.dirty&&!window.confirm('Create a new intake version without the unsaved draft changes?'))return;action(async()=>{const fields={};for(const key of ['id','criterion','journey','critical','ticket','testId','status'])if(inputs[key].value.trim())fields[key]=inputs[key].value.trim();const mapping={fields};if(inputs.sheet.value.trim())mapping.sheet=inputs.sheet.value.trim();if(inputs.defaultJourney.value.trim())mapping.defaultJourney=inputs.defaultJourney.value.trim();takeDetail(await api(taskUrl('/reimport'),{method:'POST',body:{runId:run().id,mappings:{sources:{[source.name]:mapping}}}}));await reloadTasks();notify('A new intake version is ready for review.');});});
    details.append(form);return details;
  }
  function renderArtifacts(){
    if(!run())return empty('No source documents yet','Add the ticket and supporting documents to begin this work item.',button('Add documents',()=>openNew(true),'button primary'));
    const current=run(),selected=sourceFor(state.sourceId)||current.documents[0];
    const cards=current.documents.map(source=>node('article',{class:'source-card'+(selected?.id===source.id?' selected':'')},node('div',{class:'source-card-top'},node('span',{class:'file-mark'},source.extraction.format),node('div',{},node('h3',{},source.name),node('p',{class:'source-card-meta'},bytes(source.bytes)+' · '+source.extraction.segments.length+' extracted segments'+(source.extraction.selection?.sheet?' · '+source.extraction.selection.sheet:'')))),node('div',{class:'source-actions'},button(selected?.id===source.id?'Viewing text':'Inspect text',()=>{state.sourceId=source.id;render();},'button secondary small'),download('Original ↓',docUrl(source)),source.extraction.issues.some(issue=>issue.severity==='blocking')?badge('Extraction blocked','bad'):badge('Captured','outline')),source.extraction.issues.length?node('div',{class:'source-issues'},...source.extraction.issues.map(issue=>node('div',{class:'source-issue '+issue.severity},node('strong',{},issue.severity==='blocking'?'Needs action':'Review'),issue.message))):null,selected?.id===source.id?renderMapping(source):null));
    const preview=selected?node('section',{class:'panel source-text-panel'},node('div',{class:'panel-head'},node('div',{},node('h2',{},'Extracted source text'),node('p',{},selected.name+' · Recorded snapshot for this intake version'))),node('div',{class:'source-preview'},...(selected.extraction.segments.length?selected.extraction.segments.map(segment=>node('section',{class:'segment',id:'source-segment-'+segment.id,tabindex:'-1'},node('div',{class:'segment-label'},locator(segment.locator)),node('pre',{},segment.text||'No readable text in this segment.'))):[node('p',{class:'muted'},'No text was extracted. Review the document issues above.')]))) : null;
    return node('div',{},node('div',{class:'section-title'},node('div',{},node('h2',{},'The original context'),node('p',{},'Inspect extraction issues and keep each criterion linked to its source.'))),node('div',{class:'stack'},...cards),preview);
  }
  function reference(ref,index,requirement,editable){
    const source=sourceFor(ref.sourceId),segment=segmentFor(ref);
    return node('div',{class:'source-reference'},node('div',{class:'reference-head'},node('span',{},(source?.name||'Unknown source')+' · '+locator(segment?.locator)),node('span',{},button('Open source',()=>{state.sourceId=ref.sourceId;selectTab('artifacts');const target=document.getElementById('source-segment-'+ref.segmentId);if(target){target.focus();target.scrollIntoView({block:'center'});}},'button quiet small',!source),editable?button('Remove',()=>{requirement.sources.splice(index,1);markDirty();render();},'button quiet small'):null)),node('blockquote',{},ref.quote));
  }
  function renderReferencePicker(requirement){
    let source=sourceFor(state.sourceId)||run().documents[0],segment=source?.extraction.segments[0];
    const sourceSelect=node('select',{},...run().documents.map(doc=>node('option',{value:doc.id,selected:source?.id===doc.id},doc.name)));
    const segmentSelect=node('select'),excerpt=node('pre',{class:'source-excerpt'}),quote=node('textarea',{rows:'3',maxlength:'20000',placeholder:'Paste an exact quotation from the selected source segment.'});
    const add=button('Link this quotation',()=>{const value=quote.value;if(!source||!segment||!value||value.length>20000||!segment.text.includes(value)){notify('Use an exact source quotation of at most 20,000 characters.');return;}requirement.sources.push({sourceId:source.id,segmentId:segment.id,quote:value});state.sourceId=source.id;markDirty();render();},'button secondary small',true);
    const update=()=>{source=sourceFor(sourceSelect.value);segmentSelect.replaceChildren(...(source?.extraction.segments||[]).map(item=>node('option',{value:item.id},locator(item.locator))));segment=source?.extraction.segments[0];showSegment();};
    const showSegment=()=>{segment=source?.extraction.segments.find(item=>item.id===segmentSelect.value);excerpt.textContent=segment?.text||'This segment has no readable text.';quote.value='';add.disabled=true;};
    sourceSelect.addEventListener('change',update);segmentSelect.addEventListener('change',showSegment);quote.addEventListener('input',()=>{add.disabled=!quote.value||!segment?.text.includes(quote.value);});update();
    return node('div',{class:'reference-controls'},node('h3',{},'Link a source quotation'),field('Source document',sourceSelect),field('Source location',segmentSelect),excerpt,field('Exact quotation',quote,'Use the original wording. The workbench checks that the quotation occurs in this segment.'),button('Use this segment’s text',()=>{if((segment?.text.length||0)>20000){notify('Select a shorter exact quotation from this long segment.');return;}quote.value=segment?.text||'';add.disabled=!quote.value;},'button quiet small'),add);
  }
  function renderCriterion(requirement,index){
    const editable=!readonly(),editing=state.editIndex===index;
    const summary=node('div',{class:'criterion-summary'},node('div',{class:'criterion-top'},node('div',{},node('span',{class:'criterion-id'},requirement.id||'NEW CRITERION'),badge(requirement.journey||'Journey needed','outline'),requirement.critical?badge('Critical','warning'):null),editable?button(editing?'Close editor':'Edit',()=>{state.editIndex=editing?-1:index;if(requirement.sources[0])state.sourceId=requirement.sources[0].sourceId;render();},'button quiet small'):null),node('p',{class:'criterion-text'},requirement.criterion||'Describe one testable expected outcome.'),node('div',{class:'criterion-bottom'},node('span',{},requirement.sources.length+' source quotation'+(requirement.sources.length===1?'':'s')),node('span',{},'Coverage and execution: not assessed here'),requirement.suppliedLinks?.length?node('span',{},requirement.suppliedLinks.length+' supplied RTM link'+(requirement.suppliedLinks.length===1?'':'s')):null));
    const card=node('article',{class:'criteria-card'+(editing?' editing':'')},summary);
    if(editing&&editable){
      const change=(key,value)=>{requirement[key]=value;markDirty();};
      const editor=node('div',{class:'criterion-editor'},node('div',{class:'form-row'},textField('Criterion ID',requirement.id,value=>change('id',value),{required:true,maxlength:'80'}),textField('Journey',requirement.journey,value=>change('journey',value),{required:true,maxlength:'120'})),field('Expected outcome',node('textarea',{value:requirement.criterion,required:true,maxlength:'8000',onInput:event=>change('criterion',event.target.value)}),'Describe the required behavior, not the implementation or a test title.'),checkbox('Mandatory for the critical journey / smoke scope',requirement.critical,value=>change('critical',value)),node('h3',{},'Source evidence'),...requirement.sources.map((ref,refIndex)=>reference(ref,refIndex,requirement,true)),renderReferencePicker(requirement),node('div',{class:'editor-actions'},button('Remove criterion',()=>{state.draft.requirements.splice(index,1);state.editIndex=-1;markDirty();render();},'button quiet small'),button('Done editing',()=>{state.editIndex=-1;render();},'button secondary small')));
      card.append(editor);
    }else if(requirement.sources.length){const details=node('details',{class:'details criterion-reference-details'},node('summary',{},'Inspect source quotations'),...requirement.sources.map((ref,refIndex)=>reference(ref,refIndex,requirement,false)));if(requirement.suppliedLinks?.length)details.append(node('p',{class:'muted'},'Supplied RTM references: '+requirement.suppliedLinks.map(link=>link.testId+(link.status?' ('+link.status+')':'')).join(', ')+'. Not verified against code or execution.'));card.append(details);}
    return card;
  }
  async function saveDraft(){await action(async()=>{takeDetail(await api(taskUrl('/draft'),{method:'POST',body:{runId:run().id,draft:state.draft}}));await reloadTasks();notify('Draft saved and validated. Review the criteria and any remaining questions.');});}
  function updateReviewControls(){
    const accept=$('#accept-requirements'),save=$('#save-draft');
    if(save)save.disabled=state.busy||readonly();
    if(accept)accept.disabled=state.busy||readonly()||state.dirty||!run()?.reviewed||run().blockingDocuments>0||unresolved().length>0||!state.draft?.requirements.length||!state.reviewer.trim()||!state.confirmed;
  }
  function renderCriteria(){
    if(!run())return empty('No criteria to review yet','Add the task documents first. The criteria and their source references will appear here.',button('Add documents',()=>openNew(true),'button primary'));
    const current=run(),content=node('div',{},node('div',{class:'section-title'},node('div',{},node('h2',{},'Review the expected behavior'),node('p',{},'Each criterion needs a concrete outcome and an exact source quotation.')),!readonly()?button('＋ Add criterion',()=>{state.draft.requirements.push({id:'',criterion:'',journey:'',critical:false,sources:[]});state.editIndex=state.draft.requirements.length-1;markDirty();render();},'button secondary small'):null));
    if(current.blockingDocuments>0)content.append(notice('Document issues need attention','Unreadable or blocked source documents cannot be approved by typing a question resolution. Replace the document or select a usable source scope, then reimport.','warning'));
    if(!state.draft.requirements.length)content.append(empty('The interpretation needs your coding agent','Copy the task brief from Overview, review the documents in your coding agent, then add the source-linked criteria here. No criteria have been invented from these documents.',button('Copy agent brief',copyBrief,'button secondary')));
    content.append(...state.draft.requirements.map(renderCriterion));
    if(state.draft.questions.length){const questions=node('section',{class:'questions'},node('div',{class:'section-title'},node('div',{},node('h2',{},'Questions to resolve'),node('p',{},'Record the decision and its source. Do not guess at missing or conflicting requirements.'))));for(const question of state.draft.questions)questions.append(node('div',{class:'question'+(question.resolution?.trim()?' resolved':'')},node('h3',{},question.message),field('Resolution and evidence',node('textarea',{rows:'2',maxlength:'8000',value:question.resolution||'',readOnly:readonly(),onInput:event=>{if(event.target.value.trim())question.resolution=event.target.value;else delete question.resolution;markDirty();}}))));content.append(questions);}
    if(!readonly())content.append(node('div',{class:'editor-actions'},node('span',{class:'muted save-explanation'},'Saving checks the draft. Acceptance records your explicit review.'),node('button',{type:'button',class:'button primary',id:'save-draft',onClick:saveDraft,disabled:state.busy},'Save & validate draft')));
    if(!current.accepted){
      const review=node('section',{class:'review-box'},node('h2',{},'Accept this requirements interpretation'),node('p',{},'After saving, review the exact criteria and source quotations. This records the requirements to use for test work; it does not establish that the product satisfies them.'),textField('Reviewed by',state.reviewer,value=>{state.reviewer=value;updateReviewControls();},{placeholder:'Your name',maxlength:'120',disabled:Boolean(current.stale)}),checkbox('I have reviewed every criterion and its source evidence. I approve this interpretation of the requirements.',state.confirmed,value=>{state.confirmed=value;updateReviewControls();},{disabled:Boolean(current.stale)}),checkbox('Replace an earlier accepted requirements version, if one exists.',state.replaceReviewed,value=>{state.replaceReviewed=value;},{disabled:Boolean(current.stale)}),node('button',{type:'button',id:'accept-requirements',class:'button primary',disabled:true,onClick:()=>action(async()=>{takeDetail(await api(taskUrl('/accept'),{method:'POST',body:{runId:current.id,reviewHash:current.draftHash,reviewedBy:state.reviewer.trim(),confirmReviewed:true,replaceReviewed:state.replaceReviewed}}));await reloadTasks();notify('The reviewed requirements interpretation has been accepted.');})},'Accept reviewed criteria'));
      content.append(review);
    }
    return content;
  }
  function renderTraceability(){
    if(!run()||!(run().matrix?.length||state.draft.requirements.length))return empty('Traceability starts with a reviewed interpretation','Add criteria and link each one to the source document and quotation. Imported RTM references remain unverified until source and execution are reviewed.');
    const records=run().matrix??state.draft.requirements.map(requirement=>({'Requirement ID':requirement.id,Criterion:requirement.criterion,Journey:requirement.journey,Assessment:'unknown',Runtime:'not run','Source refs':requirement.sources.map(ref=>ref.quote).join('\n'),'Supplied test IDs (historical)':requirement.suppliedLinks?.map(link=>link.testId).join('\n')||''}));
    const table=node('table',{},node('thead',{},node('tr',{},...['Criterion','Scenario / state','Test / assertion','Recorded assessment','Source / supplied links'].map(label=>node('th',{scope:'col'},label)))),node('tbody',{},...records.map(record=>node('tr',{},node('td',{},node('strong',{},record['Requirement ID']||'ID not recorded'),node('p',{class:'muted'},record.Criterion||'Criterion not recorded')),node('td',{},record.Scenario||'Scenario not recorded',node('p',{class:'muted'},'Journey: '+(record.Journey||'Not recorded')),node('p',{class:'muted'},'Role: '+(record.Role||'Not recorded')+' · State: '+(record.State||'Not recorded'))),node('td',{},node('strong',{},record.Test||'Test not recorded'),node('p',{class:'muted'},record.Assertion||'Assertion not recorded')),node('td',{},badge(record.Assessment||'unknown','outline'),node('p',{class:'muted'},'Runtime: '+(record.Runtime||'not run'))),node('td',{},node('details',{class:'details'},node('summary',{},'Source references'),node('pre',{class:'source-quote'},record['Source refs']||'No source references recorded')),node('p',{class:'muted'},'Supplied test IDs: '+(record['Supplied test IDs (historical)']||'None')),record['Supplied statuses (historical)']?node('p',{class:'muted'},'Supplied statuses: '+record['Supplied statuses (historical)']):null)))));
    return node('div',{},node('div',{class:'section-title'},node('div',{},node('h2',{},'From requirement to observed evidence'),node('p',{},'The recorded task matrix can be completed by your coding agent after source and execution review.')),download('Matrix CSV ↓',runUrl()+'/matrix.csv')),notice('Recorded matrix evidence','These are the values in this intake version’s matrix.csv. The workbench does not independently verify coverage or execution. Attached reports remain separate evidence.'),state.dirty?notice('Unsaved criteria changes','The recorded matrix reflects the last saved criteria. Save and review the draft before continuing.','warning'):null,node('div',{class:'table-wrap'},table));
  }
  function reportImport(kind){
    const input=node('input',{type:'file',accept:'.json',required:true,id:'report-upload-'+kind}),form=node('form',{class:'report-import'},node('label',{for:input.id},kind==='playwright'?'Add a Playwright JSON report':'Add a mutation campaign JSON'),input,node('button',{type:'submit',class:'button secondary small',disabled:state.busy},'Import report'));
    form.addEventListener('submit',event=>{event.preventDefault();if(!input.files?.[0])return;action(async()=>{const edits=state.dirty?{draft:state.draft,index:state.editIndex}:null,selectedRun=run()?.id;const body=new FormData();body.set('kind',kind);body.set('file',input.files[0]);let detail=await api(taskUrl('/reports'),{method:'POST',body});if(selectedRun&&detail.run?.id!==selectedRun)detail=await api(taskUrl()+'?run='+encodeURIComponent(selectedRun));takeDetail(detail);if(edits){state.draft=edits.draft;state.editIndex=edits.index;state.dirty=true;render();}await reloadTasks();notify('Report imported. Its recorded results are available below.');});});return form;
  }
  function reportHeader(report){return node('div',{},node('div',{class:'panel-head report-heading'},node('div',{},node('h2',{},report.name),node('div',{class:'report-meta'},'Run time: '+date(report.recordedAt)+' · Imported '+date(report.importedAt))),download('Original JSON ↓',taskUrl('/reports/'+encodeURIComponent(report.id)))));}
  function reportLimits(report){return node('div',{class:'report-foot'},node('p',{},'Imported evidence. The workbench did not execute these tests or independently verify association with this work item.'),report.limitations?.length?node('details',{class:'details'},node('summary',{},'Report limitations'),node('ul',{},...report.limitations.map(limit=>node('li',{},limit)))):null);}
  function renderTestReports(){
    const reports=state.detail.reports.tests,content=node('div',{},node('div',{class:'section-title'},node('div',{},node('h2',{},'Playwright execution evidence'),node('p',{},'Inspect the outcomes recorded in an imported report. Importing does not run tests.'))),reportImport('playwright'));
    if(!reports.length)content.append(empty('No test execution report attached','Run the selected Playwright tests in your project with the coding agent or your existing command, then import the JSON report. No execution outcome is assumed.'));
    for(const report of reports){const card=node('article',{class:'report-card'},reportHeader(report),node('div',{class:'report-stats'},...[[report.counts.expected,'Expected outcomes'],[report.counts.unexpected,'Unexpected outcomes'],[report.counts.skipped,'Skipped'],[report.counts.flaky,'Flaky'],[report.counts.total,'Total tests']].map(([value,label])=>node('div',{class:'report-stat'},node('small',{},label),node('strong',{},value)))));
      const table=node('table',{},node('thead',{},node('tr',{},...['Test','Project','Recorded outcome','Duration'].map(label=>node('th',{scope:'col'},label)))),node('tbody',{},...report.tests.map(test=>node('tr',{},node('td',{},node('strong',{},test.title),test.errors.length?node('details',{class:'details'},node('summary',{},'Recorded errors'),node('pre',{class:'report-errors'},test.errors.join('\n\n'))):null),node('td',{},test.project||'Not recorded'),node('td',{},badge(test.status,'status-'+test.status.replace(/[^a-z-]/gi,''))),node('td',{},test.durationMs===null?'Unavailable':test.durationMs.toLocaleString()+' ms')))));
      card.append(node('div',{class:'table-wrap'},table),reportLimits(report));content.append(card);
    }return content;
  }
  function renderMutationReports(){
    const reports=state.detail.reports.mutations,content=node('div',{},node('div',{class:'section-title'},node('div',{},node('h2',{},'Behavioral mutation evidence'),node('p',{},'Keep fault activation, repeated outcomes and restoration visible.'))),reportImport('mutation'));
    if(!reports.length)content.append(empty('No mutation campaign attached','Run an explicitly configured mutation check in your project, then import its campaign JSON. Missing evidence remains not run.'));
    for(const report of reports){const card=node('article',{class:'report-card'},reportHeader(report),node('div',{class:'report-stats'},...[[report.counts.requested,'Requested faults'],[report.counts.killed,'Killed'],[report.counts.survived,'Survived'],[report.counts.inconclusive,'Inconclusive'],[report.counts.notActivated,'Not activated'],[report.counts.invalid,'Invalid'],[report.counts.notRun,'Not run']].map(([value,label])=>node('div',{class:'report-stat'},node('small',{},label),node('strong',{},value)))),node('p',{class:'muted campaign-summary'},'Baselines: '+(report.baselines.map((baseline,index)=>`${index+1}: ${baseline.status} (${baseline.tests} tests)`).join(' · ')||'Not recorded')+' · Restored: '+(report.restored||'Not recorded')+' · Original source unchanged: '+(report.originalUnchanged?'reported yes':'not established')));
      const table=node('table',{},node('thead',{},node('tr',{},...['Fault / criterion','Outcome','Independent observation','Assertion evidence'].map(label=>node('th',{scope:'col'},label)))),node('tbody',{},...report.faults.map(fault=>node('tr',{},node('td',{},node('strong',{},fault.id),node('p',{class:'muted'},fault.requirementId)),node('td',{},badge(fault.status,'status-'+fault.status.replace(/[^a-z-]/gi,'')),fault.reason?node('p',{class:'muted'},fault.reason):null),node('td',{},'Baseline: '+(fault.baselineProbe??'Not recorded'),node('br'),'Mutant: '+(fault.mutantProbe??'Not recorded')),node('td',{},fault.killingTests.length?fault.killingTests.join('\n'):'No killing assertion recorded')))));
      card.append(node('div',{class:'table-wrap'},table),reportLimits(report));content.append(card);
    }return content;
  }
  function render(){
    if(state.preview){renderPreview();return;}
    document.body.classList.remove('preview-mode');$('#new-task').disabled=!state.token;$('#refresh').disabled=false;$('#view-panel').setAttribute('aria-label','Work item content');$('#preview-toggle').textContent='Layout preview';$('#preview-toggle').setAttribute('aria-pressed','false');$('.local-badge').replaceChildren(node('span',{class:'local-dot','aria-hidden':'true'}),'Project local');
    if(state.project){$('#project-name').textContent=state.project.name;$('#project-root').textContent=state.project.root;}
    renderTasks();renderHeader();renderTabs();renderContext();
    const panel=$('#view-panel');
    if(!state.detail){panel.removeAttribute('role');panel.removeAttribute('aria-labelledby');panel.replaceChildren(renderWelcome());return;}
    const renderer={overview:renderOverview,artifacts:renderArtifacts,criteria:renderCriteria,traceability:renderTraceability,tests:renderTestReports,mutations:renderMutationReports};
    panel.replaceChildren((renderer[state.tab]||renderOverview)());updateReviewControls();
  }

  $('#new-task').addEventListener('click',()=>openNew());
  $('#preview-toggle').addEventListener('click',()=>setPreview(!state.preview));
  $('#close-dialog').addEventListener('click',()=>{if(!state.busy)$('#task-dialog').close();});
  $('#cancel-dialog').addEventListener('click',()=>{if(!state.busy)$('#task-dialog').close();});
  $('#task-dialog').addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
  $('#menu-toggle').addEventListener('click',()=>{const open=!$('#sidebar').classList.contains('mobile-open');if(!open){closeMenu();return;}$('#sidebar').classList.add('mobile-open');$('.app-shell').inert=true;$('#sidebar-scrim').hidden=false;$('#menu-toggle').setAttribute('aria-expanded','true');$('#menu-toggle').setAttribute('aria-label','Close work item navigation');$('#nav-close').focus();});
  $('#nav-close').addEventListener('click',closeMenu);
  $('#sidebar-scrim').addEventListener('click',closeMenu);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
  window.addEventListener('resize',()=>{if(!window.matchMedia('(max-width:760px)').matches)closeMenu();});
  $('#refresh').addEventListener('click',()=>action(async()=>{if(!state.token){await start();return;}await reloadTasks();if(state.detail)await selectTask(state.detail.taskId,run()?.id);else render();notify('Work items refreshed.');}));
  $('#task-form').addEventListener('submit',async event=>{
    event.preventDefault();if(state.busy)return;const form=event.currentTarget;if(!form.reportValidity())return;
    $('#upload-error').hidden=true;working(true);clearError();
    try{const body=new FormData(form);if(!String(body.get('sheet')||'').trim())body.delete('sheet');const result=await api('/api/tasks',{method:'POST',body});$('#task-dialog').close();await reloadTasks();state.dirty=false;await selectTask(result.taskId,result.runId);state.tab='overview';render();syncLocation();notify('Documents captured. Your intake is ready for review.');}
    catch(error){$('#upload-error').textContent=error instanceof Error?error.message:'The documents could not be imported.';$('#upload-error').hidden=false;}
    finally{working(false);}
  });
  window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
  async function start(){
    render();try{const session=await api('/api/session');state.project=session.project;state.token=session.token;$('#new-task').disabled=false;$('#project-name').textContent=session.project.name;$('#project-root').textContent=session.project.root;await reloadTasks();const params=new URLSearchParams(location.hash.slice(1));const selected=params.get('task');if(tabs.some(([id])=>id===params.get('tab')))state.tab=params.get('tab');if(selected)await selectTask(selected,params.get('run'));else render();}catch(error){$('#project-name').textContent='Connection unavailable';showError(error);$('#task-list').replaceChildren(node('p',{class:'sidebar-empty'},'Check that the local workbench is running, then refresh.'));}
  }
  start();
})();
