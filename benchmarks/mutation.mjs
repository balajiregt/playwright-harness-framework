import { spawnSync, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import crypto from 'node:crypto';
const report='benchmark-results/mutant.json';
fs.rmSync(report,{force:true});
const run=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config=benchmarks/playwright.config.ts','--grep=viewer export denied in UI and API'],{encoding:'utf8',env:{...process.env,CRM_BENCHMARK_MODE:'1',CRM_BENCHMARK_FAULT:'viewer-export',BENCHMARK_REPORT:report},timeout:120000});
const tests=[];if(fs.existsSync(report)){const walk=s=>{for(const child of s.suites??[])walk(child);for(const spec of s.specs??[])for(const t of spec.tests??[])tests.push({...t,title:spec.title});};walk(JSON.parse(fs.readFileSync(report,'utf8')));}
const result=tests[0]?.results?.[0];
const detected=run.status===1&&tests.length===1&&tests[0].title==='viewer export denied in UI and API'&&result?.status==='failed'&&result.errors?.some(e=>/Expected:.*403[\s\S]*Received:.*200/.test(e.message));
const summary={schemaVersion:1,evidenceKind:'seeded-defect-local-execution',mutant:'viewer-export',detected,expectedTests:1,observedTests:tests.length,reportSha256:fs.existsSync(report)?crypto.createHash('sha256').update(fs.readFileSync(report)).digest('hex'):null,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),limitations:['One seeded defect; not an estimate of all defect detection.','No agent or JEV accuracy inference.']};
fs.mkdirSync('benchmark-results',{recursive:true});fs.writeFileSync('benchmark-results/mutation-summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));if(!detected)process.exitCode=1;
