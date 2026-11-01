import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const defaultToolkit = fileURLToPath(new URL('../', import.meta.url));
const configName = '.playwright-agent.local.json';
const skillName = '.agents/skills/playwright-agent/SKILL.md';
const copilotName = '.github/agents/playwright.agent.md';
const portable = value => value.split(path.sep).join('/');
const inside = (root, file) => file.startsWith(root + path.sep);

async function existingFile(file) {
  try {
    const info = await fs.lstat(file);
    if (!info.isFile()) throw new Error(`Expected a regular file: ${path.basename(file)}`);
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function checkParents(repo, relativeFile) {
  let current = repo;
  for (const part of relativeFile.split('/').slice(0, -1)) {
    current = path.join(current, part);
    try {
      const info = await fs.lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Destination parent must be a real directory: ${relativeFile}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function guidance(toolkitLink, relativeConfig) {
  return `Read the [canonical Playwright Agent workflow](<${toolkitLink}>) and resolve its references relative to that toolkit skill.

The selected target is **the adopter repository containing this shim**, not the toolkit repository or its sample CRM. This explicit target overrides the canonical skill's default repository. Read this target's local AGENTS.md when present, package.json, and existing \`${relativeConfig}\` before changing tests. Use the target's existing helpers, fixtures, page objects, test locations and context equivalents; do not copy the toolkit framework or require its example context maps.

Select the user's ticket, acceptance criteria or task folder explicitly. No requirements document, provider or workload is selected by onboarding. Keep assessment-only requests read-only. Build an evidence-linked acceptance matrix, reuse existing coverage, and verify only through the target's real commands. Missing execution or assertions remain unknown; report product/environment gaps without weakening tests.

For downloaded tickets, PDFs, flows or Excel RTMs, follow the canonical workflow's document-intake guide. Use the toolkit's intake command with this adopter as --repo. The agent handles structured draft files, shows source-linked criteria and clarifications to the tester, and accepts only the exact reviewed interpretation after explicit user confirmation. Keep originals and reports private; intake does not prove product acceptance or execute tests.

Use the host coding agent's existing model, file edits, terminal and available browser tools. Code Mode is optional and exposes only its configured tools; it is not a generic test-writing API. Do not install dependencies, enable providers, run mutation campaigns, register global MCP servers or hooks, publish, or deploy as a side effect of selecting this agent. Follow the target's permissions and instructions.
`;
}

export async function configureAgent({ repo, playwrightConfig = 'playwright.config.ts', client = 'both', toolkitRoot = defaultToolkit }) {
  if (!repo) throw new Error('--repo is required');
  if (!['codex', 'copilot', 'both'].includes(client)) throw new Error('--client must be codex, copilot or both');
  const target = await fs.realpath(path.resolve(repo));
  if (!(await fs.stat(target)).isDirectory()) throw new Error('--repo must select an existing repository directory');
  const toolkit = await fs.realpath(path.resolve(toolkitRoot));
  const canonicalSkill = path.join(toolkit, skillName);
  if (await existingFile(canonicalSkill) === null) throw new Error('Toolkit canonical Playwright Agent skill is missing');
  const packageText = await existingFile(path.join(target, 'package.json'));
  if (packageText === null) throw new Error('Selected repository must already contain package.json');
  let pkg;
  try { pkg = JSON.parse(packageText); } catch { throw new Error('Selected repository package.json must be valid JSON'); }
  const declared = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    .some(section => typeof pkg[section]?.['@playwright/test'] === 'string' && pkg[section]['@playwright/test'].trim());
  if (!declared) throw new Error('Selected repository must already declare @playwright/test; onboarding does not install a test framework');
  if (typeof playwrightConfig !== 'string' || !playwrightConfig.trim() || path.isAbsolute(playwrightConfig)) {
    throw new Error('--playwright-config must name an existing relative file inside the selected repository');
  }
  const configFile = path.resolve(target, playwrightConfig);
  if (!inside(target, configFile)) throw new Error('--playwright-config must stay inside the selected repository');
  let resolvedConfig;
  try { resolvedConfig = await fs.realpath(configFile); }
  catch { throw new Error('Playwright config does not exist; select it explicitly with --playwright-config'); }
  if (!inside(target, resolvedConfig) || !(await fs.stat(resolvedConfig)).isFile()) {
    throw new Error('--playwright-config must resolve to an existing file inside the selected repository');
  }
  const relativeConfig = portable(path.relative(target, configFile));
  const toolkitPath = portable(path.relative(target, toolkit)) || '.';
  const localConfig = { version: 1, toolkitPath, playwrightConfig: relativeConfig };
  const planned = [{ file: configName, content: JSON.stringify(localConfig, null, 2) + '\n', json: localConfig }];
  if (client === 'codex' || client === 'both') {
    const link = portable(path.relative(path.dirname(path.join(target, skillName)), canonicalSkill));
    planned.push({ file: skillName, content: `---\nname: playwright-agent\ndescription: Create, update or assess tests in this existing Playwright project with acceptance and execution evidence.\n---\n\n# Playwright Agent for this project\n\n${guidance(link, relativeConfig)}` });
  }
  if (client === 'copilot' || client === 'both') {
    const link = portable(path.relative(path.dirname(path.join(target, copilotName)), canonicalSkill));
    planned.push({ file: copilotName, content: `---\nname: Playwright Agent\ndescription: Create, update or assess this project's existing Playwright tests with an acceptance matrix and real evidence.\n---\n\n${guidance(link, relativeConfig)}` });
  }

  // Check every selected destination before creating directories or changing any file.
  const unchanged = [];
  for (const item of planned) {
    await checkParents(target, item.file);
    const previous = await existingFile(path.join(target, item.file));
    if (previous === null) continue;
    let equal = previous === item.content;
    if (item.json) {
      try { equal = isDeepStrictEqual(JSON.parse(previous), item.json); } catch { equal = false; }
    }
    if (!equal) throw new Error(`Refusing to overwrite existing different ${item.file}; review the existing configuration first`);
    unchanged.push(item.file);
  }
  const ignorePath = path.join(target, '.gitignore');
  const ignore = await existingFile(ignorePath);
  const hasIgnore = (ignore ?? '').split(/\r?\n/).some(line => [configName, '/' + configName].includes(line.trim()));
  const created = [];
  for (const item of planned.filter(item => !unchanged.includes(item.file))) {
    const destination = path.join(target, item.file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, item.content, { flag: 'wx' });
    created.push(item.file);
  }
  if (!hasIgnore) {
    const newline = ignore?.includes('\r\n') ? '\r\n' : '\n';
    await fs.appendFile(ignorePath, `${ignore && !ignore.endsWith('\n') ? newline : ''}${configName}${newline}`);
  }
  return { version: 1, repo: target, toolkitPath, playwrightConfig: relativeConfig, client, created, unchanged, gitignoreUpdated: !hasIgnore };
}

function parseArgs(args) {
  const result = {};
  const names = { '--repo': 'repo', '--playwright-config': 'playwrightConfig', '--client': 'client' };
  for (let i = 0; i < args.length; i += 2) {
    const key = names[args[i]];
    if (!key || !args[i + 1] || args[i + 1].startsWith('--') || result[key] !== undefined) {
      throw new Error('Usage: node scripts/configure-agent.mjs --repo PATH [--playwright-config RELATIVE_FILE] [--client codex|copilot|both]');
    }
    result[key] = args[i + 1];
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await configureAgent(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
