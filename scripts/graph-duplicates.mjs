import { pathExists, readJson, slug, writeJson } from './graph-utils.mjs';

if (!(await pathExists('graphs/data/test-graph.json'))) {
  await import('./graph-tests.mjs');
}

const tests = await readJson('graphs/data/test-graph.json');
const groups = new Map();

for (const testCase of tests.testCases) {
  const normalized = slug(testCase.title.replace(/@\w[\w-]*/g, ''));
  const primaryTag = testCase.tags.find((tag) => ['@smoke', '@regression', '@auth'].includes(tag)) ?? 'untagged';
  const routeKey = testCase.routes[0] ?? 'unknown-route';
  const testIdKey = testCase.testIds.slice(0, 3).join('|') || 'unknown-assertion';
  const key = `${routeKey}:${primaryTag}:${normalized}:${testIdKey}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(testCase);
}

const duplicates = Array.from(groups.entries())
  .filter(([, items]) => items.length > 1)
  .map(([key, items]) => ({
    level: 'exact',
    key,
    tests: items.map((item) => ({ title: item.title, file: item.file, tags: item.tags })),
    recommendation: 'Do not add another test; extend the existing test only if a distinct assertion is missing.'
  }));

const overlaps = [];
const byRouteTag = new Map();
for (const testCase of tests.testCases) {
  const key = `${testCase.routes[0] ?? 'unknown-route'}:${testCase.tags.find((tag) => tag === '@smoke' || tag === '@regression') ?? 'untagged'}`;
  if (!byRouteTag.has(key)) byRouteTag.set(key, []);
  byRouteTag.get(key).push(testCase);
}

for (const [key, items] of byRouteTag.entries()) {
  if (items.length > 1 && !duplicates.some((duplicate) => duplicate.key.startsWith(key))) {
    overlaps.push({
      level: 'overlap',
      key,
      tests: items.map((item) => ({ title: item.title, file: item.file, tags: item.tags })),
      recommendation: 'Review whether these tests cover distinct roles, states, or assertions.'
    });
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  summary: {
    duplicateCandidates: duplicates.length,
    overlapCandidates: overlaps.length
  },
  duplicates,
  overlaps
};

await writeJson('graphs/data/duplicates.json', result);
console.log(`Wrote graphs/data/duplicates.json with ${duplicates.length} exact duplicates and ${overlaps.length} overlaps.`);
