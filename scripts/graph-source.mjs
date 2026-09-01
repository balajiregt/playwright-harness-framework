import { readJson, writeJson, slug } from './graph-utils.mjs';

const manifestPath = process.env.SOURCE_MANIFEST ?? 'examples/sample-crm-app/source-manifest.json';
const manifest = await readJson(manifestPath);

const nodes = [];
const edges = [];
const possibleTests = [];

for (const user of manifest.users ?? []) {
  nodes.push({
    id: `role:${user.role}`,
    type: 'role',
    label: user.role,
    source: manifestPath,
    username: user.username
  });
}

for (const route of manifest.routes ?? []) {
  const routeId = `route:${route.path}`;
  nodes.push({
    id: routeId,
    type: 'app_route',
    label: route.path,
    component: route.component,
    source: manifestPath,
    roles: route.roles,
    states: route.states,
    actions: route.actions,
    fields: route.fields,
    testIds: route.testIds
  });

  nodes.push({
    id: `component:${route.component}`,
    type: 'page_component',
    label: route.component,
    source: manifestPath
  });
  edges.push({ from: routeId, to: `component:${route.component}`, type: 'route_exposes_component' });

  for (const role of route.roles ?? []) {
    const roleId = `role:${role}`;
    if (!nodes.some((node) => node.id === roleId)) {
      nodes.push({ id: roleId, type: 'role', label: role, source: manifestPath });
    }
    edges.push({ from: roleId, to: routeId, type: 'role_can_access_route' });
  }

  for (const action of route.actions ?? []) {
    const actionId = `action:${route.path}:${slug(action)}`;
    nodes.push({ id: actionId, type: 'user_action', label: action, route: route.path, source: manifestPath });
    edges.push({ from: `component:${route.component}`, to: actionId, type: 'component_exposes_action' });
    for (const role of route.roles ?? []) {
      possibleTests.push({
        id: `candidate:${slug(route.path)}:${slug(role)}:${slug(action)}`,
        route: route.path,
        role,
        action,
        state: 'loaded',
        suggestedTag: route.path === '/login' || route.path === '/crm/dashboard' ? '@smoke' : '@regression',
        title: `${role} can ${action} on ${route.path}`
      });
    }
  }

  for (const field of route.fields ?? []) {
    const fieldId = `field:${route.path}:${slug(field)}`;
    nodes.push({ id: fieldId, type: 'form_field', label: field, route: route.path, source: manifestPath });
    edges.push({ from: `component:${route.component}`, to: fieldId, type: 'component_exposes_field' });
  }

  for (const state of route.states ?? []) {
    const stateId = `state:${route.path}:${slug(state)}`;
    nodes.push({ id: stateId, type: 'page_state', label: state, route: route.path, source: manifestPath });
    edges.push({ from: routeId, to: stateId, type: 'route_has_state' });
    if (state.includes('error') || state.includes('denied') || state.includes('empty') || state.includes('loading') || state.includes('validation')) {
      possibleTests.push({
        id: `candidate:${slug(route.path)}:${slug(state)}`,
        route: route.path,
        role: (route.roles ?? ['user'])[0],
        action: `verify ${state} state`,
        state,
        suggestedTag: state.includes('denied') ? '@auth' : '@regression',
        title: `${route.path} shows ${state} state`
      });
    }
  }
}

const graph = {
  generatedAt: new Date().toISOString(),
  source: manifestPath,
  app: {
    name: manifest.name,
    defaultUrl: manifest.defaultUrl,
    entrypoint: manifest.entrypoint
  },
  nodes,
  edges,
  possibleTests
};

await writeJson('graphs/data/source-graph.json', graph);
console.log(`Wrote graphs/data/source-graph.json with ${nodes.length} nodes, ${edges.length} edges, and ${possibleTests.length} candidate tests.`);

