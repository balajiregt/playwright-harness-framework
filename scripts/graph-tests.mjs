import path from 'node:path';
import YAML from 'yaml';
import { extractTags, listFiles, pathExists, readJson, readText, slug, writeJson } from './graph-utils.mjs';

const manifestPath = process.env.SOURCE_MANIFEST ?? 'examples/sample-crm-app/source-manifest.json';
const manifest = (await pathExists(manifestPath)) ? await readJson(manifestPath) : {};
const manifestRoles = new Set([
  ...(manifest.users ?? []).map((user) => user.role),
  ...(manifest.routes ?? []).flatMap((route) => route.roles ?? [])
].filter(Boolean));
const manifestRoutes = new Set((manifest.routes ?? []).map((route) => route.path).filter(Boolean));

const files = {
  tests: await listFiles('tests', (file) => file.endsWith('.ts')),
  specs: await listFiles('specs', (file) => file.endsWith('.md') && !path.basename(file).includes('template')),
  specTemplates: await listFiles('specs', (file) => file.endsWith('.md') && path.basename(file).includes('template')),
  pages: await listFiles('pages', (file) => file.endsWith('.ts')),
  assertions: await listFiles('assertions', (file) => file.endsWith('.ts')),
  captures: await listFiles('contexts/captures', (file) => file.endsWith('.yml') || file.endsWith('.png')),
  captureRecipes: (await pathExists('contexts/capture-recipes.yml')) ? ['contexts/capture-recipes.yml'] : []
};

const nodes = [];
const edges = [];
const testCases = [];

for (const file of files.tests) {
  const text = await readText(file);
  const testTitleMatches = Array.from(text.matchAll(/(?<!\.)\btest\((['"`])(.+?)\1/gms));
  const tags = extractTags(text);
  const imports = Array.from(text.matchAll(/from\s+['"](.+?)['"]/g)).map((match) => match[1]);

  const testNodeId = `test_file:${file}`;
  nodes.push({ id: testNodeId, type: 'playwright_test_file', label: file, tags, imports });

  for (const [index, titleMatch] of testTitleMatches.entries()) {
    const title = titleMatch[2].replace(/\s+/g, ' ').trim();
    const nextTestIndex = testTitleMatches[index + 1]?.index ?? text.length;
    const body = text.slice(titleMatch.index ?? 0, nextTestIndex);
    const caseTags = Array.from(new Set([...extractTags(title), ...extractTags(body)])).sort();
    const quotedRoutes = Array.from(body.matchAll(/['"`](\/[^'"`\s]*)['"`]/g)).map((match) => match[1]);
    const routeMentions = Array.from(new Set(quotedRoutes.filter((route) => manifestRoutes.size === 0 || manifestRoutes.has(route))));
    const testIdMentions = Array.from(body.matchAll(/getByTestId\((['"`])(.+?)\1\)|data-testid=["'](.+?)["']/g)).map((match) => match[2] ?? match[3]);
    const methodMentions = Array.from(body.matchAll(/\.(goto[A-Z][A-Za-z0-9_]+|expect[A-Z][A-Za-z0-9_]+|create[A-Z][A-Za-z0-9_]+|signInAs|openSection|retryReport)\b/g)).map((match) => match[1]);
    const roleMentions = Array.from(manifestRoles).filter((role) =>
      new RegExp(`\\b${escapeRegExp(role)}\\b`, 'i').test(`${title}\n${body}`)
    ).sort();
    const caseId = `test_case:${file}:${slug(title)}`;
    const testCase = { id: caseId, file, title, tags: caseTags, roles: roleMentions, routes: routeMentions, testIds: testIdMentions, methods: methodMentions, imports };
    testCases.push(testCase);
    nodes.push({ id: caseId, type: 'playwright_test', label: title, file, tags: caseTags, roles: roleMentions, routes: routeMentions, testIds: testIdMentions, methods: methodMentions });
    edges.push({ from: testNodeId, to: caseId, type: 'file_contains_test' });
    for (const tag of caseTags) {
      const tagId = `tag:${tag}`;
      if (!nodes.some((node) => node.id === tagId)) nodes.push({ id: tagId, type: 'tag', label: tag });
      edges.push({ from: caseId, to: tagId, type: 'test_has_tag' });
    }
  }
}

for (const file of files.specs) {
  const text = await readText(file);
  const specId = `flow_spec:${file}`;
  const title = text.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(file);
  nodes.push({ id: specId, type: 'flow_spec', label: title, file, tags: extractTags(text) });
}

for (const file of files.pages) {
  const text = await readText(file);
  const className = text.match(/class\s+([A-Za-z0-9_]+)/)?.[1] ?? path.basename(file);
  nodes.push({ id: `page_object:${className}`, type: 'page_object', label: className, file });
}

for (const file of files.assertions) {
  const text = await readText(file);
  const className = text.match(/class\s+([A-Za-z0-9_]+)/)?.[1] ?? path.basename(file);
  nodes.push({ id: `assertion_helper:${className}`, type: 'assertion_helper', label: className, file });
}

for (const file of files.captureRecipes) {
  const document = YAML.parse(await readText(file)) ?? {};
  for (const [recipeId, recipe] of Object.entries(document.recipes ?? {})) {
    const nodeId = `capture_recipe:${recipeId}`;
    const captures = recipe.captures ?? [];
    const role = recipe.auth?.value?.role;
    nodes.push({
      id: nodeId,
      type: 'capture_recipe',
      label: `workflow: ${recipeId}`,
      file,
      role,
      appUrl: recipe.app_url,
      captures: captures.map((capture) => capture.name)
    });
    if (role) {
      edges.push({ from: nodeId, to: `role:${role}`, type: 'recipe_uses_role' });
    }
    for (const capture of captures) {
      edges.push({ from: nodeId, to: `route:${capture.route}`, type: 'recipe_visits_route' });
      edges.push({
        from: nodeId,
        to: `capture:contexts/captures/${capture.name}.yml`,
        type: 'recipe_generates_capture'
      });
    }
  }
}

for (const file of files.captures) {
  const text = file.endsWith('.yml') ? await readText(file) : '';
  const url = text.match(/\/url:\s*(.+)/)?.[1] ?? undefined;
  nodes.push({ id: `capture:${file}`, type: 'capture_file', label: file, file, url });
}

const graph = {
  generatedAt: new Date().toISOString(),
  sourceManifest: manifestPath,
  files,
  nodes,
  edges,
  testCases
};

await writeJson('graphs/data/test-graph.json', graph);
console.log(`Wrote graphs/data/test-graph.json with ${nodes.length} nodes and ${testCases.length} test cases.`);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
