import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { readJson, slug, writeText } from './graph-utils.mjs';

const manifestPath = process.env.SOURCE_MANIFEST ?? 'examples/sample-crm-app/source-manifest.json';
const outputPath = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : 'contexts/capture-recipes.yml';
const write = process.argv.includes('--write');

function stateName(role, route, access) {
  if (!access) return 'denied';
  if (route.path === '/crm/reports') return 'error';
  if (route.path === '/crm/leads') return 'empty';
  if (route.path === '/crm/accounts' && role === 'viewer') return 'read-only';
  return 'loaded';
}

function captureName(prefix, role, route, access) {
  const parts = route.path.split('/').filter(Boolean);
  if (parts[0] === prefix) parts.shift();
  const segment = parts.join('-');
  return `${prefix}-${role}-${segment}-${stateName(role, route, access)}`;
}

const manifest = await readJson(manifestPath);
const roleUsers = new Map((manifest.users ?? []).map((user) => [user.role, user]));
const appUrl = manifest.defaultUrl ?? 'http://127.0.0.1:4173';
const capturePrefix = process.env.CAPTURE_WORKFLOW_PREFIX ?? manifest.capturePrefix ?? slug(manifest.name ?? 'app');
const loginRoute = manifest.auth?.loginRoute ?? manifest.loginRoute ?? '/login';
const storageKey = manifest.auth?.storageKey ?? `${capturePrefix}-user`;
const authStrategy = manifest.auth?.strategy ?? 'localStorage';
const routes = (manifest.routes ?? []).filter((route) => route.path !== '/login');
const recipes = {};

for (const user of manifest.users ?? []) {
  const role = user.role;
  recipes[`${capturePrefix}-${role}-role`] = {
    description: `Capture ${role} role accessible and denied states from the source manifest.`,
    app_url: appUrl,
    login_route: loginRoute,
    auth: {
      strategy: authStrategy,
      key: storageKey,
      value: user.session ?? {
        username: user.username,
        password: user.password,
        role,
        displayName: user.displayName ?? user.username,
        routes: user.access
      }
    },
    captures: routes.map((route) => {
      const access = route.roles.includes(role);
      return {
        name: captureName(capturePrefix, role, route, access),
        route: route.path,
        role,
        expected_access: access ? 'allowed' : 'denied',
        state: stateName(role, route, access),
        screenshot: route.path === '/crm/dashboard' || !access
      };
    })
  };
}

const document = {
  name: 'capture-recipes',
  version: 1,
  generated_from: manifestPath,
  purpose: 'Reusable role and flow capture workflows for playwright-cli page context.',
  usage: {
    list: 'npm run capture:recipe -- --list',
    run_manager: 'npm run capture:crm:manager',
    dry_run: 'npm run capture:recipe -- crm-manager-role --dry-run'
  },
  rules: [
    'Capture workflows are stored as YAML recipes in this file.',
    'Workflows capture page context once and reuse it for prompt-to-test generation.',
    'Refresh only affected captures when routes, visible copy, locators, or role permissions change.',
    'Do not treat captures as test verification; run npx playwright test after generating or healing tests.'
  ],
  recipes
};

const content = YAML.stringify(document, { lineWidth: 0 });

if (write) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await writeText(outputPath, content);
  console.log(`Wrote ${outputPath} with ${Object.keys(recipes).length} capture workflows.`);
} else {
  process.stdout.write(content);
}

const missingUsers = [...new Set(routes.flatMap((route) => route.roles))].filter((role) => !roleUsers.has(role) && role !== 'anonymous');
if (missingUsers.length) {
  console.warn(`No seeded users found for roles: ${missingUsers.join(', ')}`);
}
