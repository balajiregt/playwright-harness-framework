import YAML from 'yaml';
import { includesAny, pathExists, readJson, readText, writeJson } from './graph-utils.mjs';

if (!(await pathExists('graphs/data/source-graph.json'))) {
  await import('./graph-source.mjs');
}

if (!(await pathExists('graphs/data/test-graph.json'))) {
  await import('./graph-tests.mjs');
}

const source = await readJson('graphs/data/source-graph.json');
const tests = await readJson('graphs/data/test-graph.json');

const routes = source.nodes.filter((node) => node.type === 'app_route');
const captures = tests.nodes.filter((node) => node.type === 'capture_file');
const captureFiles = new Set(captures.map((capture) => capture.file));
const testText = tests.testCases
  .map((testCase) => `${testCase.title} ${testCase.file} ${testCase.tags.join(' ')} ${(testCase.roles ?? []).join(' ')} ${testCase.routes.join(' ')} ${testCase.testIds.join(' ')} ${(testCase.methods ?? []).join(' ')}`)
  .join('\n')
  .toLowerCase();
const normalizedTestText = testText.replace(/[^a-z0-9]+/g, '');
const captureText = captures.map((capture) => `${capture.file} ${capture.url ?? ''}`).join('\n').toLowerCase();

const coverage = [];
const gaps = [];
const captureExpectations = await readCaptureExpectations(tests.files.captureRecipes ?? []);

for (const route of routes) {
  const routeSegment = route.label.split('/').filter(Boolean).at(-1) ?? '';
  const componentTerm = String(route.component ?? '').replace(/Page$/, '');
  const routeTerms = [
    route.label,
    routeSegment,
    `goto-${routeSegment}`,
    `goto${routeSegment}`,
    componentTerm,
    route.component,
    ...(route.testIds ?? [])
  ].filter(Boolean);
  const routeCovered = includesAny(testText, routeTerms);
  const captureCovered = includesAny(captureText, [route.label, route.component, route.label.split('/').filter(Boolean).at(-1) ?? '']);
  coverage.push({
    route: route.label,
    component: route.component,
    roles: route.roles,
    actions: route.actions,
    states: route.states,
    hasTestCoverage: routeCovered,
    hasCapture: captureCovered
  });

  if (!routeCovered) {
    gaps.push({
      type: 'missing_route_smoke',
      route: route.label,
      recommendation: `Add a smoke or regression test for ${route.label}.`
    });
  }

  if (!captureCovered) {
    gaps.push({
      type: 'stale_or_missing_capture',
      route: route.label,
      recommendation: `Capture ${route.label} with playwright-cli into contexts/captures/.`
    });
  }

  for (const state of route.states ?? []) {
    const normalizedState = String(state).toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!testText.includes(state.toLowerCase()) && !normalizedTestText.includes(normalizedState)) {
      gaps.push({
        type: 'missing_state',
        route: route.label,
        state,
        recommendation: `Add coverage for ${state} state on ${route.label}.`
      });
    }
  }

  for (const role of route.roles ?? []) {
    if (!testText.includes(role.toLowerCase()) && role !== 'anonymous') {
      gaps.push({
        type: 'missing_role_access',
        route: route.label,
        role,
        recommendation: `Add role-aware coverage for ${role} on ${route.label}.`
      });
    }
  }
}

for (const expectation of captureExpectations.filter((item) => item.expectedAccess === 'denied' && captureFiles.has(item.capture))) {
  const matchingRoute = routes.find((route) => route.label === expectation.route);
  const matchingTests = tests.testCases.filter((testCase) => testCaseMentionsRole(testCase, expectation.role));
  const hasDeniedAssertion = matchingTests.some((testCase) =>
    testCaseCoversRoute(testCase, expectation.route, matchingRoute) &&
    (testCase.methods ?? []).some((method) => /expectPermissionDenied/i.test(method))
  );

  if (!hasDeniedAssertion) {
    gaps.push({
      type: 'missing_denied_route_assertion',
      route: expectation.route,
      role: expectation.role,
      capture: expectation.capture,
      recommendation: `Add a ${expectation.role} test step that opens ${expectation.route} and asserts permission denied.`
    });
  }
}

const graph = {
  generatedAt: new Date().toISOString(),
  summary: {
    routes: routes.length,
    coveredRoutes: coverage.filter((item) => item.hasTestCoverage).length,
    captures: captures.length,
    gaps: gaps.length
  },
  coverage,
  possibleTests: source.possibleTests,
  gaps
};

await writeJson('graphs/data/coverage-graph.json', graph);
console.log(`Wrote graphs/data/coverage-graph.json with ${gaps.length} gaps.`);

async function readCaptureExpectations(files) {
  const expectations = [];
  for (const file of files) {
    const document = YAML.parse(await readText(file)) ?? {};
    for (const [workflowId, workflow] of Object.entries(document.recipes ?? {})) {
      for (const capture of workflow.captures ?? []) {
        expectations.push({
          workflowId,
          route: capture.route,
          role: capture.role ?? workflow.auth?.value?.role,
          expectedAccess: capture.expected_access,
          state: capture.state,
          capture: `contexts/captures/${capture.name}.yml`
        });
      }
    }
  }
  return expectations;
}

function testCaseMentionsRole(testCase, role) {
  return `${testCase.title} ${(testCase.roles ?? []).join(' ')}`.toLowerCase().includes(String(role).toLowerCase());
}

function testCaseCoversRoute(testCase, route, routeNode) {
  const routeSegment = route.split('/').filter(Boolean).at(-1) ?? '';
  const componentTerm = String(routeNode?.component ?? '').replace(/Page$/, '');
  const routeTerms = [
    route,
    routeSegment,
    `goto-${routeSegment}`,
    `goto${routeSegment}`,
    componentTerm,
    routeNode?.component,
    ...(routeNode?.testIds ?? [])
  ].filter(Boolean);
  return includesAny(`${testCase.title} ${testCase.routes.join(' ')} ${testCase.testIds.join(' ')} ${(testCase.methods ?? []).join(' ')}`, routeTerms);
}
