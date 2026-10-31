const fs=require('node:fs');
class MutationReporter {
 onBegin(config,suite){this.tests=suite.allTests().map(t=>({id:t.id,title:t.titlePath().join(' › '),file:t.location.file,line:t.location.line,project:t.parent.project()?.name,expectedStatus:t.expectedStatus,results:[]}));this.byId=new Map(this.tests.map(t=>[t.id,t]));this.started=Date.now();this.errors=0;}
 onTestEnd(t,r){this.byId.get(t.id)?.results.push({status:r.status,retry:r.retry,durationMs:r.duration,assertionFailure:r.errors.some(e=>/expect\(|AssertionError|Expected:/.test(e.message||'')),errors:r.errors.map(e=>(e.message||'').replace(/\u001b\[[0-9;]*m/g,'').slice(0,4000))});}
 onError(){this.errors=(this.errors||0)+1;}
 onEnd(result){fs.writeFileSync(process.env.MUTATION_RESULT_FILE,JSON.stringify({status:result.status,errors:this.errors||0,tests:this.tests||[],wallMs:Date.now()-this.started}));}
 printsToStdio(){return false;}
}
module.exports=MutationReporter;
