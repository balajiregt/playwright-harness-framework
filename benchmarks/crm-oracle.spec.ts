import { test, expect } from '../fixtures/base.fixture';
test.beforeEach(async ({ sampleCrmPage }) => { await sampleCrmPage.gotoLogin(); });
test('viewer export denied in UI and API', async ({ page, sampleCrmPage, sampleCrmAssertions }) => {
  await sampleCrmPage.signInAs('viewer'); await sampleCrmPage.gotoAccounts(); await sampleCrmAssertions.expectViewerAccountsReadOnly();
  const response = await page.request.get('/api/accounts/export');
  expect(response.status()).toBe(403); expect(await response.json()).toEqual({ error: 'Access denied' });
});
test('manager exports exact account fixture', async ({ page, sampleCrmPage }) => {
  await sampleCrmPage.signInAs('manager'); await expect(page.getByTestId('dashboard-page')).toBeVisible();
  const response = await page.request.get('/api/accounts/export');
  expect(response.status()).toBe(200); expect(await response.json()).toEqual({ format: 'json', accounts: [{ id: 'a1', name: 'Synthetic North Account' }, { id: 'a2', name: 'Synthetic South Account' }] });
});
test('unauthenticated export denied', async ({ request }) => {
  const response = await request.get('/api/accounts/export'); expect(response.status()).toBe(401); expect(await response.json()).toEqual({ error: 'Authentication required' });
});
test('manager direct admin route denied', async ({ sampleCrmPage, sampleCrmAssertions, page }) => {
  await sampleCrmPage.signInAs('manager'); await expect(page.getByTestId('dashboard-page')).toBeVisible();
  await sampleCrmPage.gotoAdminUsers(); await sampleCrmAssertions.expectPermissionDenied();
});
