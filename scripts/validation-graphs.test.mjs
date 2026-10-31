import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validationGraphs } from './validation-graphs.mjs';

const productRoot = fileURLToPath(new URL('../', import.meta.url));
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'validation-graphs-'));
  const scripts = ['graph-source.mjs', 'graph-tests.mjs', 'graph-coverage.mjs', 'graph-duplicates.mjs', 'graph-view.mjs', 'graph-utils.mjs', 'sync-source-manifest.mjs', 'source-adapters/sample-crm.mjs'];
  for (const script of scripts) {
    const target = path.join(root, 'scripts', script);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(productRoot, 'scripts', script), target);
  }
  await fs.symlink(path.join(productRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await fs.mkdir(path.join(root, 'examples/sample-crm-app/public/assets'), { recursive: true });
  await fs.writeFile(path.join(root, 'examples/sample-crm-app/public/assets/app.js'), "const users = { viewer: { role: 'viewer', username: 'viewer@example.com', password: 'password', displayName: 'Synthetic Viewer', routes: ['/crm/accounts'] } };\nconst routeConfig = [{path:'/crm/accounts',component:'AccountsPage',roles:['viewer'],states:['loaded','permission-denied'],actions:['inspect accounts'],testIds:['accounts-page']}];\n");
  await fs.writeFile(path.join(root, 'examples/sample-crm-app/source-manifest.json'), '{}\n');
  await fs.mkdir(path.join(root, 'tests'));
  const spec = "import { test, expect } from '@playwright/test';\ntest('viewer accounts @smoke', async ({page})=>{await page.goto('/crm/accounts');await expect(page.getByTestId('accounts-page')).toBeVisible();});\n";
  await fs.writeFile(path.join(root, 'tests/a.spec.ts'), spec);
  await fs.writeFile(path.join(root, 'tests/b.spec.ts'), spec);
  return root;
}

test('existing graph pipeline retains candidate findings, snapshots view, and regenerates only an artifact manifest', async () => {
  const root = await fixture();
  try {
    const tracked = path.join(root, 'examples/sample-crm-app/source-manifest.json');
    const before = await fs.readFile(tracked, 'utf8');
    const manifest = await validationGraphs({ root, outputDir: 'artifacts/run/graphs' });
    assert.equal(manifest.status, 'passed');
    assert.equal(manifest.sourceManifest.trackedFresh, false);
    assert.equal(manifest.sourceManifest.generatedLocally, true);
    assert.equal(await fs.readFile(tracked, 'utf8'), before);
    assert.equal(manifest.counts.testCases, 2);
    assert.equal(manifest.counts.duplicateCandidates, 1);
    assert.ok(manifest.counts.gaps > 0);
    assert.ok(manifest.limitations.some(line => line.includes('does not prove')));
    assert.equal(manifest.commands.at(-1).args[0], 'scripts/graph-view.mjs');
    for (const artifact of Object.values(manifest.artifacts)) {
      assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
      assert.ok((await fs.stat(path.join(root, artifact.path))).size > 0);
    }
    const html = await fs.readFile(path.join(root, manifest.artifacts.view.path), 'utf8');
    assert.ok(html.includes('../../../tests/a.spec.ts'));
    await assert.rejects(validationGraphs({ root, outputDir: 'artifacts/run/graphs' }), /already exists/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('fresh tracked manifest is reused without source writes', async () => {
  const root = await fixture();
  try {
    const first = await validationGraphs({ root, outputDir: 'artifacts/first/graphs' });
    await fs.copyFile(path.join(root, first.sourceManifest.used.path), path.join(root, 'examples/sample-crm-app/source-manifest.json'));
    const second = await validationGraphs({ root, outputDir: 'artifacts/second/graphs' });
    assert.equal(second.sourceManifest.trackedFresh, true);
    assert.equal(second.sourceManifest.generatedLocally, false);
    assert.equal(second.commands.length, 2);
    assert.equal(second.sourceManifest.used.path, 'examples/sample-crm-app/source-manifest.json');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('broken graph pipeline fails with command receipts instead of reporting stale artifacts as a pass', async () => {
  const root = await fixture();
  try {
    await fs.writeFile(path.join(root, 'scripts/graph-coverage.mjs'), 'throw new Error("synthetic graph failure");\n');
    await assert.rejects(validationGraphs({ root, outputDir: 'artifacts/broken/graphs' }), /graph pipeline failed/);
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'artifacts/broken/graphs/manifest.json'), 'utf8'));
    assert.equal(manifest.status, 'failed');
    assert.equal(manifest.commands.at(-1).exitCode, 1);
    assert.match(manifest.commands.at(-1).stderr, /synthetic graph failure/);
    assert.equal(manifest.counts, null);
    await assert.rejects(validationGraphs({ root, outputDir: '../outside' }), /ignored artifacts/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
