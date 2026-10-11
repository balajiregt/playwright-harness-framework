import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: 'crm-oracle.spec.ts', workers: 1, retries: 0,
  outputDir: '../benchmark-results/oracle-traces',
  reporter: [['list'], ['json', { outputFile: fileURLToPath(new URL('../' + (process.env.BENCHMARK_REPORT ?? 'benchmark-results/oracle.json'), import.meta.url)) }]],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4273', trace: 'retain-on-failure' },
  webServer: { cwd: fileURLToPath(new URL('../', import.meta.url)), command: 'PORT=4273 node examples/sample-crm-app/server.mjs', url: 'http://127.0.0.1:4273', reuseExistingServer: false }
});
