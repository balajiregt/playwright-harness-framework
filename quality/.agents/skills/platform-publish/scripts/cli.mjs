#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {validateConfig, validateRegistry} from './contract.mjs';
import {prepare, validatePrepared, publishToGit} from './publisher.mjs';

const help = `Platform Publish 1.0.0 (Node 22+; no dependencies)
  node cli.mjs prepare --config POLICY.json --input MEASUREMENTS.json --output PREPARED.json
  node cli.mjs validate --config POLICY.json --input PREPARED.json
  node cli.mjs registry --input REGISTRY.json
  node cli.mjs publish --config POLICY.json --input PREPARED.json --confirm-publication
prepare/validate/registry never access the network. publish sends only the prepared
aggregate to the policy's public repository, platform-results/metrics.json.
Existing Git credentials are used; never put credentials into configuration files.
`;
const read = file => { const data=fs.readFileSync(file,'utf8'); if (Buffer.byteLength(data)>500000) throw Error('Input too large'); return JSON.parse(data); };
try {
  const args=process.argv.slice(2); if (!args.length||args[0]==='--help') { console.log(help); }
  else {
    const command=args.shift(), flags={};
    while (args.length) {
      const key=args.shift(); if (!['--config','--input','--output','--confirm-publication'].includes(key)||Object.hasOwn(flags,key)) throw Error('Unknown or duplicate argument');
      if (key==='--confirm-publication') flags[key]=true;
      else { const value=args.shift(); if (!value||value.startsWith('--')) throw Error('Missing argument value'); flags[key]=value; }
    }
    const allowed={prepare:['--config','--input','--output'],validate:['--config','--input'],registry:['--input'],publish:['--config','--input','--confirm-publication']}[command];
    if (!allowed||Object.keys(flags).some(k=>!allowed.includes(k))||allowed.some(k=>!flags[k])) throw Error('Required arguments missing or unsupported; use --help');
    if (command==='registry') { const r=validateRegistry(read(flags['--input'])); console.log(`Registry valid: ${r.projects.length} projects, ${r.analyses.length} analyses`); }
    else {
      const config=validateConfig(read(flags['--config'])), input=read(flags['--input']);
      if (command==='prepare') {
        const data=prepare(config,input), output=path.resolve(flags['--output']);
        fs.writeFileSync(output,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
        console.log('Prepared public aggregate '+data.runId+'. Review it before publication.');
      } else {
        validatePrepared(input,config);
        console.log(command==='publish'?JSON.stringify(publishToGit(config,input)):'Prepared aggregate and reviewed policy match. No publication performed.');
      }
    }
  }
} catch (error) {
  const reason=error instanceof SyntaxError?'Invalid JSON; input content suppressed':error.code?'File operation failed ('+error.code+')':error.message;
  console.error('Platform publishing stopped: '+reason); process.exitCode=1;
}
