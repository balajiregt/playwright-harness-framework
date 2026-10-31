import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configureAgent } from './configure-agent.mjs';

const configName = '.playwright-agent.local.json';
const codex = '.agents/skills/playwright-agent/SKILL.md';
const copilot = '.github/agents/playwright.agent.md';
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'playwright-adoption-'));
  const repo = path.join(root, 'existing project'), toolkitRoot = path.join(root, 'agent toolkit');
  await fs.mkdir(path.join(toolkitRoot, '.agents/skills/playwright-agent'), { recursive: true });
  await fs.writeFile(path.join(toolkitRoot, codex), '# Canonical test fixture skill\n');
  await fs.mkdir(repo);
  await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify({ name: 'existing-project', devDependencies: { '@playwright/test': '1.62.1' } }));
  await fs.writeFile(path.join(repo, 'playwright.config.ts'), 'export default {};\n');
  await fs.writeFile(path.join(repo, 'AGENTS.md'), '# Existing project instructions\nKeep these exact instructions.\n');
  await fs.mkdir(path.join(repo, 'tests'));
  await fs.writeFile(path.join(repo, 'tests/login.spec.ts'), '// Existing user test stays unchanged.\n');
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n');
  return { root, repo, toolkitRoot };
}
async function snapshot(root) {
  const files = {};
  async function visit(dir) {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) await visit(file);
      else files[path.relative(root, file)] = item.isSymbolicLink() ? `link:${await fs.readlink(file)}` : await fs.readFile(file, 'utf8');
    }
  }
  await visit(root);
  return files;
}

test('onboarding points both clients at one toolkit, preserves source, and repeats without rewrites', async () => {
  const f = await fixture();
  try {
    const before = await snapshot(f.repo);
    const result = await configureAgent(f);
    assert.equal(result.created.length, 3);
    assert.equal(result.gitignoreUpdated, true);
    const config = JSON.parse(await fs.readFile(path.join(f.repo, configName), 'utf8'));
    assert.deepEqual(config, { version: 1, toolkitPath: '../agent toolkit', playwrightConfig: 'playwright.config.ts' });
    for (const name of [codex, copilot]) {
      const file = path.join(f.repo, name), content = await fs.readFile(file, 'utf8');
      assert.ok(content.includes('adopter repository containing this shim'));
      assert.ok(content.includes('overrides the canonical skill'));
      assert.ok(!content.includes(f.repo));
      assert.ok(!content.includes(f.toolkitRoot));
      const link = content.match(/workflow\]\(<(.+)>\)/)?.[1];
      assert.ok(link && !path.isAbsolute(link));
      assert.equal(await fs.realpath(path.resolve(path.dirname(file), link)), await fs.realpath(path.join(f.toolkitRoot, codex)));
    }
    const after = await snapshot(f.repo);
    for (const name of ['AGENTS.md', 'package.json', 'playwright.config.ts', 'tests/login.spec.ts']) assert.equal(after[name], before[name]);
    assert.equal(after['.gitignore'], 'node_modules/\n.playwright-agent.local.json\n');
    const repeated = await configureAgent(f);
    assert.deepEqual(repeated.created, []);
    assert.equal(repeated.gitignoreUpdated, false);
    assert.deepEqual(await snapshot(f.repo), after);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test('a later destination conflict is detected before config, skill or ignore writes', async () => {
  const f = await fixture();
  try {
    await fs.mkdir(path.dirname(path.join(f.repo, copilot)), { recursive: true });
    await fs.writeFile(path.join(f.repo, copilot), 'User-owned Copilot agent\n');
    const before = await snapshot(f.repo);
    await assert.rejects(configureAgent(f), /Refusing to overwrite existing different/);
    assert.deepEqual(await snapshot(f.repo), before);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test('existing different local config is preserved and explicit existing config paths are selected', async () => {
  const f = await fixture();
  try {
    await fs.mkdir(path.join(f.repo, 'config'));
    await fs.writeFile(path.join(f.repo, 'config/ui.config.ts'), 'export default {};\n');
    const result = await configureAgent({ ...f, client: 'codex', playwrightConfig: 'config/ui.config.ts' });
    assert.equal(result.playwrightConfig, 'config/ui.config.ts');
    assert.equal(result.created.length, 2);
    await assert.rejects(fs.access(path.join(f.repo, copilot)), { code: 'ENOENT' });
    const before = await snapshot(f.repo);
    await assert.rejects(configureAgent(f), /Refusing to overwrite existing different/);
    assert.deepEqual(await snapshot(f.repo), before);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test('declared Playwright and an in-repository existing config are required without partial writes', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.repo, 'package.json'), '{"name":"no-playwright"}');
    const before = await snapshot(f.repo);
    await assert.rejects(configureAgent(f), /already declare @playwright\/test/);
    assert.deepEqual(await snapshot(f.repo), before);
    await fs.writeFile(path.join(f.repo, 'package.json'), '{"devDependencies":{"@playwright/test":"1.62.1"}}');
    for (const playwrightConfig of ['missing.ts', '../outside.ts', path.join(f.repo, 'playwright.config.ts')]) {
      const current = await snapshot(f.repo);
      await assert.rejects(configureAgent({ ...f, playwrightConfig }), /config|relative|inside/);
      assert.deepEqual(await snapshot(f.repo), current);
    }
    await fs.writeFile(path.join(f.root, 'external.ts'), 'export default {};');
    await fs.symlink(path.join(f.root, 'external.ts'), path.join(f.repo, 'escape.config.ts'));
    await assert.rejects(configureAgent({ ...f, playwrightConfig: 'escape.config.ts' }), /inside/);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test('symlinked destination parents are refused and choosing the second client later is idempotent', async () => {
  const f = await fixture();
  try {
    await fs.mkdir(path.join(f.root, 'external'));
    await fs.symlink(path.join(f.root, 'external'), path.join(f.repo, '.agents'));
    const before = await snapshot(f.repo);
    await assert.rejects(configureAgent(f), /real directory/);
    assert.deepEqual(await snapshot(f.repo), before);
    assert.deepEqual(await fs.readdir(path.join(f.root, 'external')), []);
    await fs.unlink(path.join(f.repo, '.agents'));
    await configureAgent({ ...f, client: 'codex' });
    const result = await configureAgent(f);
    assert.deepEqual(result.created, [copilot]);
    assert.equal(result.gitignoreUpdated, false);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});
