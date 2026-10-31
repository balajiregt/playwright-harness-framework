// Optional one-time setup for Qwen3-4B GGUFs with an older embedded template.
// This fetches template text only; no model weights or repository evidence is sent.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const response=await fetch('https://huggingface.co/Qwen/Qwen3-4B/raw/main/tokenizer_config.json',{signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error(`Official Qwen template download failed (${response.status})`);
const {chat_template:template}=await response.json();
if(typeof template!=='string'||!template.includes('enable_thinking'))throw Error('Expected Qwen thinking-control template is missing');
await mkdir('artifacts/models',{recursive:true});
await writeFile('artifacts/models/qwen3-4b.jinja',template);
console.log(`Saved artifacts/models/qwen3-4b.jinja (SHA256 ${createHash('sha256').update(template).digest('hex')}). Use only with a compatible Qwen3-4B model.`);
