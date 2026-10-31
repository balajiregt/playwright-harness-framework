import { test, expect } from '../fixtures/base.fixture';

test('invalid CRM password keeps the user on the login page @auth @crm @validation-demo', async ({
  page,
  sampleCrmPage,
  sampleCrmAssertions
}) => {
  await page.context().clearCookies();
  await sampleCrmPage.gotoLogin();
  await page.evaluate(() => localStorage.clear());
  await sampleCrmAssertions.expectLoginLoaded();

  await page.getByLabel('Email').fill('viewer@example.com');
  await page.getByLabel('Password').fill('incorrect-synthetic-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByTestId('login-error')).toHaveText('Invalid credentials');
  await expect(page.getByTestId('login-error')).toBeVisible();
  await expect(sampleCrmPage.loginPage).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(sampleCrmPage.dashboardPage).toHaveCount(0);
});
