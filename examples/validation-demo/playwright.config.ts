import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const productRoot = fileURLToPath(new URL('../../', import.meta.url));
const appUrl = 'http://127.0.0.1:4287';
const evidenceDir = process.env.DEMO_EVIDENCE_DIR ?? path.join(productRoot, 'artifacts/validation-demo/browser');

// The existing CRM specs deliberately skip when no target is selected. This
// dedicated demo always selects its own synthetic, loopback-only application.
process.env.APP_BASE_URL = appUrl;

export default defineConfig({
  testDir: path.join(productRoot, 'tests'),
  testMatch: ['**/sample-crm.spec.ts', '**/validation-login.spec.ts'],
  outputDir: path.join(evidenceDir, 'test-results'),
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(evidenceDir, 'results.json') }],
    ['html', { outputFolder: path.join(evidenceDir, 'report'), open: 'never' }]
  ],
  use: {
    baseURL: appUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    cwd: productRoot,
    command: `"${process.execPath}" examples/sample-crm-app/server.mjs`,
    env: { PORT: '4287' },
    url: `${appUrl}/login`,
    reuseExistingServer: false,
    timeout: 30_000
  }
});
