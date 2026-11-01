'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const tabs = [['overview','Overview'],['artifacts','Artifacts'],['criteria','Acceptance criteria'],['traceability','Traceability'],['tests','Test reports'],['mutations','Mutation reports']];
  const state = {project:null,token:null,tasks:[],detail:null,draft:null,tab:'overview',sourceId:null,editIndex:-1,dirty:false,busy:false,reviewer:'',confirmed:false,replaceReviewed:false,preview:false};
  let fieldId=0,requestId=0,toastTimer,insight=null;
  const execution={capabilities:null,capabilityError:null,jobs:[],taskId:null,loading:false,error:null,pending:false,poll:null,generation:0,modal:null,refreshing:false};
  const chartColors=['#128775','#d4a14b','#8a9eac','#737dad','#b86572','#699eb1','#a9805a'];
  // Deliberately separate from the live task/draft state. Nothing here is sent to an API.
  const illustrativeDetail={taskId:'RECEIVING-482',run:{id:'illustration',createdAt:'2030-04-18T09:15:00Z',goal:'assess',accepted:false,reviewed:true,blockingDocuments:0,documents:[{name:'receiving-notes.md',extraction:{format:'md'}},{name:'example-criteria.json',extraction:{format:'json'}},{name:'example-links.csv',extraction:{format:'csv'}}],draft:{requirements:Array.from({length:5},(_,index)=>({id:'EXAMPLE-'+(index+1),sources:[{sourceId:'illustrative-source',segmentId:'example-segment',quote:'Fictional source quotation.'}]})),questions:[{id:'example-question-1'},{id:'example-question-2'}]},matrix:[{Assessment:'supported'},{Assessment:'supported'},{Assessment:'partial'},{Assessment:'unknown'},{Assessment:'unknown'}]},reports:{tests:[{name:'illustrative-playwright-report.json',importedAt:'2030-04-18T09:32:00Z',counts:{expected:10,unexpected:1,skipped:1,flaky:0,total:12}}],mutations:[{name:'illustrative-mutation-report.json',importedAt:'2030-04-18T09:40:00Z',counts:{requested:4,killed:2,survived:1,inconclusive:1,notActivated:0,invalid:0,notRun:0}}]}};
  const fictionalCriteria=['A receiving operator can confirm a delivery after scanning its unique label.','A duplicate delivery label must show a visible validation message.','Received quantities must retain the recorded decimal precision.','A supervisor can review a receiving exception before completing it.','A failed receiving request must leave a visible retry action.'];
  illustrativeDetail.run.documents.forEach((source,index)=>{source.id='illustrative-source-'+index;source.bytes=null;source.extraction.issues=[];source.extraction.segments=[{id:'example-segment-'+index,text:fictionalCriteria.join('\n'),locator:index===2?{row:2,cells:'A2:D2'}:{line:1,section:'Fictional receiving requirements'}}];});
  illustrativeDetail.run.draft.requirements.forEach((requirement,index)=>{Object.assign(requirement,{criterion:fictionalCriteria[index],journey:'receiving',critical:index<2,sources:[{sourceId:'illustrative-source-0',segmentId:'example-segment-0',quote:fictionalCriteria[index]}]});});
  illustrativeDetail.run.draft.questions=[{id:'example-question-1',message:'Fictional clarification: which roles may retry an exception?',sourceIds:['illustrative-source-0']},{id:'example-question-2',message:'Fictional clarification: which decimal precision is required?',sourceIds:['illustrative-source-2']}];
  illustrativeDetail.run.matrix=illustrativeDetail.run.matrix.map((row,index)=>({...row,'Requirement ID':'EXAMPLE-'+(index+1),Criterion:fictionalCriteria[index],Journey:'receiving',Scenario:'Fictional receiving scenario '+(index+1),Role:index===3?'supervisor':'receiving operator',State:'seeded example delivery',Test:index<3?'receiving.spec.ts / example '+(index+1):'',Assertion:index<2?'Recorded visible state assertion':index===2?'Quantity precision assertion remains incomplete':'',Runtime:index<3?'passed':'not run','Source refs':'receiving-notes.md / fictional source quotation','Supplied test IDs (historical)':'','Supplied statuses (historical)':''}));
  const exampleAttempts=(status,retry=0)=>({status,retry,durationMs:480+retry*170,errorCount:status==='failed'?1:0,errors:status==='failed'?['Illustrative assertion excerpt: the expected validation message was not visible.']:[]});
  const exampleTests=Array.from({length:10},(_,index)=>({title:index<2?'Receives a labelled delivery':'Fictional receiving check '+(index+1),project:index===1?'firefox':'chromium',file:'tests/receiving.spec.ts',line:12+index*9,column:3,status:'passed',outcome:'expected',expectedStatus:'passed',durationMs:480,errors:[],errorCount:0,attempts:[exampleAttempts('passed')]}));
  exampleTests.push({title:'Rejects a duplicate delivery label',project:'chromium',file:'tests/receiving-validation.spec.ts',line:44,column:3,status:'failed',outcome:'unexpected',expectedStatus:'passed',durationMs:1130,errors:['Illustrative first-attempt assertion excerpt.','Illustrative retry assertion excerpt.'],errorCount:2,attempts:[exampleAttempts('failed'),exampleAttempts('failed',1)]},{title:'Prints a partner receiving label',project:'chromium',file:'tests/receiving-labels.spec.ts',line:20,column:3,status:'skipped',outcome:'skipped',expectedStatus:'skipped',durationMs:null,errors:[],errorCount:0,attempts:[]});
  Object.assign(illustrativeDetail.reports.tests[0],{id:'illustrative-tests-latest',kind:'playwright',recordedAt:'2030-04-18T09:31:00Z',durationMs:9400,reportErrors:[],reportErrorCount:0,tests:exampleTests,limitations:['Fictional client-only illustration. No tests were executed or imported.']});
  illustrativeDetail.reports.tests.push({...illustrativeDetail.reports.tests[0],id:'illustrative-tests-earlier',name:'illustrative-earlier-check.json',recordedAt:'2030-04-18T09:26:00Z',importedAt:'2030-04-18T09:28:00Z',durationMs:2100,counts:{expected:30,unexpected:0,skipped:0,flaky:0,total:30},tests:Array.from({length:30},(_,index)=>({...exampleTests[index%10],title:'Fictional archived receiving check '+(index+1)}))});
  const exampleExecution=(status,failed=0)=>({status,errors:0,tests:6,passed:6-failed,failed,skipped:0,other:0,assertionFailures:failed,durationMs:2100});
  const exampleFaults=[['LABEL-LOCK-REMOVED','killed','1','0'],['RECEIPT-LIMIT-REMOVED','killed','blocked','enabled'],['QUANTITY-ROUNDING','survived','12.75','13'],['RECOVERY-TIMEOUT','inconclusive','retry visible','retry visible']].map(([id,status,baselineProbe,mutantProbe],index)=>({id,requirementId:'EXAMPLE-'+(index+1),criterion:fictionalCriteria[index],description:'Fictional controlled behavior change for this layout preview.',status,baselineProbe,mutantProbe,reason:status==='inconclusive'?'The fictional observations do not establish activation.':undefined,killingTests:status==='killed'?['chromium › fictional receiving assertion']:[],killingTestCount:status==='killed'?1:0,attempts:[exampleExecution(status==='killed'?'failed':'passed',status==='killed'?1:0),exampleExecution(status==='killed'?'failed':'passed',status==='killed'?1:0)]}));
  Object.assign(illustrativeDetail.reports.mutations[0],{id:'illustrative-mutation-latest',kind:'mutation',runId:'fictional-campaign-482',recordedAt:'2030-04-18T09:38:00Z',baselines:[exampleExecution('passed'),exampleExecution('passed')],restored:'passed',restoration:exampleExecution('passed'),originalUnchanged:true,faults:exampleFaults,limitations:['Fictional client-only illustration. No mutation campaign was executed or imported.']});
  exampleFaults[3].reason='Fictional probe unavailable; activation is not established.';delete exampleFaults[3].mutantProbe;exampleFaults[3].attempts=[];
  illustrativeDetail.run.analysis={text:'Fictional proposal: review duplicate-label handling and quantity precision, then inspect the existing receiving assertions. Clarify role permissions before adding a retry scenario. This text demonstrates the recorded-analysis layout only.',recordedAt:'2030-04-18T09:20:00Z',intakeHash:'fictional-intake',draftHash:'fictional-draft',stale:false};

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
  function working(value){state.busy=value;document.body.setAttribute('aria-busy',String(value));$('#upload-submit').disabled=value;updateReviewControls();renderExecutionPanel();}
  async function action(fn){if(state.busy)return;clearError();working(true);try{await fn();}catch(error){showError(error);}finally{working(false);}}
  function syncLocation(){if(state.preview||!state.detail)return;const params=new URLSearchParams({task:state.detail.taskId,tab:state.tab});if(run())params.set('run',run().id);history.replaceState(null,'','#'+params.toString());}
  function markDirty(){state.dirty=true;const pill=$('#unsaved');if(pill)pill.hidden=false;updateReviewControls();renderExecutionPanel();}
  function takeDetail(detail){state.detail=detail;state.draft=detail.run?clone(detail.run.draft):null;state.dirty=false;state.editIndex=-1;state.confirmed=false;state.sourceId=detail.run?.documents[0]?.id??null;render();syncLocation();loadExecution(detail.taskId);}
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

  const executionLabel=kind=>kind==='mutation'?'Mutations':'Playwright';
  const jobStatus=value=>({running:'Running',completed:'Completed',failed:'Failed',cancelled:'Cancelled',timed_out:'Timed out',interrupted:'Interrupted'}[value]||value||'Unavailable');
  const jobTone=value=>value==='completed'?'good':value==='running'?'outline':value==='failed'?'danger':'warning';
  const executionUrl=(taskId,suffix='')=>'/api/tasks/'+encodeURIComponent(taskId)+'/executions'+suffix;
  const executionAction=kind=>execution.capabilities?.actions?.find(item=>item.kind===kind);
  const runningJob=()=>execution.jobs.find(job=>job.status==='running');
  function executionReason(kind){
    if(state.preview)return 'Illustrative preview is read-only. Exit preview to run the registered project scope.';
    if(!run())return 'Select a work item with a saved intake version.';
    if(state.dirty)return 'Save and validate the unsaved criteria before running this intake.';
    if(run().stale)return 'The source material has changed. Prepare a current intake version first.';
    if(execution.pending)return 'An execution request is being processed.';
    if(state.busy)return 'Wait for the current workbench request to finish.';
    if(execution.loading)return 'Loading registered execution capabilities…';
    if(execution.capabilityError)return 'Registered execution capabilities could not be loaded. Refresh to retry.';
    if(execution.error)return 'Execution history could not be loaded. Refresh before starting a run.';
    const selected=executionAction(kind);
    if(!execution.capabilities?.enabled)return selected?.reason||execution.capabilities?.reason||'Execution is not configured for this workbench session.';
    if(runningJob()||execution.capabilities?.activeJobId)return 'A registered execution is already active. Inspect it or wait for it to finish.';
    if(!selected?.available||!selected.actionHash)return selected?.reason||execution.capabilities?.reason||'This action has no registered configuration.';
    return '';
  }
  function scopeList(preview){return node('ul',{class:'execution-scope-list'},...(preview?.length?preview:['No execution scope was supplied.']).map(item=>node('li',{},String(item))));}
  function scheduleExecutionPoll(){
    clearTimeout(execution.poll);execution.poll=null;
    if(state.preview||!state.detail||!(runningJob()||execution.capabilities?.activeJobId))return;
    execution.poll=setTimeout(()=>loadExecution(state.detail.taskId,{background:true}),2500);
  }
  async function refreshExecutionEvidence(taskId,{announce=true}={}){
    const version=run()?.id;if(state.preview||state.detail?.taskId!==taskId)return;
    try{
      const detail=await api('/api/tasks/'+encodeURIComponent(taskId)+(version?'?run='+encodeURIComponent(version):''));
      if(state.preview||state.detail?.taskId!==taskId||run()?.id!==version)return;
      // A completed execution updates reports only. In-progress criterion edits stay intact.
      state.detail.reports=detail.reports;
      if(execution.modal?.mode==='job')renderExecutionDialog();
      const reportHost=$('#report-list');
      if(reportHost&&['tests','mutations'].includes(state.tab))renderReportCards(reportHost,state.tab);
      else if(state.tab==='overview')$('#view-panel').replaceChildren(renderOverview());
      await reloadTasks();
      if(announce)notify('Recorded reports refreshed. Unsaved criteria were retained.');
    }catch{notify('Execution finished. Reports could not be refreshed; use Refresh execution to retry.');}
  }
  async function loadExecution(taskId=state.detail?.taskId,{background=false}={}){
    if(state.preview)return;
    clearTimeout(execution.poll);execution.poll=null;
    if(background&&execution.refreshing){scheduleExecutionPoll();return;}
    const generation=++execution.generation,previous=execution.taskId===taskId?execution.jobs:[];
    execution.refreshing=true;
    if(execution.taskId!==taskId){execution.jobs=[];execution.taskId=taskId||null;execution.error=null;}
    if(!background){execution.loading=true;renderExecutionPanel();}
    const results=await Promise.allSettled([api('/api/execution'),taskId?api(executionUrl(taskId)):Promise.resolve({jobs:[]})]);
    if(generation!==execution.generation)return;
    execution.refreshing=false;execution.loading=false;
    if(state.preview||state.detail?.taskId!==taskId&&Boolean(taskId))return;
    execution.capabilityError=results[0].status==='rejected'?results[0].reason.message:null;
    if(results[0].status==='fulfilled')execution.capabilities=results[0].value;
    execution.error=results[1].status==='rejected'?results[1].reason.message:null;
    if(results[1].status==='fulfilled')execution.jobs=Array.isArray(results[1].value.jobs)?results[1].value.jobs:[];
    const finished=execution.jobs.some(job=>job.status!=='running'&&previous.some(old=>old.id===job.id&&old.status==='running'));
    renderExecutionPanel();updateExecutionDialog();scheduleExecutionPoll();
    if(finished)await refreshExecutionEvidence(taskId);
  }
  function illustrativeJobs(){return [{id:'fictional-execution-482',taskId:illustrativeDetail.taskId,runId:'illustration',kind:'playwright',status:'failed',createdAt:'2030-04-18T09:30:00Z',finishedAt:'2030-04-18T09:32:00Z',exitCode:1,reportId:'illustrative-tests-latest',logTail:'Illustrative execution log. No process was started.\nFictional example: one unexpected outcome; a valid report is still available.\nFor layout inspection only.',logTruncated:false,preview:['Fictional receiving project','Example Playwright configuration','Illustrative report destination'],intakeHash:'fictional-intake',draftHash:'fictional-draft',actionHash:'fictional-action'}];}
  function renderExecutionPanel(){
    const host=$('#execution-panel'),focused=host.contains(document.activeElement)?document.activeElement.id:null;host.hidden=!state.detail&&!state.preview;host.replaceChildren();if(host.hidden)return;
    const preview=state.preview,jobs=preview?illustrativeJobs():execution.jobs,active=jobs.find(job=>job.status==='running');
    const actions=node('div',{class:'execution-actions'});
    for(const kind of ['playwright','mutation']){
      const reason=executionReason(kind),control=button(kind==='playwright'?'Run Playwright':'Run mutations',()=>openExecution(kind),'button '+(kind==='playwright'?'primary':'secondary'),Boolean(reason));
      control.id='run-'+kind;control.setAttribute('aria-describedby','execution-action-'+kind+'-reason');
      actions.append(node('div',{class:'execution-action'},control,node('p',{id:'execution-action-'+kind+'-reason'},reason||(kind==='mutation'?'Review the fixed config and mutation plan before starting.':'Review the registered scope before starting.'))));
    }
    const refresh=button('Refresh execution',async()=>{const taskId=state.detail?.taskId;await loadExecution(taskId);if(taskId)await refreshExecutionEvidence(taskId);},'button quiet small',execution.loading||execution.pending);refresh.id='refresh-execution';
    host.append(node('div',{class:'execution-panel-heading'},node('div',{},node('div',{class:'eyebrow'},'EXECUTE THE REGISTERED SCOPE'),node('h2',{id:'execution-panel-title',tabindex:'-1'},'From prepared tests to recorded results'),node('p',{},'Your coding agent analyzes documents and writes or updates tests in chat. Run the configured project checks here.')),preview?badge('Illustrative · read-only','warning'):refresh),actions);
    if(!preview&&(execution.capabilityError||execution.error))host.append(notice('Execution information unavailable',execution.capabilityError||execution.error,'warning'));
    const scope=node('details',{class:'details execution-registered-scope'},node('summary',{},'Registered configuration & scope'));
    if(preview)scope.append(node('p',{class:'muted'},'Fictional scope for layout inspection. No actions can run.'));
    else if(execution.loading&&!execution.capabilities)scope.append(node('p',{class:'muted'},'Loading project registration…'));
    else if(!execution.capabilities?.actions?.length)scope.append(node('p',{class:'muted'},execution.capabilities?.reason||'No registered actions are available. Configure execution when launching the workbench from your coding agent.'));
    else for(const registered of execution.capabilities.actions)scope.append(node('div',{class:'execution-registered-action'},node('h3',{},registered.label||executionLabel(registered.kind)),scopeList(registered.preview),node('p',{class:'muted'},'Time limit: '+duration(registered.timeoutMs)),!registered.available?node('p',{class:'execution-disabled-reason'},registered.reason||'Not available in this session.'):null));
    host.append(scope);
    if(active)host.append(node('div',{class:'execution-active'},node('span',{class:'execution-running-dot','aria-hidden':'true'}),node('p',{},executionLabel(active.kind)+' is running · started '+date(active.createdAt)),button('View run / stop',()=>openJob(active),'button secondary small')));
    else if(!preview&&execution.capabilities?.activeJobId)host.append(node('p',{class:'execution-empty'},'Another registered job is active in this workbench. New runs are paused until it finishes.'));
    const recent=jobs.slice().sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,5);
    host.append(node('div',{class:'execution-history'},node('h3',{},preview?'Illustrative execution record':'Recent execution jobs'),recent.length?node('div',{class:'execution-job-list'},...recent.map(job=>node('button',{type:'button',id:'execution-job-'+job.id,class:'execution-job',onClick:()=>openJob(job,preview)},node('span',{},node('strong',{},executionLabel(job.kind)),node('small',{},date(job.createdAt)+(job.runId!==run()?.id&&!preview?' · another intake version':''))),badge(jobStatus(job.status),jobTone(job.status)),node('span',{class:'execution-job-link'},'Inspect →')))):node('p',{class:'execution-empty'},execution.loading?'Loading execution history…':'No portal execution jobs recorded for this work item. Imported reports remain available in their tabs.')));
    if(focused)document.getElementById(focused)?.focus();
  }
  async function openExecution(kind){
    const reason=executionReason(kind);if(reason){notify(reason);return;}
    const modal={mode:'confirm',kind,taskId:state.detail.taskId,runId:run().id,intakeHash:run().intakeHash,draftHash:run().draftHash,opener:document.activeElement,openerId:document.activeElement.id,reviewed:false,loading:true,error:null};execution.modal=modal;
    renderExecutionDialog();$('#execution-dialog').showModal();$('#close-execution').focus();
    try{const capabilities=await api('/api/execution');if(execution.modal!==modal)return;execution.capabilities=capabilities;modal.action=capabilities.actions?.find(item=>item.kind===kind);}
    catch(error){modal.error=error.message;}
    finally{if(execution.modal===modal){modal.loading=false;renderExecutionDialog();renderExecutionPanel();}}
  }
  function openJob(job,preview=false){
    execution.modal={mode:'job',job,preview,opener:document.activeElement,openerId:document.activeElement.id,cancelReview:false,error:null,taskId:job.taskId};
    renderExecutionDialog();$('#execution-dialog').showModal();$('#close-execution').focus();
    if(!preview)loadJob(job.id,job.taskId);
  }
  async function loadJob(id,taskId){
    const modal=execution.modal;
    try{const job=await api(executionUrl(taskId,'/'+encodeURIComponent(id)));if(execution.modal!==modal||modal?.mode!=='job')return;modal.job=job;updateExecutionDialog();}
    catch(error){if(execution.modal===modal){modal.error=error.message;renderExecutionDialog();}}
  }
  function confirmationReason(modal){
    if(modal.loading)return 'Refreshing the registered action…';
    if(modal.error)return modal.error;
    if(state.detail?.taskId!==modal.taskId||run()?.id!==modal.runId)return 'The selected intake has changed. Close and review the current version.';
    if(run().intakeHash!==modal.intakeHash||run().draftHash!==modal.draftHash)return 'The saved intake changed. Close and review the current scope again.';
    return executionReason(modal.kind);
  }
  async function startExecution(){
    const modal=execution.modal;if(!modal||modal.mode!=='confirm'||confirmationReason(modal)||execution.pending||modal.kind==='mutation'&&!modal.reviewed)return;
    execution.pending=true;renderExecutionPanel();renderExecutionDialog();
    try{
      const job=await api(executionUrl(modal.taskId),{method:'POST',body:{kind:modal.kind,runId:modal.runId,intakeHash:modal.intakeHash,draftHash:modal.draftHash,actionHash:modal.action?.actionHash,confirmRun:true}});
      execution.jobs=[job,...execution.jobs.filter(item=>item.id!==job.id)];execution.capabilities.activeJobId=job.status==='running'?job.id:null;
      if(execution.modal===modal){execution.modal={...modal,mode:'job',job,preview:false,cancelReview:false,error:null};renderExecutionDialog();$('#execution-job-heading')?.focus();}
      notify(executionLabel(job.kind)+' execution '+(job.status==='running'?'started.':jobStatus(job.status).toLowerCase()+'.')+' Test results do not establish acceptance coverage.');scheduleExecutionPoll();
      if(job.status!=='running')await refreshExecutionEvidence(modal.taskId);
    }catch(error){if(execution.modal===modal){modal.error=error.message;renderExecutionDialog();}else showError(error);}
    finally{execution.pending=false;renderExecutionPanel();renderExecutionDialog();}
  }
  async function cancelExecution(){
    const modal=execution.modal;if(!modal||modal.preview||modal.mode!=='job'||modal.job.status!=='running'||execution.pending)return;
    execution.pending=true;renderExecutionDialog();renderExecutionPanel();
    try{const job=await api(executionUrl(modal.job.taskId,'/'+encodeURIComponent(modal.job.id)+'/cancel'),{method:'POST',body:{confirmCancel:true}});execution.jobs=execution.jobs.map(item=>item.id===job.id?job:item);if(execution.modal===modal){modal.job=job;modal.cancelReview=false;modal.error=null;}notify('Stop requested. Inspect the final status and any restoration evidence.');await loadExecution(state.detail?.taskId,{background:true});}
    catch(error){if(execution.modal===modal)modal.error=error.message;else showError(error);}
    finally{execution.pending=false;renderExecutionDialog();renderExecutionPanel();}
  }
  function jobDialogContent(job,preview){
    const reportKind=job.kind==='mutation'?'mutations':'tests',detail=preview?illustrativeDetail:state.detail,report=detail?.reports[reportKind]?.find(item=>item.id===job.reportId);
    return node('div',{},node('div',{class:'execution-job-heading',id:'execution-job-heading',tabindex:'-1'},node('h3',{},executionLabel(job.kind)+' execution'),node('span',{id:'execution-job-status',role:'status','aria-live':'polite'},badge(jobStatus(job.status),jobTone(job.status)))),node('div',{id:'execution-job-facts'},jobFacts(job)),node('div',{id:'execution-job-error'},job.error?notice('Execution detail',job.error,'warning'):null),node('p',{class:'execution-evidence-note'},'Completed means the registered process exited successfully and a valid report was imported. It does not verify requirement coverage or approve the product.'),node('div',{id:'execution-job-report'},job.reportId?(report?button('Inspect '+executionLabel(job.kind)+' outcomes →',()=>{execution.modal.afterClose=()=>openInsight(reportKind,{reportId:job.reportId});$('#execution-dialog').close();},'button secondary'):node('p',{class:'execution-empty'},'A report was registered. Refresh execution to load its outcome details.')):node('p',{class:'execution-empty'},job.status==='running'?'Results will appear after the registered report is validated.':'No validated report was registered for this job.')),node('details',{class:'details execution-job-scope'},node('summary',{},'Recorded execution scope & intake binding'),scopeList(job.preview),detailFacts([['Intake version',job.runId],['Intake fingerprint',job.intakeHash],['Draft fingerprint',job.draftHash],['Action fingerprint',job.actionHash]])),node('section',{class:'execution-logs'},node('div',{class:'execution-log-heading'},node('h3',{},'Process log excerpt'),node('span',{id:'execution-log-note'},job.logTruncated?'Bounded tail · earlier output omitted':'Bounded process output')),node('pre',{id:'execution-log',tabindex:'0','aria-label':'Bounded execution log'},job.logTail||'No process output recorded.'),node('p',{},'Logs are a bounded process-output excerpt. Report outcomes and mutation restoration gates are separate evidence.')),node('div',{id:'execution-job-controls'},jobControls(job,preview)));
  }
  function jobFacts(job){return detailFacts([['Job ID',job.id],['Started',date(job.createdAt)],['Finished',job.finishedAt?date(job.finishedAt):job.status==='running'?'Still running':'Not recorded'],['Exit code',job.exitCode],['Report ID',job.reportId||'Not registered'],['Intake version',job.runId]]);}
  function jobControls(job,preview){
    const modal=execution.modal,controls=node('div',{class:'execution-stop-controls'});
    if(preview){controls.append(node('p',{class:'execution-empty'},'Illustrative execution record only. Run and stop actions are disabled.'),button('Stop run',()=>{},'button secondary',true));return controls;}
    if(job.status==='running'){
      if(modal.cancelReview)controls.append(node('p',{},'Stop this registered process? Partial output may remain. Cancellation does not establish restored-green mutation evidence.'),button('Keep running',()=>{modal.cancelReview=false;renderExecutionDialog();},'button secondary',execution.pending),button(execution.pending?'Requesting stop…':'Confirm stop',cancelExecution,'button stop-button',execution.pending));
      else controls.append(button('Stop run',()=>{modal.cancelReview=true;renderExecutionDialog();$('#confirm-stop-run')?.focus();},'button stop-button',execution.pending));
      if(modal.cancelReview)controls.querySelectorAll('button')[1].id='confirm-stop-run';
    }else controls.append(node('p',{class:'execution-empty'},'This job has ended. Review the status, exit code and registered report before deciding what to do next.'));
    return controls;
  }
  function renderExecutionDialog(){
    const modal=execution.modal;if(!modal)return;
    const host=$('#execution-dialog-content'),hadContentFocus=host.contains(document.activeElement),activeId=$('#execution-dialog').contains(document.activeElement)?document.activeElement.id:null;
    $('#execution-title').textContent=modal.mode==='confirm'?'Review '+executionLabel(modal.kind)+' execution':'Execution details';
    $('#execution-scope').textContent=modal.preview?'Illustrative layout preview — not project evidence. No process ran and no project data was changed.':'Registered local execution for '+modal.taskId+'. Tests are authored in your coding agent; this workbench runs only the configured scope.';
    $('#execution-dialog').classList.toggle('illustrative-insight',Boolean(modal.preview));
    if(modal.mode==='job')host.replaceChildren(...[modal.error?notice('Job detail could not be refreshed',modal.error,'warning'):null,jobDialogContent(modal.job,modal.preview)].filter(Boolean));
    else{
      const reason=confirmationReason(modal),registered=modal.action;
      host.replaceChildren(...[node('h3',{},'Registered configuration & '+(modal.kind==='mutation'?'mutation plan':'test scope')),scopeList(registered?.preview),detailFacts([['Work item',modal.taskId],['Intake version',modal.runId],['Time limit',duration(registered?.timeoutMs)]]),node('p',{class:'execution-evidence-note'},modal.kind==='mutation'?'Runs the registered mutation configuration and fixed plan. The campaign may create disposable copies and run repeated baselines, fault attempts and restoration checks. Inspect those gates in the resulting report.':'Runs the configured Playwright project scope against the saved intake version. This action does not create or edit test code.'),modal.kind==='mutation'?checkbox('I have reviewed the registered configuration and fixed mutation plan above.',modal.reviewed,value=>{modal.reviewed=value;const confirm=$('#confirm-execution');if(confirm)confirm.disabled=Boolean(confirmationReason(modal))||!value;},{disabled:execution.pending||modal.loading}):null,reason?notice(modal.loading?'Checking execution scope':'Execution is unavailable',reason,modal.loading?'':'warning'):null,node('div',{class:'execution-confirm-actions'},button('Cancel',()=>$('#execution-dialog').close(),'button secondary'),node('button',{type:'button',id:'confirm-execution',class:'button primary',disabled:Boolean(reason)||execution.pending||modal.kind==='mutation'&&!modal.reviewed,onClick:startExecution},execution.pending?'Starting…':'Confirm & run '+executionLabel(modal.kind)))].filter(Boolean));
    }
    if(activeId&&activeId!=='close-execution'){
      const target=document.getElementById(activeId);
      if(target&&!target.disabled)target.focus();else if(hadContentFocus)($('#execution-job-heading')||$('#execution-title')).focus();
    }
  }
  function updateExecutionDialog(){
    const modal=execution.modal;if(!modal||modal.preview)return;
    if(modal.mode!=='job'){renderExecutionDialog();return;}
    const job=execution.jobs.find(item=>item.id===modal.job.id);if(!job)return;
    if(modal.job.status!==job.status||modal.job.reportId!==job.reportId||modal.job.error!==job.error){modal.job=job;renderExecutionDialog();return;}
    modal.job=job;const log=$('#execution-log');if(log){const atEnd=log.scrollHeight-log.scrollTop-log.clientHeight<35;log.textContent=job.logTail||'No process output recorded.';if(atEnd)log.scrollTop=log.scrollHeight;}
    if($('#execution-log-note'))$('#execution-log-note').textContent=job.logTruncated?'Bounded tail · earlier output omitted':'Bounded process output';
  }
  function renderAgentAnalysis(detail,{preview=false}={}){
    const analysis=detail?.run?.analysis,content=node('section',{class:'panel agent-analysis'},node('div',{class:'panel-head'},node('div',{},node('div',{class:'eyebrow'},'CODING AGENT / RECORDED FINDINGS'),node('h2',{},'Document analysis'),node('p',{},'A saved proposal from your coding agent, separate from reviewed criteria.')),preview?badge('Illustrative','warning'):badge(analysis?'Recorded proposal':'Not recorded','outline')));
    if(!analysis)content.append(node('p',{class:'agent-analysis-empty'},'No coding-agent analysis is recorded for this intake. Ask your coding agent to inspect the task documents, save its findings, and open this work item. The portal does not invoke a model or invent criteria.'));
    else{
      content.append(node('p',{class:'agent-analysis-meta'},'Recorded '+date(analysis.recordedAt)+' · '+(analysis.stale?'Source or draft has changed since this proposal.':'Bound to the recorded intake and draft.')),analysis.stale?notice('This analysis is stale','Ask your coding agent to review the current documents and draft before relying on these findings.','warning'):null,node('pre',{class:'agent-analysis-text'},analysis.text),node('p',{class:'execution-evidence-note'},'An agent proposal is not human approval or evidence that acceptance criteria pass. Review exact source-linked criteria and execution evidence separately.'),node('details',{class:'details'},node('summary',{},'Analysis provenance'),detailFacts([['Intake fingerprint',analysis.intakeHash],['Draft fingerprint',analysis.draftHash]])));
    }
    return content;
  }

  const insightTitles={tests:'Test outcome insights',mutations:'Mutation outcome insights',criteria:'Requirements interpretation',traceability:'Traceability insights',artifacts:'Source document insights',activity:'Activity & provenance'};
  const outcomeName=value=>({expected:'Expected outcome',unexpected:'Unexpected outcome',flaky:'Flaky',skipped:'Skipped',killed:'Killed',survived:'Survived',inconclusive:'Inconclusive',not_activated:'Not activated',invalid_mutation:'Invalid mutation',not_run:'Not run',unknown:'Unknown / not projected'}[value]||value);
  const duration=value=>typeof value==='number'?value.toLocaleString()+' ms':'Unavailable';
  function insightReport(){const reports=insight?.detail?.reports[insight.kind==='tests'?'tests':'mutations']||[];return reports.find(report=>report.id===insight.reportId)||null;}
  function openInsight(kind,{reportId,filter='all'}={}){
    const dialog=$('#insight-dialog'),previousOpener=dialog.open?insight?.opener:document.activeElement;
    const detail=state.preview?illustrativeDetail:state.detail,collection=detail?.reports[kind==='tests'?'tests':'mutations']||[];
    insight={kind,detail,draft:state.preview?illustrativeDetail.run.draft:state.draft,preview:state.preview,reportId:reportId||newest(collection)?.id||null,filter,search:'',limit:25,openRows:new Set(),opener:previousOpener};
    $('#insight-title').textContent=insightTitles[kind];
    $('#insight-scope').textContent=insight.preview?'Illustrative layout preview — not project evidence. All details below are fictional and read-only.':'Recorded evidence for '+(detail?.taskId||'the selected work item')+'. This view does not execute tests, verify coverage or approve product behavior.';
    dialog.classList.toggle('illustrative-insight',insight.preview);renderInsightControls();renderInsightResults();if(!dialog.open)dialog.showModal();$('#close-insight').focus();
  }
  function renderInsightControls(){
    const host=$('#insight-controls');host.replaceChildren();if(!insight)return;
    const controls=node('div',{class:'insight-controls'}),reportKind=['tests','mutations'].includes(insight.kind);
    if(reportKind){
      const reports=insight.detail?.reports[insight.kind==='tests'?'tests':'mutations']||[];
      const select=node('select',{'aria-label':'Imported report',disabled:!reports.length,onChange:event=>{insight.reportId=event.target.value;insight.limit=25;insight.openRows.clear();renderInsightResults();}},...(reports.length?reports.slice().sort((a,b)=>Date.parse(b.importedAt)-Date.parse(a.importedAt)).map(report=>node('option',{value:report.id,selected:report.id===insight.reportId},report.name+' · imported '+date(report.importedAt))):[node('option',{},'No reports attached')]));
      controls.append(field('Imported report',select));
    }
    let options=[];
    if(insight.kind==='tests')options=[['expected','Expected outcomes'],['unexpected','Unexpected outcomes'],['skipped','Skipped'],['flaky','Flaky'],['unknown','Unknown / not projected']];
    if(insight.kind==='mutations')options=['killed','survived','inconclusive','not_activated','invalid_mutation','not_run'].map(value=>[value,outcomeName(value)]);
    if(insight.kind==='criteria')options=[['accepted','Accepted interpretation'],['draft','Draft criteria'],['missing','Source quotation needed'],['questions','Open questions']];
    if(insight.kind==='traceability')options=Array.from(new Set((insight.detail?.run?.matrix||[]).map(row=>row.Assessment?.trim()||'unknown'))).map(value=>[value,value]);
    if(insight.kind==='artifacts')options=Array.from(new Set((insight.detail?.run?.documents||[]).map(source=>source.extraction.format.toUpperCase()))).map(value=>[value,value]);
    if(options.length){const select=node('select',{'aria-label':reportKind?'Outcome filter':'Record filter',onChange:event=>{insight.filter=event.target.value;insight.limit=25;renderInsightResults();}},node('option',{value:'all',selected:insight.filter==='all'},'All '+(reportKind?'outcomes':'records')),...options.map(([value,label])=>node('option',{value,selected:insight.filter===value},label)));controls.append(field(reportKind?'Outcome filter':'Record filter',select));}
    const search=node('input',{type:'search','aria-label':'Search details',value:insight.search,placeholder:reportKind?'Test / fault, source, project, available errors…':'Search the selected evidence…',onInput:event=>{insight.search=event.target.value;insight.limit=25;renderInsightResults();}});
    controls.append(field('Search details',search));host.append(controls);
  }
  function insightMetadata(report){
    const base='/api/tasks/'+encodeURIComponent(insight.detail.taskId);
    return node('div',{class:'insight-provenance'},node('div',{},node('h3',{},report.name),node('p',{},'Recorded: '+date(report.recordedAt)),node('p',{},'Imported: '+date(report.importedAt)),node('p',{},'Report ID: '+report.id)),!insight.preview?download('Full imported JSON ↓',base+'/reports/'+encodeURIComponent(report.id)):badge('Fictional example','warning'));
  }
  function detailFacts(items){const list=node('dl',{class:'insight-facts'});for(const [name,value]of items){const display=value===null||value===undefined||typeof value==='string'&&!value.trim()?'Not recorded':typeof value==='boolean'?String(value):value;list.append(node('div',{},node('dt',{},name),node('dd',{},display)));}return list;}
  function errorExcerpts(title,errors,total){
    const values=Array.isArray(errors)?errors:[],count=typeof total==='number'?total:null;
    const content=node('section',{class:'insight-error-block'},node('h4',{},title+(count!==null?' · '+count+' recorded':'')));
    if(!values.length)content.append(node('p',{class:'muted'},count===0?'No errors recorded.':'No error excerpts were supplied in this projection.'));
    else content.append(...values.map((text,index)=>node('details',{class:'details insight-error'},node('summary',{},'Error excerpt '+(index+1)),node('pre',{},String(text).slice(0,4000)+(String(text).length>4000?'\n[Display excerpt limited to 4,000 characters.]':'')))));
    if(count!==null&&count>values.length)content.append(node('p',{class:'insight-caption'},'Showing '+values.length+' excerpts from '+count+' recorded errors. Inspect the imported JSON for the full recorded payload.'));
    return content;
  }
  function expandableRecord(title,meta,tag,key,body){
    const owner=insight,details=node('details',{class:'insight-record'}),holder=node('div',{class:'insight-record-body'});let built=false;
    const build=()=>{if(!built){holder.append(body());built=true;}};
    details.append(node('summary',{},node('span',{class:'insight-chevron','aria-hidden':'true'},'›'),node('span',{class:'insight-record-title'},node('strong',{},title),node('small',{},meta)),tag),holder);
    details.addEventListener('toggle',()=>{if(insight!==owner)return;if(details.open){insight.openRows.add(key);build();}else insight.openRows.delete(key);});
    if(insight.openRows.has(key)){details.open=true;build();}return details;
  }
  function executionSummary(execution,title){
    const section=node('section',{class:'insight-execution'},node('h4',{},title));
    if(!execution){section.append(node('p',{class:'muted'},'Detailed execution summary was not recorded.'));return section;}
    section.append(detailFacts([['Recorded status',execution.status],['Tests',execution.tests],['Passed',execution.passed],['Failed',execution.failed],['Skipped',execution.skipped],['Other outcomes',execution.other],['Execution errors',execution.errors],['Tests with assertion failures',execution.assertionFailures],['Execution wall time',duration(execution.durationMs)]]));return section;
  }
  function testInsightBody(test){
    const attempts=Array.isArray(test.attempts)?test.attempts:[],source=test.file?[test.file,test.line,test.column].filter(value=>value!==undefined).join(':'):'Not recorded';
    return node('div',{},detailFacts([['Project',test.project||'Not recorded'],['Source location',source],['Expected status',test.expectedStatus||'Not projected'],['Final recorded status',test.status],['Playwright outcome',outcomeName(test.outcome||'unknown')],['Test duration · sum of recorded attempts',duration(test.durationMs)],['Attempts projected',attempts.length]]),errorExcerpts('Test error excerpts',test.errors,test.errorCount),node('h4',{class:'insight-section-label'},'Recorded attempts & retries'),attempts.length?node('div',{class:'insight-attempts'},...attempts.map((attempt,index)=>node('section',{class:'insight-attempt'},node('h4',{},'Attempt '+(index+1)),detailFacts([['Retry index',attempt.retry===null?'Not recorded':attempt.retry],['Status',attempt.status],['Duration',duration(attempt.durationMs)],['Recorded error count',attempt.errorCount??'Not projected']]),errorExcerpts('Attempt error excerpts',attempt.errors,attempt.errorCount)))):node('p',{class:'insight-caption'},'No attempt details were recorded. A missing attempt or duration is not a zero-duration pass.'));
  }
  function mutationInsightBody(fault){
    const attempts=Array.isArray(fault.attempts)?fault.attempts:[],references=fault.killingTests||[],count=fault.killingTestCount;
    return node('div',{},fault.criterion?node('blockquote',{class:'source-quote'},fault.criterion):null,fault.description?node('p',{class:'insight-description'},fault.description):null,detailFacts([['Criterion ID',fault.requirementId],['Reported outcome',outcomeName(fault.status)],['Reason',fault.reason||'Not supplied'],['Suite attempts projected',attempts.length]]),node('div',{class:'insight-observations'},node('section',{},node('h4',{},'Baseline observation'),node('pre',{},fault.baselineProbe??'Not recorded')),node('section',{},node('h4',{},'Mutant observation'),node('pre',{},fault.mutantProbe??'Not recorded'))),node('p',{class:'insight-caption'},'Observations are reported values. Their presence or difference is not independent verification of fault activation.'),node('h4',{class:'insight-section-label'},'Killing test references · recorded'),references.length?node('pre',{class:'insight-reference-list'},references.join('\n')):node('p',{class:'insight-caption'},'No killing test references recorded.'),typeof count==='number'&&count>references.length?node('p',{class:'insight-caption'},'Showing '+references.length+' of '+count+' recorded references. See the imported JSON for the remaining references.'):null,node('h4',{class:'insight-section-label'},'Repeated suite execution records'),attempts.length?node('div',{class:'insight-attempts'},...attempts.map((attempt,index)=>executionSummary(attempt,'Attempt '+(index+1)))):node('p',{class:'insight-caption'},'No suite attempt details were supplied.'));
  }
  function matchesSearch(values){return !insight.search.trim()||values.join('\n').toLocaleLowerCase().includes(insight.search.trim().toLocaleLowerCase());}
  function insightRows(rows,kind){
    const host=node('div',{class:'insight-records'}),matches=rows.filter(row=>row.match);
    host.append(node('p',{class:'insight-result-count',role:'status','aria-live':'polite'},'Showing '+Math.min(insight.limit,matches.length)+' of '+matches.length+' matching '+kind+' · '+rows.length+' in this view.'));
    if(!matches.length)host.append(empty('No matching '+kind,'Try another outcome filter, report or search term. The selected evidence exists; this filter has no matching records.'));
    else host.append(...matches.slice(0,insight.limit).map(row=>row.render()));
    if(matches.length>insight.limit)host.append(button('Show 25 more',()=>{const previous=insight.limit;insight.limit+=25;renderInsightResults();document.querySelectorAll('#insight-results .insight-record > summary')[previous]?.focus();},'button secondary insight-more'));
    return host;
  }
  function renderReportInsight(){
    const kind=insight.kind,report=insightReport();if(!report)return empty('No '+(kind==='tests'?'test report':'mutation campaign')+' attached','Choose a work item with recorded evidence to inspect outcomes. Nothing is inferred, executed or uploaded by this view.');
    const content=node('div',{},insightMetadata(report),notice('Recorded evidence','The selected imported report is fixed while filtering and searching. These views do not independently verify its association with the work item or its underlying execution.'));
    if(kind==='tests'){
      content.append(detailFacts([['Total reported tests',report.counts.total],['Expected outcomes',report.counts.expected],['Unexpected outcomes',report.counts.unexpected],['Skipped',report.counts.skipped],['Flaky',report.counts.flaky],['Report wall duration',duration(report.durationMs)]]),errorExcerpts('Report-level error excerpts',report.reportErrors,report.reportErrorCount));
      const rows=(report.tests||[]).map((test,index)=>{const outcome=test.outcome||(['expected','unexpected','flaky','skipped'].includes(test.status)?test.status:'unknown');return {match:(insight.filter==='all'||insight.filter===outcome)&&matchesSearch([test.title,test.project,test.file||'',test.expectedStatus||'',...(test.errors||[]),...(test.attempts||[]).flatMap(attempt=>attempt.errors||[])]),render:()=>expandableRecord(test.title,(test.project||'Project not recorded')+' · '+(test.file||'Source not recorded')+' · '+duration(test.durationMs),badge(outcomeName(outcome),'status-'+outcome),report.id+':test:'+index,()=>testInsightBody(test))};});
      content.append(node('p',{class:'insight-caption'},'Search covers every projected test in the selected report. Error text is excerpted; use the imported JSON for its complete recorded payload. Expected outcomes can include tests expected to fail.'),insightRows(rows,'tests'));
    }else{
      content.append(detailFacts([['Requested faults',report.counts.requested],['Killed',report.counts.killed],['Survived',report.counts.survived],['Inconclusive',report.counts.inconclusive],['Campaign run ID',report.runId],['Original source unchanged',report.originalUnchanged?'Reported yes':'Not established']]));
      const gates=node('details',{class:'insight-gates'},node('summary',{},'Baseline & restoration records · '+report.baselines.length+' baseline runs'),node('p',{class:'insight-caption'},'Inspect these reported execution summaries. The workbench has not rerun or independently verified the baseline, activation or restoration gates.'),node('div',{class:'insight-attempts'},...report.baselines.map((baseline,index)=>executionSummary(baseline,'Baseline '+(index+1))),executionSummary(report.restoration,'Restoration'+(report.restored?' · reported '+report.restored:''))));content.append(gates);
      const rows=(report.faults||[]).map((fault,index)=>({match:(insight.filter==='all'||insight.filter===fault.status)&&matchesSearch([fault.id,fault.requirementId,fault.criterion||'',fault.description||'',fault.reason||'',fault.baselineProbe||'',fault.mutantProbe||'',...(fault.killingTests||[])]),render:()=>expandableRecord(fault.id,fault.requirementId+' · '+(fault.description||'No description supplied'),badge(outcomeName(fault.status),'status-'+fault.status),report.id+':fault:'+index,()=>mutationInsightBody(fault))}));content.append(node('p',{class:'insight-caption'},'Fault outcomes remain the report’s classifications. Expand a fault to inspect observations, repeated attempts and killing test references.'),insightRows(rows,'faults'));
    }
    if(report.limitations?.length)content.append(node('details',{class:'details insight-limitations'},node('summary',{},'Projection & report limitations'),node('ul',{},...report.limitations.map(limit=>node('li',{},limit)))));return content;
  }
  function renderSourceInsight(){
    const documents=insight.detail?.run?.documents||[];if(!documents.length)return empty('No source documents selected','This view shows only the source snapshots for the selected intake. No files are read or uploaded when opening it.');
    return insightRows(documents.map((source,index)=>({match:(insight.filter==='all'||insight.filter===source.extraction.format.toUpperCase())&&matchesSearch([source.name,...source.extraction.segments.map(segment=>segment.text)]),render:()=>expandableRecord(source.name,source.extraction.format.toUpperCase()+' · '+source.extraction.segments.length+' text segments',badge(source.extraction.issues.some(issue=>issue.severity==='blocking')?'Needs attention':'Captured',source.extraction.issues.some(issue=>issue.severity==='blocking')?'warning':'outline'),'source:'+source.id+':'+index,()=>node('div',{},detailFacts([['Source ID',source.id],['Size',typeof source.bytes==='number'?bytes(source.bytes):'Not captured in this illustration'],['Raw-file SHA256',source.sha256||'Unavailable in this illustration'],['Selected worksheet',source.extraction.selection?.sheet||'All available content']]),!insight.preview?download('Original document ↓','/api/tasks/'+encodeURIComponent(insight.detail.taskId)+'/runs/'+encodeURIComponent(insight.detail.run.id)+'/documents/'+encodeURIComponent(source.id)):null,...source.extraction.issues.map(issue=>notice(issue.severity==='blocking'?'Extraction blocker':'Review note',issue.message,issue.severity==='blocking'?'warning':'')),node('h4',{class:'insight-section-label'},'Source segment previews'),...source.extraction.segments.slice(0,10).map(segment=>node('details',{class:'details insight-source-segment'},node('summary',{},locator(segment.locator)),node('pre',{},segment.text.slice(0,4000)+(segment.text.length>4000?'\n[Display excerpt limited to 4,000 characters.]':'')))),source.extraction.segments.length>10?node('p',{class:'insight-caption'},'Showing the first 10 segment previews. The Artifacts tab contains the recorded extraction; the original document remains available for review.'):null))})), 'documents');
  }
  function renderCriteriaInsight(){
    const requirements=insight.draft?.requirements||[],questions=insight.draft?.questions||[];if(!requirements.length&&!questions.length)return empty('No acceptance criteria recorded','This intake has no source-linked criteria yet. No requirements or coverage are invented by the insights view.');
    const accepted=Boolean(insight.detail?.run?.accepted),sources=insight.detail?.run?.documents||[];
    const rows=requirements.map((requirement,index)=>{const linked=requirement.sources.some(ref=>ref.quote?.trim()),status=accepted?'accepted':linked?'draft':'missing';return {match:(insight.filter==='all'||insight.filter===status)&&matchesSearch([requirement.id,requirement.criterion||'',requirement.journey||'',...requirement.sources.map(ref=>ref.quote)]),render:()=>expandableRecord(requirement.id,requirement.criterion||'No expected outcome',badge(status==='accepted'?'Accepted interpretation':status==='draft'?'Draft criterion':'Source needed',status==='accepted'?'good':'warning'),'criterion:'+index,()=>node('div',{},node('blockquote',{class:'source-quote'},requirement.criterion),detailFacts([['Journey',requirement.journey],['Critical criterion',requirement.critical?'Yes':'No'],['Product / test acceptance','Not established by interpretation review']]),...requirement.sources.map(ref=>{const source=sources.find(item=>item.id===ref.sourceId),segment=source?.extraction.segments.find(item=>item.id===ref.segmentId);return node('section',{class:'insight-source-reference'},node('h4',{},source?.name||'Source not found'),node('p',{class:'insight-caption'},locator(segment?.locator)),node('blockquote',{class:'source-quote'},ref.quote));})))};});
    const content=node('div',{},notice('Requirements interpretation','Accepted criteria record a reviewed interpretation. They do not establish implementation coverage or passing tests.'));
    if(insight.filter!=='questions')content.append(requirements.length?insightRows(rows,'criteria'):empty('No criteria recorded','The recorded clarification questions are shown below.'));
    if(questions.length){const questionRows=questions.map((question,index)=>({match:(insight.filter!=='questions'||!question.resolution?.trim())&&matchesSearch([question.message,question.resolution||'',...(question.sourceIds||[])]),render:()=>expandableRecord(question.id,question.message,badge(question.resolution?.trim()?'Resolution recorded':'Unresolved',question.resolution?.trim()?'good':'warning'),'question:'+index,()=>node('div',{},node('blockquote',{class:'source-quote'},question.message),node('h4',{class:'insight-section-label'},'Recorded resolution'),node('p',{class:'insight-description'},question.resolution||'No resolution has been recorded.'),detailFacts([['Source references',(question.sourceIds||[]).map(id=>sources.find(source=>source.id===id)?.name||id).join(', ')||'Not supplied']])))}));content.append(node('h3',{class:'insight-section-label'},insight.filter==='questions'?'Open clarification questions':'Recorded clarification questions'),insightRows(questionRows,'questions'));}
    else if(insight.filter==='questions')content.append(empty('No open questions','No clarification questions were recorded in this interpretation.'));
    return content;
  }
  function renderMatrixInsight(){
    const matrix=insight.detail?.run?.matrix||[];if(!matrix.length)return empty('No recorded matrix rows','The source / test / assertion / runtime matrix has not been populated for this view.');
    return node('div',{},notice('Recorded traceability','Matrix labels and runtime cells are authored evidence. They are not independently checked against code or attached reports by this workbench.'),insightRows(matrix.map((row,index)=>({match:(insight.filter==='all'||insight.filter===(row.Assessment?.trim()||'unknown'))&&matchesSearch(Object.values(row)),render:()=>expandableRecord(row['Requirement ID']||'ID not recorded',row.Criterion||'Criterion not recorded',badge(row.Assessment||'unknown','outline'),'matrix:'+index,()=>detailFacts(Object.entries(row)))})),'matrix rows'));
  }
  function renderActivityInsight(){
    const detail=insight.detail,events=[];if(detail?.run)events.push({title:'Intake captured',text:detail.run.documents.length+' source documents',at:detail.run.createdAt,kind:'artifacts'});for(const report of detail?.reports.tests||[])events.push({title:'Playwright report imported',text:report.name,at:report.importedAt,kind:'tests',reportId:report.id});for(const report of detail?.reports.mutations||[])events.push({title:'Mutation report imported',text:report.name,at:report.importedAt,kind:'mutations',reportId:report.id});
    events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));if(!events.length)return empty('No recorded activity','Only intake creation and report imports with supplied timestamps appear here. No progress or execution activity is assumed.');
    const matches=events.filter(event=>matchesSearch([event.title,event.text,date(event.at)]));
    return node('div',{},notice('Event provenance','Imported timestamps describe attachment activity. They do not establish that different reports are comparable or associated with the selected criteria.'),...(matches.length?matches.map(event=>node('article',{class:'insight-activity-row'},node('div',{},node('h3',{},event.title),node('p',{},event.text),node('time',{datetime:event.at},date(event.at))),button('Inspect details →',()=>openInsight(event.kind,{reportId:event.reportId}),'button secondary small'))):[empty('No matching activity','Try another search term. No event records match this search.')]));
  }
  function renderInsightResults(){
    if(!insight)return;const renderer={tests:renderReportInsight,mutations:renderReportInsight,artifacts:renderSourceInsight,criteria:renderCriteriaInsight,traceability:renderMatrixInsight,activity:renderActivityInsight};$('#insight-results').replaceChildren(renderer[insight.kind]());
  }

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
  function legend(groups,available,onSelect){return node('div',{class:'crm-legend'},...groups.map((group,index)=>node(onSelect?'button':'div',{type:onSelect?'button':undefined,class:'crm-legend-row'+(onSelect?' crm-outcome-action':''),onClick:onSelect?()=>onSelect(group):undefined,'aria-label':onSelect?'Inspect '+group.label+' · '+(available?group.value:'no evidence attached'):undefined},svgNode('svg',{width:8,height:8,viewBox:'0 0 8 8','aria-hidden':'true'},svgNode('circle',{cx:4,cy:4,r:4,fill:group.color||chartColors[index%chartColors.length]})),node('span',{},group.label),node('strong',{},available?group.value:'—'))));}
  function chartHeader(title,qualifier,preview=false){return node('div',{class:'crm-chart-heading'},node('div',{},node('h2',{},title),node('p',{},qualifier)),preview?badge('Illustrative','warning'):null);}
  function barChart(groups,available,onSelect){const max=Math.max(1,...groups.map(group=>group.value||0));return node('div',{class:'crm-bars'},...groups.map((group,index)=>node(onSelect?'button':'div',{type:onSelect?'button':undefined,class:'crm-bar-row'+(onSelect?' crm-outcome-action':''),onClick:onSelect?()=>onSelect(group):undefined,'aria-label':onSelect?'Inspect '+group.label+' faults · '+(available?group.value:'no evidence attached'):undefined},node('div',{class:'crm-bar-label'},node('span',{},group.label),node('strong',{},available?group.value:'—')),svgNode('svg',{viewBox:'0 0 300 7',preserveAspectRatio:'none','aria-hidden':'true'},svgNode('rect',{width:300,height:7,rx:3.5,fill:'#eaf0f3'}),svgNode('rect',{width:available?300*(group.value||0)/max:0,height:7,rx:3.5,fill:group.color||chartColors[index%chartColors.length]})))));}
  function newest(reports){return reports.slice().sort((a,b)=>Date.parse(b.importedAt)-Date.parse(a.importedAt))[0]||null;}
  function renderDashboard(detail,{preview=false,draft=detail?.run?.draft}={}){
    const current=detail?.run,hasIntake=Boolean(current),requirements=draft?.requirements||[],documents=current?.documents||[],test=newest(detail?.reports.tests||[]),mutation=newest(detail?.reports.mutations||[]);
    const linked=requirements.filter(requirement=>requirement.sources.some(ref=>ref.quote?.trim())).length,questions=draft?.questions.filter(question=>!question.resolution?.trim()).length;
    const reportCount=hasIntake?detail.reports.tests.length+detail.reports.mutations.length:null;
    const kpis=[['Work items',preview?1:state.tasks.length,preview?'Fictional work item':'In this project'],['Requirements review',hasIntake?(current.accepted?'Accepted':current.reviewed?'Draft validated':'Needs review'):'—','Interpretation, not product acceptance'],['Open questions',hasIntake?questions:'—',hasIntake?'In this intake version':'Select a work item'],['Attached reports',reportCount??'—','Imported evidence, not re-execution']];
    const tiles=node('div',{class:'crm-kpis'},...kpis.map(([title,value,note],index)=>node('article',{class:'crm-kpi'},node('div',{class:'crm-kpi-top'},node('span',{},title),node('span',{class:'crm-kpi-icon','aria-hidden':'true'},['▤','✓','?','↗'][index])),node('strong',{class:typeof value==='string'&&value.length>4?'crm-kpi-word':''},value),node('p',{},note),index?button(index===2?'Inspect questions →':index===1?'Inspect interpretation →':'Inspect activity →',()=>openInsight(index===3?'activity':'criteria',{filter:index===2?'questions':'all'}),'button quiet small crm-kpi-detail'):null)));
    const stages=[['Documents',hasIntake?documents.length:null,'Original sources'],['Criteria',hasIntake?requirements.length:null,'Expected outcomes'],['Traceability',hasIntake?linked:null,'Criteria linked to sources'],['Test results',test?.counts.total??null,'Tests in latest report'],['Mutations',mutation?.counts.requested??null,'Faults in latest campaign']];
    const pipeline=node('section',{class:'crm-pipeline'},node('div',{class:'crm-pipeline-heading'},node('h2',{},'The evidence pipeline'),node('span',{},preview?'Fictional example':hasIntake?'Selected work item':'Select or create a work item')),node('div',{class:'crm-pipeline-stages'},...stages.map(([title,value,note],index)=>node('button',{type:'button',class:'crm-stage crm-stage-action'+(value!==null?' populated':''),onClick:()=>openInsight(['artifacts','criteria','traceability','tests','mutations'][index],{reportId:index===3?test?.id:index===4?mutation?.id:undefined}),'aria-label':'Inspect '+title},node('span',{class:'crm-stage-step'},String(index+1).padStart(2,'0')),node('div',{},node('h3',{},title),node('strong',{},value??'—'),node('p',{},note)),index<stages.length-1?node('span',{class:'crm-stage-arrow','aria-hidden':'true'},'→'):null))));
    const accepted=current?.accepted?requirements.length:0,missing=requirements.length-linked;
    const interpretation=[{label:'Accepted interpretation',value:accepted,color:'#128775'},{label:'Draft criteria',value:current?.accepted?0:linked,color:'#d4a14b'},{label:'Source quotation needed',value:current?.accepted?0:missing,color:'#8a9eac'}];
    const matrix=current?.matrix,assessmentMap=new Map();for(const row of matrix||[]){const value=row.Assessment?.trim()||'unknown';assessmentMap.set(value,(assessmentMap.get(value)||0)+1);}
    const assessmentColors=new Map([['supported','#128775'],['covered','#128775'],['partial','#d4a14b'],['missing','#bb6570'],['missing assertion','#bb6570'],['uncovered','#bb6570']]);
    const assessments=Array.from(assessmentMap,([label,value])=>({label,value,color:assessmentColors.get(label.toLowerCase())||'#8a9eac'}));
    const interpretationCard=node('section',{class:'crm-chart-card crm-interpretation-card'},chartHeader('Requirements & traceability','Review state and recorded assessment stay separate.',preview),node('div',{class:'crm-dual-charts'},node('div',{class:'crm-mini-chart'},node('h3',{},'Interpretation review'),node('div',{class:'crm-donut-layout'},ring(interpretation,hasIntake,requirements.length,'criteria'),legend(interpretation,hasIntake,group=>openInsight('criteria',{filter:group.label==='Accepted interpretation'?'accepted':group.label==='Draft criteria'?'draft':'missing'}))),button('Inspect criteria →',()=>openInsight('criteria'),'button quiet small crm-insight-link')),node('div',{class:'crm-mini-chart'},node('h3',{},'Recorded matrix labels'),node('div',{class:'crm-donut-layout'},ring(assessments,Boolean(matrix?.length),matrix?.length||0,'matrix rows'),assessments.length?legend(assessments,true,group=>openInsight('traceability',{filter:group.label})):node('p',{class:'crm-chart-empty'},'No matrix assessments recorded.')),button('Inspect matrix →',()=>openInsight('traceability'),'button quiet small crm-insight-link'))),node('p',{class:'crm-chart-foot'},'Matrix labels are recorded by the reviewer or coding agent. The workbench does not independently verify assertion coverage.'));
    const formats=new Map();for(const source of documents){const format=source.extraction.format.toUpperCase();formats.set(format,(formats.get(format)||0)+1);}
    const formatGroups=Array.from(formats,([label,value])=>({label,value}));
    const formatsCard=node('section',{class:'crm-chart-card'},chartHeader('Source format mix','Original documents in this intake.',preview),node('div',{class:'crm-format-ring'},ring(formatGroups,hasIntake,documents.length,'documents')),formatGroups.length?legend(formatGroups,true,group=>openInsight('artifacts',{filter:group.label})):node('p',{class:'crm-chart-empty'},'No source documents selected.'),button('Inspect source documents →',()=>openInsight('artifacts'),'button quiet small crm-insight-link'));
    const testGroups=[{label:'Expected outcomes',value:test?.counts.expected,color:'#128775'},{label:'Unexpected outcomes',value:test?.counts.unexpected,color:'#bb6570'},{label:'Skipped',value:test?.counts.skipped,color:'#d4a14b'},{label:'Flaky',value:test?.counts.flaky,color:'#737dad'}];
    const testFilter=label=>({'Expected outcomes':'expected','Unexpected outcomes':'unexpected',Skipped:'skipped',Flaky:'flaky'}[label]);
    const testsCard=node('section',{class:'crm-chart-card'},chartHeader('Test outcomes',test?'Latest imported Playwright report':'No Playwright report attached',preview),node('div',{class:'crm-test-chart'},ring(testGroups,Boolean(test),test?.counts.total||0,'tests'),legend(testGroups,Boolean(test),group=>openInsight('tests',{reportId:test?.id,filter:testFilter(group.label)}))),node('p',{class:'crm-chart-foot'},test?test.name:'Run the registered project scope or attach an existing JSON report.'),node('p',{class:'crm-evidence-note'},'Recorded report counts. Coverage needs source and assertion review; manually imported task associations remain unverified.'),button('Explore test outcomes →',()=>openInsight('tests',{reportId:test?.id}),'button quiet small crm-insight-link'));
    const mutationGroups=[{label:'Killed',value:mutation?.counts.killed,color:'#128775'},{label:'Survived',value:mutation?.counts.survived,color:'#d4a14b'},{label:'Inconclusive',value:mutation?.counts.inconclusive,color:'#8a9eac'},{label:'Not activated',value:mutation?.counts.notActivated,color:'#699eb1'},{label:'Invalid',value:mutation?.counts.invalid,color:'#bb6570'},{label:'Not run',value:mutation?.counts.notRun,color:'#a9b6bf'}];
    const mutationFilter=label=>({'Killed':'killed','Survived':'survived','Inconclusive':'inconclusive','Not activated':'not_activated','Invalid':'invalid_mutation','Not run':'not_run'}[label]);
    const mutationCard=node('section',{class:'crm-chart-card'},chartHeader('Mutation outcomes',mutation?'Latest imported campaign · '+mutation.counts.requested+' requested faults':'No mutation campaign attached',preview),barChart(mutationGroups,Boolean(mutation),group=>openInsight('mutations',{reportId:mutation?.id,filter:mutationFilter(group.label)})),node('p',{class:'crm-chart-foot'},mutation?mutation.name:'Fault outcomes stay unavailable until a report is attached.'),button('Explore mutation outcomes →',()=>openInsight('mutations',{reportId:mutation?.id}),'button quiet small crm-insight-link'));
    const activity=[];if(current)activity.push({title:'Intake captured',text:documents.length+' original documents in this version',at:current.createdAt,kind:'intake'});for(const report of detail?.reports.tests||[])activity.push({title:'Playwright report imported',text:report.name,at:report.importedAt,kind:'tests'});for(const report of detail?.reports.mutations||[])activity.push({title:'Mutation report imported',text:report.name,at:report.importedAt,kind:'mutation'});
    activity.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const activityCard=node('section',{class:'crm-chart-card'},chartHeader('Activity & provenance',preview?'Illustrative events':'Recorded intake and report imports',preview),activity.length?node('ol',{class:'crm-activity'},...activity.slice(0,5).map(item=>node('li',{},node('span',{class:'crm-activity-dot','aria-hidden':'true'}),node('div',{},node('h3',{},item.title),node('p',{},item.text),node('time',{datetime:item.at},date(item.at)))))):node('div',{class:'crm-chart-empty crm-activity-empty'},node('span',{'aria-hidden':'true'},'◷'),node('p',{},'No recorded activity yet. Your first intake will appear here.')),button('Explore activity →',()=>openInsight('activity'),'button quiet small crm-insight-link'));
    return node('div',{class:'crm-dashboard'},tiles,pipeline,node('div',{class:'crm-chart-grid'},interpretationCard,formatsCard,testsCard,mutationCard,activityCard));
  }
  function setPreview(value){state.preview=value;clearTimeout(execution.poll);execution.poll=null;closeMenu();$('#error-banner').hidden=true;render();if(!value)loadExecution(state.detail?.taskId);notify(value?'Illustrative layout preview opened. No project evidence was created.':'Returned to the live project workspace.');}
  function renderPreview(){
    document.body.classList.add('preview-mode');$('#project-name').textContent='Illustrative layout';$('#project-root').textContent='Fictional data in this browser view only.';$('#task-count').textContent='1 example';$('#new-task').disabled=true;$('#refresh').disabled=true;$('#preview-toggle').textContent='Exit preview';$('#preview-toggle').setAttribute('aria-pressed','true');$('.local-badge').replaceChildren(node('span',{class:'local-dot','aria-hidden':'true'}),'Layout preview');
    $('#task-list').replaceChildren(node('div',{class:'task-button active'},node('span',{class:'task-icon','aria-hidden':'true'},'▤'),node('span',{},node('strong',{},illustrativeDetail.taskId),node('small',{},'Fictional receiving workflow'))));
    $('#work-item-header').replaceChildren(node('div',{class:'preview-banner'},node('div',{},node('strong',{},'Illustrative layout preview — not project evidence'),node('p',{},'Fictional values show the layout. Upload, edit, import and acceptance actions are disabled.')),button('Exit preview',()=>setPreview(false),'button secondary small')),node('div',{class:'page-heading'},node('div',{},node('div',{class:'breadcrumb'},'FICTIONAL WORK ITEM / RECEIVING WORKFLOW'),node('h1',{},illustrativeDetail.taskId),node('p',{class:'muted'},'A client-only example of the CRM-style evidence overview.'))));
    $('#tab-bar').hidden=false;$('#tab-bar').replaceChildren(...tabs.map(([id,title])=>node('button',{type:'button',class:'tab',role:'tab','aria-selected':String(id==='overview'),disabled:id!=='overview',tabindex:id==='overview'?'0':'-1'},title)));
    $('#context-panel').hidden=true;$('#context-panel').replaceChildren();$('#workspace-grid').classList.add('no-context');$('#view-panel').removeAttribute('aria-labelledby');$('#view-panel').setAttribute('aria-label','Illustrative layout preview');$('#view-panel').replaceChildren(renderAgentAnalysis(illustrativeDetail,{preview:true}),renderDashboard(illustrativeDetail,{preview:true}));renderExecutionPanel();
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
    host.append(card,node('section',{class:'context-card'},node('div',{class:'eyebrow'},'WHAT ACCEPTANCE MEANS HERE'),node('h2',{},'Keep the source in view'),node('p',{},'Accepting criteria records your review of the requirements interpretation. It does not mark the application or its tests as passed.')),node('div',{class:'context-note'},node('strong',{},'Continue in your coding agent'),'Inspect source, prepare the matrix and write tests in chat. Use the registered execution controls here, or attach existing reports.'));
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
    return node('div',{},renderAgentAnalysis(state.detail),renderDashboard(state.detail,{draft:state.draft}),node('section',{class:'next-step'},node('div',{class:'eyebrow'},'YOUR NEXT STEP'),node('h2',{},nextTitle),node('p',{},nextText),nextButton),brief);
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
  function reportLimits(report){const job=execution.jobs.find(item=>item.reportId===report.id);return node('div',{class:'report-foot'},node('p',{},job?'Registered by local '+executionLabel(job.kind)+' job '+job.id+' · '+jobStatus(job.status)+'. This records execution, not assertion coverage or product acceptance.':'Imported report. Execution provenance is recorded separately in registered jobs; externally attached reports are not independently associated with this work item.'),report.limitations?.length?node('details',{class:'details'},node('summary',{},'Report limitations'),node('ul',{},...report.limitations.map(limit=>node('li',{},limit)))):null);}
  function renderReportCards(host,kind){
    const isTests=kind==='tests',reports=state.detail.reports[kind];host.replaceChildren();
    if(!reports.length)host.append(empty(isTests?'No test execution report attached':'No mutation campaign attached','Run the registered scope above or attach recorded evidence. No execution outcome is assumed.'));
    for(const report of reports){
      const fields=isTests?[[report.counts.expected,'Expected outcomes'],[report.counts.unexpected,'Unexpected outcomes'],[report.counts.skipped,'Skipped'],[report.counts.flaky,'Flaky'],[report.counts.total,'Total tests']]:[[report.counts.requested,'Requested faults'],[report.counts.killed,'Killed'],[report.counts.survived,'Survived'],[report.counts.inconclusive,'Inconclusive'],[report.counts.notActivated,'Not activated'],[report.counts.invalid,'Invalid'],[report.counts.notRun,'Not run']];
      const explore=button('Explore outcomes →',()=>openInsight(kind,{reportId:report.id}),'button secondary');
      explore.setAttribute('aria-label','Explore outcomes in '+report.name);
      host.append(node('article',{class:'report-card'},reportHeader(report),node('div',{class:'report-stats'},...fields.map(([value,label])=>node('div',{class:'report-stat'},node('small',{},label),node('strong',{},value)))),explore,reportLimits(report)));
    }
  }
  function renderReportTab(kind){
    const isTests=kind==='tests',reports=node('div',{id:'report-list'});renderReportCards(reports,kind);
    return node('div',{},node('div',{class:'section-title'},node('div',{},node('h2',{},isTests?'Playwright execution evidence':'Behavioral mutation evidence'),node('p',{},'Run the registered scope above, or import a report. Explore the recorded outcomes and individual evidence.'))),reportImport(isTests?'playwright':'mutation'),reports);
  }
  function renderTestReports(){return renderReportTab('tests');}
  function renderMutationReports(){return renderReportTab('mutations');}
  function render(){
    if(state.preview){renderPreview();return;}
    document.body.classList.remove('preview-mode');$('#new-task').disabled=!state.token;$('#refresh').disabled=false;$('#view-panel').setAttribute('aria-label','Work item content');$('#preview-toggle').textContent='Layout preview';$('#preview-toggle').setAttribute('aria-pressed','false');$('.local-badge').replaceChildren(node('span',{class:'local-dot','aria-hidden':'true'}),'Project local');
    if(state.project){$('#project-name').textContent=state.project.name;$('#project-root').textContent=state.project.root;}
    renderTasks();renderHeader();renderTabs();renderContext();renderExecutionPanel();
    const panel=$('#view-panel');
    if(!state.detail){panel.removeAttribute('role');panel.removeAttribute('aria-labelledby');panel.replaceChildren(renderWelcome());return;}
    const renderer={overview:renderOverview,artifacts:renderArtifacts,criteria:renderCriteria,traceability:renderTraceability,tests:renderTestReports,mutations:renderMutationReports};
    panel.replaceChildren((renderer[state.tab]||renderOverview)());updateReviewControls();
  }

  $('#new-task').addEventListener('click',()=>openNew());
  $('#close-execution').addEventListener('click',()=>$('#execution-dialog').close());
  $('#execution-dialog').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();$('#execution-dialog').close();}});
  $('#execution-dialog').addEventListener('close',()=>{const modal=execution.modal;execution.modal=null;const opener=modal?.opener?.isConnected?modal.opener:document.getElementById(modal?.openerId);if(opener&&!opener.disabled)opener.focus();else $('#execution-panel-title')?.focus();modal?.afterClose?.();});
  $('#close-insight').addEventListener('click',()=>$('#insight-dialog').close());
  $('#insight-dialog').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();$('#insight-dialog').close();}});
  $('#insight-dialog').addEventListener('close',()=>{const opener=insight?.opener;insight=null;if(opener?.isConnected)opener.focus();});
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
