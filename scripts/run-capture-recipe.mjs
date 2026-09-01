import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { pathExists, readText } from './graph-utils.mjs';

const recipesPath = process.env.CAPTURE_RECIPES ?? 'contexts/capture-recipes.yml';
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const listOnly = args.includes('--list');
const skipScreenshots = args.includes('--no-screenshots');
const recipeId = args.find((arg) => !arg.startsWith('--'));

function resolveCli() {
  if (process.env.PLAYWRIGHT_CLI) return process.env.PLAYWRIGHT_CLI;
  const fromPath = spawnSync('sh', ['-lc', 'command -v playwright-cli'], { encoding: 'utf8' }).stdout.trim();
  if (fromPath) return fromPath;
  const localDefault = '/Users/balaji/.npm-global/bin/playwright-cli';
  return localDefault;
}

function appUrl(recipe, route) {
  return new URL(route, recipe.app_url).toString();
}

function commandLine(executable, command, commandArgs) {
  return [executable, command, ...commandArgs].map((part) => (part.includes(' ') ? `"${part}"` : part)).join(' ');
}

function runCli(executable, command, commandArgs) {
  console.log(commandLine(executable, command, commandArgs));
  if (dryRun) return;
  const result = spawnSync(executable, [command, ...commandArgs], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`playwright-cli ${command} failed with exit code ${result.status}`);
  }
}

const document = YAML.parse(await readText(recipesPath));
const recipes = document.recipes ?? {};

if (listOnly) {
  console.log(Object.keys(recipes).join('\n'));
  process.exit(0);
}

if (!recipeId || !recipes[recipeId]) {
  console.error(`Usage: npm run capture:recipe -- <recipe-id> [--dry-run] [--no-screenshots]`);
  console.error(`Available capture workflows:\n${Object.keys(recipes).map((id) => `- ${id}`).join('\n')}`);
  process.exit(1);
}

const cli = resolveCli();
if (!(await pathExists(cli)) && !spawnSync('sh', ['-lc', `command -v ${cli}`], { encoding: 'utf8' }).stdout.trim()) {
  console.error(`Could not find playwright-cli. Set PLAYWRIGHT_CLI=/path/to/playwright-cli or install @playwright/cli globally.`);
  process.exit(1);
}

const recipe = recipes[recipeId];
const loginUrl = appUrl(recipe, recipe.login_route ?? '/login');
const captures = recipe.captures ?? [];

console.log(`Running capture workflow ${recipeId}`);
console.log(`Output folder: contexts/captures`);

await fs.mkdir(path.resolve(process.cwd(), 'contexts/captures'), { recursive: true });

let opened = false;

try {
  runCli(cli, 'open', [loginUrl]);
  opened = true;
  runCli(cli, 'localstorage-clear', []);

  if (recipe.auth?.strategy === 'localStorage') {
    runCli(cli, 'localstorage-set', [recipe.auth.key, JSON.stringify(recipe.auth.value)]);
  } else {
    throw new Error(`Unsupported auth strategy: ${recipe.auth?.strategy ?? 'missing'}`);
  }

  for (const capture of captures) {
    runCli(cli, 'goto', [appUrl(recipe, capture.route)]);
    runCli(cli, 'snapshot', [`--filename=contexts/captures/${capture.name}.yml`]);
    if (capture.screenshot && !skipScreenshots) {
      runCli(cli, 'screenshot', [`--filename=contexts/captures/${capture.name}.png`]);
    }
  }
} finally {
  if (opened) runCli(cli, 'close', []);
}
console.log(`Completed capture workflow ${recipeId} with ${captures.length} page states.`);
