import { createHash } from 'node:crypto';
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const taskSchema = z.object({ name: z.string(), description: z.string(), inputs: z.string(), gold: z.string().optional() }).strict();
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function confinedFile(root: string, relative: string) {
  const realRoot = await realpath(root);
  const target = await realpath(path.resolve(root, relative));
  if (!target.startsWith(realRoot + path.sep)) throw new Error('File is outside the declared evidence root');
  if (!['.ts', '.json', '.yml', '.yaml', '.md'].includes(path.extname(target)) || path.basename(target).startsWith('.')) {
    throw new Error('Unsupported evidence file type');
  }
  return target;
}

export async function resolveContext(taskFile = 'contexts/task.yml') {
  const taskPath = await confinedFile(ROOT, taskFile);
  const taskText = await readFile(taskPath, 'utf8');
  const task = taskSchema.parse(YAML.parse(taskText));
  const inputPath = await confinedFile(ROOT, task.inputs);
  const inputText = await readFile(inputPath, 'utf8');
  const { workItemsSchema } = await import('./workflow.js');
  const items = workItemsSchema.parse(JSON.parse(inputText));
  const provenance = { generatedAt: new Date().toISOString(), task: task.name,
    inputs: { path: task.inputs, sha256: digest(inputText) },
    note: 'Offline scaffold. No provider responses or browser execution are generated.' };
  await mkdir(path.join(ROOT, 'artifacts'), { recursive: true });
  await writeFile(path.join(ROOT, 'artifacts/resolved-context.yml'), YAML.stringify(provenance));
  return { items, provenance };
}
