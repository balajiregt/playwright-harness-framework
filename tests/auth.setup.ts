import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const authFile = path.resolve('playwright/.auth/user.json');

setup('authenticate template user @auth', async ({ playwright }) => {
  await fs.mkdir(path.dirname(authFile), { recursive: true });

  if (!process.env.LOGIN_URL) {
    await fs.writeFile(authFile, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    setup.info().annotations.push({
      type: 'auth',
      description: 'LOGIN_URL not set; wrote empty template storageState.'
    });
    return;
  }

  const username = process.env.LOGIN_USERNAME;
  const password = process.env.LOGIN_PASSWORD;

  if (!username || !password) {
    throw new Error('LOGIN_URL is set, so LOGIN_USERNAME and LOGIN_PASSWORD must also be set.');
  }

  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ storageState: undefined });

  await page.goto(process.env.LOGIN_URL);
  await page.locator(process.env.LOGIN_USERNAME_SELECTOR ?? 'input[name="username"]').fill(username);
  await page.locator(process.env.LOGIN_PASSWORD_SELECTOR ?? 'input[name="password"]').fill(password);
  await page.locator(process.env.LOGIN_SUBMIT_SELECTOR ?? 'button[type="submit"]').click();

  if (process.env.LOGIN_SUCCESS_URL_PATTERN) {
    await page.waitForURL(new RegExp(process.env.LOGIN_SUCCESS_URL_PATTERN));
  } else if (process.env.APP_BASE_URL) {
    await page.waitForURL(new RegExp(process.env.APP_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } else {
    await expect(page).toHaveURL(/.+/);
  }

  await page.context().storageState({ path: authFile });
  await browser.close();
});
