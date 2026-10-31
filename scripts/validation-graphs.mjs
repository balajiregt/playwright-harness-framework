import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const productRoot = fileURLToPath(new URL('../', import.meta.url));
const trackedManifest = 'examples/sample-crm-app/source-manifest.json';
const appSource = 'examples/sample-crm-app/public/assets/app.js';
const pipeline = ['graph-source.mjs', 'graph-tests.mjs', 'graph-coverage.mjs', 'graph-duplicates.mjs'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const relative = (root, file) => path.relative(root, file).split(path.sep).join('/');

async function describe(root, file) {
  const bytes = await fs.readFile(file);
  return { path: relative(root, file), sha256: digest(bytes), bytes: bytes.length };
}

async function execute(root, args, env) {
  const startedAt = new Date().toISOString();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }));
  });
  return { command: process.execPath, args, cwd: root, startedAt, completedAt: new Date().toISOString(), ...result };
}

export async function validationGraphs({ root = productRoot, outputDir }) {
  root = await fs.realpath(root);
  if (!outputDir) throw new Error('--output-dir is required');
  const output = path.resolve(root, outputDir);
  if (!output.startsWith(path.join(root, 'artifacts') + path.sep)) {
    throw new Error('Graph snapshots must stay under this product\'s ignored artifacts/ directory');
  }
  await fs.mkdir(output, { recursive: true });
  const outputReal = await fs.realpath(output);
  if (!outputReal.startsWith(path.join(root, 'artifacts') + path.sep)) {
    throw new Error('Graph output cannot escape artifacts/ through a symbolic link');
  }
  const manifestFile = path.join(output, 'manifest.json');
  try { await fs.access(manifestFile); throw new Error('Graph snapshot already exists; select a new run output directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  const manifest = {
    version: 1,
    kind: 'playwright-validation-graphs',
    status: 'running',
    generatedAt: new Date().toISOString(),
    sourceManifest: null,
    counts: null,
    artifacts: {},
    commands: [],
    pipeline: pipeline.map(file => `scripts/${file}`),
    limitations: [
      'Static graph discovery spans the repository, not only the six demo tests.',
      'Coverage uses names, routes, roles and helper mentions; it does not prove assertions or acceptance.',
      'Duplicate and overlap findings are candidates for review, not proven redundant tests.',
      'Curated captures and adapter enrichments may be stale even when the generated manifest matches source.'
    ]
  };
  try {
    const original = await describe(root, path.join(root, trackedManifest));
    const originalSource = await describe(root, path.join(root, appSource));
    const env = { ...process.env, SOURCE_MANIFEST_SYNC: '1' };
    // This fixed demo never invokes an adopter's external source generator.
    for (const key of ['SOURCE_MANIFEST_COMMAND', 'SOURCE_MANIFEST_ADAPTER', 'SOURCE_MANIFEST', 'SOURCE_APP_ROOT', 'SOURCE_ENTRY', 'SOURCE_APP_NAME', 'SOURCE_APP_URL', 'APP_BASE_URL']) delete env[key];
    const check = await execute(root, ['scripts/sync-source-manifest.mjs', '--check', '--adapter=sample-crm', `--output=${trackedManifest}`], env);
    manifest.commands.push(check);
    const stale = check.exitCode === 1 && check.stderr.includes(`Source manifest is stale: ${trackedManifest}`);
    if (check.exitCode !== 0 && !stale) throw new Error('Source manifest freshness check failed; see command receipt');
    let used = original;
    if (stale) {
      check.outcome = 'stale-tracked-manifest';
      const generated = await execute(root, ['scripts/sync-source-manifest.mjs', '--print', '--adapter=sample-crm', `--output=${trackedManifest}`], env);
      manifest.commands.push(generated);
      if (generated.exitCode !== 0) throw new Error('Local source manifest generation failed; see command receipt');
      const parsed = JSON.parse(generated.stdout);
      if (!Array.isArray(parsed.routes) || !Array.isArray(parsed.users)) throw new Error('Generated source manifest lacks routes/users');
      const localManifest = path.join(output, 'source-manifest.json');
      await fs.writeFile(localManifest, generated.stdout);
      used = await describe(root, localManifest);
    }
    manifest.sourceManifest = { trackedFresh: !stale, tracked: original, used, generatedLocally: stale, source: originalSource };
    env.SOURCE_MANIFEST = used.path;
    const view = await execute(root, ['scripts/graph-view.mjs'], env);
    view.pipeline = manifest.pipeline;
    manifest.commands.push(view);
    if (view.exitCode !== 0) throw new Error('Existing graph pipeline failed; see command receipt');

    const names = { source: 'source-graph.json', tests: 'test-graph.json', coverage: 'coverage-graph.json', duplicates: 'duplicates.json' };
    const graphs = {};
    await fs.mkdir(path.join(output, 'data'), { recursive: true });
    for (const [name, filename] of Object.entries(names)) {
      const bytes = await fs.readFile(path.join(root, 'graphs/data', filename));
      graphs[name] = JSON.parse(bytes);
      await fs.writeFile(path.join(output, 'data', filename), bytes);
      manifest.artifacts[name] = await describe(root, path.join(output, 'data', filename));
    }
    if (!Array.isArray(graphs.source.nodes) || !Array.isArray(graphs.tests.testCases) || !Array.isArray(graphs.coverage.gaps) || !Array.isArray(graphs.duplicates.duplicates)) {
      throw new Error('Graph pipeline produced invalid source/test/coverage/duplicate artifacts');
    }
    const html = await fs.readFile(path.join(root, 'graphs/index.html'), 'utf8');
    if (!html.includes('id="graph-data"')) throw new Error('Graph view lacks its visual graph data');
    const rootHref = relative(output, root);
    // Preserve source-file links when copying the existing HTML into a run snapshot.
    await fs.writeFile(path.join(output, 'index.html'), html.replace(/href="\.\.\/([^\"]*)"/g, (_, target) => `href="${rootHref}/${target}"`));
    manifest.artifacts.view = await describe(root, path.join(output, 'index.html'));
    manifest.counts = {
      sourceNodes: graphs.source.nodes.length,
      sourceEdges: graphs.source.edges.length,
      candidateTests: graphs.source.possibleTests.length,
      testCases: graphs.tests.testCases.length,
      routes: graphs.coverage.summary.routes,
      heuristicCoveredRoutes: graphs.coverage.summary.coveredRoutes,
      gaps: graphs.coverage.gaps.length,
      duplicateCandidates: graphs.duplicates.duplicates.length,
      overlapCandidates: graphs.duplicates.overlaps.length
    };
    for (const before of [original, originalSource]) {
      if ((await describe(root, path.join(root, before.path))).sha256 !== before.sha256) throw new Error(`Graph stage changed source input: ${before.path}`);
    }
    manifest.status = 'passed';
    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  } catch (error) {
    manifest.status = 'failed';
    manifest.error = error.message;
    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    throw new Error(`${error.message}; graph receipts: ${relative(root, manifestFile)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output-dir') {
    console.error('Usage: node scripts/validation-graphs.mjs --output-dir artifacts/validation-demo/RUN/graphs');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await validationGraphs({ outputDir: args[1] }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
