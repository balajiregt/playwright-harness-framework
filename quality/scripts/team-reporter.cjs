// Loaded by the TARGET repository's Playwright runner. Captures no error text or attachments.
const fs=require('node:fs');
class TeamReporter {
 onBegin(config,suite){this.config=config;this.started=Date.now();this.tests=suite.allTests().map(t=>({runnerId:t.id,title:t.titlePath().slice(2).join(' › '),titlePath:t.titlePath(),project:t.parent.project()?.name??'',roles:Array.isArray(t.parent.project()?.metadata?.roles)&&t.parent.project().metadata.roles.every(r=>typeof r==='string')?t.parent.project().metadata.roles:undefined,projectDependencies:t.parent.project()?.dependencies??[],file:t.location.file,line:t.location.line,column:t.location.column,tags:t.tags??[],expectedStatus:t.expectedStatus,results:[]}));this.byId=new Map(this.tests.map(t=>[t.runnerId,t]));}
 onTestEnd(t,r){this.byId.get(t.id)?.results.push({status:r.status,expectedStatus:t.expectedStatus,retry:r.retry,durationMs:r.duration});}
 onError(){this.failed=true;}
 onEnd(result){if(!this.tests)return;fs.writeFileSync(process.env.DECISION_INVENTORY_FILE,JSON.stringify({version:1,complete:!this.failed,mode:process.env.DECISION_COLLECT_MODE,status:result.status,wallMs:Date.now()-this.started,tests:this.tests},null,2));}
 printsToStdio(){return false;}
}
module.exports=TeamReporter;
