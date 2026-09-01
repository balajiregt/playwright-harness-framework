import fs from 'node:fs/promises';
import path from 'node:path';

export const ROOT = process.cwd();

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(ROOT, filePath), 'utf8'));
}

export async function readText(filePath) {
  return fs.readFile(path.resolve(ROOT, filePath), 'utf8');
}

export async function pathExists(filePath) {
  try {
    await fs.access(path.resolve(ROOT, filePath));
    return true;
  } catch {
    return false;
  }
}

export async function writeJson(filePath, data) {
  const resolved = path.resolve(ROOT, filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(data, null, 2)}\n`);
}

export async function writeText(filePath, data) {
  const resolved = path.resolve(ROOT, filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, data);
}

export async function listFiles(dir, predicate = () => true) {
  const resolved = path.resolve(ROOT, dir);
  try {
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const relative = path.join(dir, entry.name);
        if (entry.isDirectory()) return listFiles(relative, predicate);
        return predicate(relative) ? [relative] : [];
      })
    );
    return files.flat();
  } catch {
    return [];
  }
}

export function extractTags(text) {
  return Array.from(new Set(text.match(/@[a-zA-Z][\w-]*/g) ?? [])).sort();
}

export function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function includesAny(haystack, needles) {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(String(needle).toLowerCase()));
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
