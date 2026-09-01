import path from 'node:path';
import { readText } from '../graph-utils.mjs';

const routeEnrichment = {
  '/login': {
    path: '/login',
    component: 'LoginPage',
    roles: ['anonymous'],
    actions: ['sign in'],
    fields: ['username', 'password'],
    states: ['loaded', 'validation-error'],
    testIds: [
      'login-page',
      'login-form',
      'username-input',
      'password-input',
      'login-submit',
      'login-error',
      'seeded-users'
    ]
  },
  '/crm/dashboard': {
    fields: [],
    testIds: ['dashboard-page', 'metric-open-pipeline', 'metric-at-risk-accounts', 'metric-new-leads', 'refresh-dashboard', 'loading-state']
  },
  '/crm/leads': {
    fields: ['lead name', 'email', 'source'],
    testIds: [
      'leads-page',
      'lead-form',
      'lead-name-input',
      'lead-email-input',
      'lead-source-input',
      'save-lead',
      'lead-validation-error',
      'leads-empty-state',
      'leads-table'
    ]
  },
  '/crm/accounts': {
    fields: [],
    testIds: ['accounts-page', 'accounts-table', 'export-accounts', 'read-only-banner']
  },
  '/crm/opportunities': {
    fields: ['opportunity name', 'deal value'],
    testIds: [
      'opportunities-page',
      'opportunity-form',
      'opportunity-name-input',
      'opportunity-value-input',
      'save-opportunity',
      'opportunity-validation-error',
      'opportunities-table'
    ]
  },
  '/crm/reports': {
    fields: [],
    testIds: ['reports-page', 'download-report', 'retry-report', 'report-error', 'report-ready']
  },
  '/crm/admin/users': {
    fields: ['role'],
    testIds: ['admin-users-page', 'invite-user', 'role-select', 'permission-denied-page', 'back-to-dashboard']
  }
};

function extractConstLiteral(source, name) {
  const declaration = new RegExp(`const\\s+${name}\\s*=\\s*`, 'm').exec(source);
  if (!declaration) {
    throw new Error(`Could not find const ${name} in sample CRM app source.`);
  }

  const start = declaration.index + declaration[0].length;
  const opener = source[start];
  const closer = opener === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      quote = char;
      continue;
    }

    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;

    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  throw new Error(`Could not parse const ${name} literal in sample CRM app source.`);
}

function evaluateLiteral(literal, name) {
  try {
    return Function(`"use strict"; return (${literal});`)();
  } catch (error) {
    throw new Error(`Could not evaluate sample CRM ${name} literal: ${error.message}`);
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export async function buildManifest(options = {}) {
  const appRoot = options.appRoot ?? process.env.SOURCE_APP_ROOT ?? 'examples/sample-crm-app';
  const sourceEntry = options.sourceEntry ?? process.env.SOURCE_ENTRY ?? path.join(appRoot, 'public/assets/app.js');
  const source = await readText(sourceEntry);
  const users = evaluateLiteral(extractConstLiteral(source, 'users'), 'users');
  const routeConfig = evaluateLiteral(extractConstLiteral(source, 'routeConfig'), 'routeConfig');

  const manifestRoutes = [
    routeEnrichment['/login'],
    ...routeConfig.map((route) => {
      const enrichment = routeEnrichment[route.path] ?? {};
      return {
        path: route.path,
        component: route.component,
        roles: route.roles ?? [],
        actions: route.actions ?? [],
        fields: enrichment.fields ?? [],
        states: route.states ?? [],
        testIds: unique([...(route.testIds ?? []), ...(enrichment.testIds ?? [])])
      };
    })
  ];

  return {
    name: 'sample-agentic-crm',
    description: 'Demo CRM app for source-aware Playwright graph intelligence.',
    capturePrefix: 'crm',
    entrypoint: path.join(appRoot, 'server.mjs'),
    publicRoot: path.join(appRoot, 'public'),
    defaultUrl: 'http://127.0.0.1:4173',
    auth: {
      strategy: 'localStorage',
      loginRoute: '/login',
      storageKey: 'crm-user'
    },
    users: Object.values(users).map((user) => ({
      role: user.role,
      username: user.username,
      password: user.password,
      displayName: user.displayName,
      access: user.routes,
      session: {
        username: user.username,
        password: user.password,
        role: user.role,
        displayName: user.displayName,
        routes: user.routes
      }
    })),
    routes: manifestRoutes
  };
}
