import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('./package-demo.py', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const publicTaskFiles = ['epic.md', 'jira-tickets.json', 'requirements.json'].map(name => `contexts/tasks/CRM-DEMO-001/${name}`);

async function put(root, name, data = `fixture: ${name}\n`) {
  const file = path.join(root, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'playwright-source-package-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'source');
  const output = path.join(dir, 'releases');
  for (const name of ['package.json', 'package-lock.json', 'README.md', 'AGENTS.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', ...publicTaskFiles]) {
    await put(root, name);
  }
  return { root, output, dir };
}

function run(root, output) {
  return spawnSync('python3', [script, '--root', root, '--output-dir', output], { encoding: 'utf8' });
}

test('packages a standalone working tree, preserves allowed sources and verifies every extracted hash', async t => {
  const { root, output } = await fixture(t);
  const included = ['.gitignore', '.npmrc', '.env.example', 'playwright.config.ts', 'tests/demo.spec.ts',
    'pages/demo.ts', 'contexts/source-map.yml', 'contexts/captures/demo.png',
    'contexts/tasks/CRM-DEMO-001/epic.md', 'contexts/tasks/CRM-DEMO-001/jira-tickets.json',
    'contexts/tasks/CRM-DEMO-001/requirements.json',
    '.agents/skills/playwright-agent/SKILL.md', '.codex/agents/playwright-agent.toml', '.github/agents/playwright.agent.md',
    'quality/src/team.ts', 'quality/python/requirements.lock', 'quality/integrations/code-mode/package-lock.json',
    'quality/.platform-publish.json', 'quality/.agents/skills/platform-publish/references/metrics-v1.schema.json',
    'quality/benchmarks/decision-pilot/gold.json', 'quality/examples/team/requirements.docx',
    'benchmarks/dashboard/run.py', 'docs/agent-workflow.md', 'docs/blog/assets/graph-metrics.png'];
  for (const name of included) await put(root, name);
  const excluded = ['.git/config', '.env', '.env.local', 'notes-private.md', 'node_modules/dep/index.js',
    'contexts/tasks/CASE-1/requirements.md', 'contexts/.resolved/CASE-1.yml',
    'contexts/tasks/CRM-DEMO-001/notes.md', 'contexts/tasks/CRM-DEMO-001/.env',
    'contexts/tasks/CRM-DEMO-001/secrets.json', 'contexts/tasks/CRM-DEMO-001/nested/epic.md',
    'quality/contexts/tasks/CRM-DEMO-001/epic.md',
    'contexts/Tasks/PRIVATE-UPPER/requirements.json',
    'quality/context-inputs/epic.md', 'quality/.venv/lib/private.py', 'quality/mutation.config.local.json',
    'scripts/__pycache__/x.pyc', 'scripts/private.key', 'src/id_rsa', 'src/app.log', 'src/localconfigs/settings.json',
    'src/models/weights.json', 'src/datasets/live.json', 'src/cache/session.json',
    'examples/results/run.json', 'playwright/.auth/user.json', 'artifacts/releases/previous.json',
    'benchmark-results/run.json', 'test-results/report.json', 'docs/blog/draft.md',
    'docs/blog/assets/other.png', 'docs/evidence/raw.json', 'quality/docs/blog/article.md'];
  for (const name of excluded) await put(root, name);
  const result = run(root, output);
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(result.stdout);
  const manifestBytes = await readFile(path.join(info.directory, 'SOURCE-MANIFEST.json'));
  const manifest = JSON.parse(manifestBytes);
  const names = manifest.files.map(item => item.path);
  for (const name of included) assert.ok(names.includes(name), `missing ${name}`);
  for (const name of excluded) assert.ok(!names.includes(name), `private ${name}`);
  assert.ok(!names.some(name => name.includes('PRIVATE-UPPER')));
  assert.equal(names.length, new Set(names).size);
  assert.equal(manifest.sourceMode, 'reviewed-working-tree-allowlist');
  assert.equal(manifestBytes.includes(Buffer.from(root)), false);
  const archiveBytes = await readFile(info.archive);
  assert.equal(sha(archiveBytes), info.sha256);
  const sums = await readFile(path.join(info.directory, 'SHA256SUMS'), 'utf8');
  assert.ok(sums.includes(`${info.sha256}  playwright-agent-source.zip`));
  assert.ok(sums.includes(`${sha(manifestBytes)}  SOURCE-MANIFEST.json`));
  const extracted = path.join(info.directory, 'extracted');
  const inspect = spawnSync('python3', ['-c', `import pathlib,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
 for name in z.namelist():
  p=pathlib.PurePosixPath(name)
  assert not p.is_absolute() and '..' not in p.parts and p.parts[0]=='playwright-agent'
 z.extractall(sys.argv[2])`, info.archive, extracted], { encoding: 'utf8' });
  assert.equal(inspect.status, 0, inspect.stderr);
  for (const item of manifest.files) {
    const bytes = await readFile(path.join(extracted, 'playwright-agent', item.path));
    assert.equal(sha(bytes), item.sha256, item.path);
    assert.equal(bytes.length, item.bytes, item.path);
  }
  assert.deepEqual(await readFile(path.join(extracted, 'playwright-agent/SOURCE-MANIFEST.json')), manifestBytes);
  const again = run(root, output);
  assert.equal(again.status, 0, again.stderr);
  assert.notEqual(JSON.parse(again.stdout).directory, info.directory);
});

test('public task allowlist rejects linked ancestors and files while private task trees stay unvisited', async t => {
  const { root, output, dir } = await fixture(t);
  await put(dir, 'outside/epic.md', '-----BEGIN ' + 'PRIVATE KEY-----');
  await mkdir(path.join(root, 'contexts/tasks'), { recursive: true });
  const publicDir = path.join(root, 'contexts/tasks/CRM-DEMO-001');
  await rm(publicDir, { recursive: true });
  await symlink(path.join(dir, 'outside'), publicDir);
  let result = run(root, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlink in source allowlist: contexts\/tasks\/CRM-DEMO-001/);
  assert.doesNotMatch(result.stderr, /Private path or key marker/);
  await rm(publicDir);
  await mkdir(publicDir);
  for (const name of publicTaskFiles.filter(name => !name.endsWith('/epic.md'))) await put(root, name);
  await symlink(path.join(dir, 'outside/epic.md'), path.join(publicDir, 'epic.md'));
  result = run(root, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlink in source allowlist: contexts\/tasks\/CRM-DEMO-001\/epic.md/);
  await rm(path.join(publicDir, 'epic.md'));
  await put(root, 'contexts/tasks/CRM-DEMO-001/epic.md', 'Public authored fixture');
  await symlink(path.join(dir, 'outside'), path.join(root, 'contexts/tasks/PRIVATE-CASE'));
  await symlink(path.join(dir, 'outside'), path.join(publicDir, 'private-nested'));
  result = run(root, output);
  assert.equal(result.status, 0, result.stderr);
  const names = JSON.parse(await readFile(path.join(JSON.parse(result.stdout).directory, 'SOURCE-MANIFEST.json'), 'utf8')).files.map(f => f.path);
  assert.ok(names.includes('contexts/tasks/CRM-DEMO-001/epic.md'));
  assert.ok(!names.some(name => name.includes('PRIVATE-CASE') || name.includes('private-nested')));
  // A link at tasks itself must also fail before the public leaf is inspected.
  await rm(path.join(root, 'contexts/tasks'), { recursive: true });
  await symlink(path.join(dir, 'outside'), path.join(root, 'contexts/tasks'));
  result = run(root, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlink in source allowlist: contexts\/tasks\/CRM-DEMO-001/);
});

test('missing any required public task document fails before creating an archive', async t => {
  const { root, output } = await fixture(t);
  for (const name of publicTaskFiles) {
    const original = await readFile(path.join(root, name));
    await rm(path.join(root, name));
    const result = run(root, output);
    assert.notEqual(result.status, 0, name);
    assert.ok(result.stderr.includes(`Missing required source files: ${name}`), result.stderr);
    await assert.rejects(readdir(output), { code: 'ENOENT' });
    await put(root, name, original);
  }
});

test('rejects file or directory symlinks in allowed source trees without traversing them', async t => {
  const { root, output, dir } = await fixture(t);
  await put(dir, 'external/private.txt');
  await mkdir(path.join(root, 'src'), { recursive: true });
  await symlink(path.join(dir, 'external/private.txt'), path.join(root, 'src/link'));
  let result = run(root, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlink in source allowlist/);
  await rm(path.join(root, 'src/link'));
  await symlink(path.join(dir, 'external'), path.join(root, 'src/linked-dir'));
  result = run(root, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Symlink in source allowlist/);
  await rm(path.join(root, 'src/linked-dir'));
  await symlink(path.join(dir, 'external'), path.join(root, 'node_modules'));
  result = run(root, output);
  assert.equal(result.status, 0, result.stderr); // Excluded dependencies are never visited.
});

test('fails closed on private home paths, private key markers and missing required source', async t => {
  const { root, output } = await fixture(t);
  await put(root, 'src/local.ts', 'const path = ' + JSON.stringify('/Users/' + 'private-user/credentials') + ';');
  let result = run(root, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Private path or key marker in source: src\/local.ts/);
  await put(root, 'src/local.ts', '-----BEGIN ' + 'PRIVATE KEY-----');
  result = run(root, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Private path or key marker/);
  await rm(path.join(root, 'src/local.ts'));
  await rm(path.join(root, 'LICENSE'));
  result = run(root, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required source files: LICENSE/);
  await assert.rejects(readdir(output), { code: 'ENOENT' });
});
