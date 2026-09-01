import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathExists, readText, writeJson } from './graph-utils.mjs';

const options = parseArgs(process.argv.slice(2));
const flags = new Set(options.flags);
const write = flags.has('write') || (!flags.has('check') && !flags.has('print'));
const check = flags.has('check');
const print = flags.has('print');
const quiet = flags.has('quiet');
const manifestPath = options.values.output ?? options.values.manifest ?? process.env.SOURCE_MANIFEST ?? 'source-manifest.json';
const adapterName = options.values.adapter ?? process.env.SOURCE_MANIFEST_ADAPTER ?? 'generic-source';
const syncDisabled = process.env.SOURCE_MANIFEST_SYNC === '0';

function normalizeJson(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function runExternalSync(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: quiet ? 'pipe' : 'inherit',
      env: process.env
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`SOURCE_MANIFEST_COMMAND failed with exit code ${code}.`));
    });
  });
}

async function loadAdapter(name) {
  const adapterPath = name.includes('/') || name.endsWith('.mjs')
    ? name
    : `scripts/source-adapters/${name}.mjs`;
  const resolved = path.resolve(process.cwd(), adapterPath);

  if (!(await pathExists(adapterPath))) {
    throw new Error(
      [
        `Source manifest adapter not found: ${adapterPath}`,
        'Set SOURCE_MANIFEST_COMMAND to your app-specific generator command,',
        'or set SOURCE_MANIFEST_ADAPTER to a file that exports buildManifest().'
      ].join(' ')
    );
  }

  const module = await import(`file://${resolved}`);
  if (typeof module.buildManifest !== 'function') {
    throw new Error(`Source manifest adapter must export buildManifest(): ${adapterPath}`);
  }
  return module;
}

if (syncDisabled) {
  if (!quiet) console.log('Source manifest sync skipped because SOURCE_MANIFEST_SYNC=0.');
  process.exit(0);
}

if (process.env.SOURCE_MANIFEST_COMMAND) {
  await runExternalSync(process.env.SOURCE_MANIFEST_COMMAND);
  process.exit(0);
}

const adapter = await loadAdapter(adapterName);
const manifest = await adapter.buildManifest({
  appRoot: options.values.root ?? process.env.SOURCE_APP_ROOT,
  sourceEntry: options.values.entry ?? process.env.SOURCE_ENTRY,
  appName: options.values.name ?? process.env.SOURCE_APP_NAME,
  appUrl: options.values.url ?? process.env.SOURCE_APP_URL ?? process.env.APP_BASE_URL,
  manifestPath
});
const nextContent = normalizeJson(manifest);
const currentContent = (await pathExists(manifestPath)) ? await readText(manifestPath) : null;

if (print) {
  process.stdout.write(nextContent);
  process.exit(0);
}

if (check) {
  if (currentContent === nextContent) {
    if (!quiet) console.log(`Source manifest is up to date: ${manifestPath}`);
    process.exit(0);
  }

  console.error(`Source manifest is stale: ${manifestPath}`);
  console.error('Run npm run source:manifest to refresh it, or set SOURCE_MANIFEST_COMMAND for your app.');
  process.exit(1);
}

if (currentContent === nextContent) {
  if (!quiet) console.log(`Source manifest already up to date: ${manifestPath}`);
} else if (write) {
  await writeJson(manifestPath, manifest);
  if (!quiet) console.log(`Updated source manifest: ${manifestPath}`);
}

function parseArgs(argv) {
  const values = {};
  const flags = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const normalized = arg.slice(2);
    if (normalized.includes('=')) {
      const [key, ...valueParts] = normalized.split('=');
      values[key] = valueParts.join('=');
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      values[normalized] = next;
      index += 1;
    } else {
      flags.push(normalized);
    }
  }

  return { flags, values };
}
