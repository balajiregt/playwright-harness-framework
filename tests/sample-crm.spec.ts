import { test } from '../fixtures/base.fixture';

test.describe('Sample CRM source-aware flows @crm', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.APP_BASE_URL, 'Set APP_BASE_URL=http://127.0.0.1:4173 to run sample CRM flows.');
    await page.context().clearCookies();
    await page.goto('/login');
    await page.evaluate(() => localStorage.clear());
  });

  test('admin can sign in and view the dashboard @smoke @auth @crm', async ({
    sampleCrmPage,
    sampleCrmAssertions
  }, testInfo) => {
    testInfo.annotations.push({
      type: 'graph',
      description: 'source route /crm/dashboard -> LoginPage -> DashboardPage'
    });

    await sampleCrmAssertions.expectLoginLoaded();
    await sampleCrmPage.signInAs('admin');
    await sampleCrmAssertions.expectDashboardLoadedForRole('admin');
  });

  test('sales sees lead validation before creating a lead @regression @crm', async ({
    sampleCrmPage,
    sampleCrmAssertions
  }) => {
    await sampleCrmPage.signInAs('sales');
    await sampleCrmPage.gotoLeads();
    await sampleCrmPage.createLeadWithoutRequiredFields();
    await sampleCrmAssertions.expectLeadValidationError();
    await sampleCrmPage.createLead('Ada Lovelace', 'ada@example.com', 'Referral');
    await sampleCrmAssertions.expectLeadCreated('Ada Lovelace');
  });

  test('manager sees enabled and blocked CRM navigation buttons @regression @auth @crm @accessibility', async ({
    sampleCrmPage,
    sampleCrmAssertions
  }, testInfo) => {
    testInfo.annotations.push({
      type: 'graph',
      description: 'manager role access matrix: dashboard/accounts/opportunities/reports allowed, leads/admin users denied'
    });

    await sampleCrmPage.signInAs('manager');
    await sampleCrmAssertions.expectDashboardLoadedForRole('manager');
    await sampleCrmAssertions.expectManagerNavigationAccess();
  });

  test('manager can use allowed action buttons and is denied restricted routes @regression @auth @crm @accessibility', async ({
    sampleCrmPage,
    sampleCrmAssertions
  }, testInfo) => {
    testInfo.annotations.push({
      type: 'graph',
      description: 'source role manager -> accounts/opportunities/reports actions and restricted leads/admin-users routes'
    });

    await sampleCrmPage.signInAs('manager');

    await sampleCrmPage.openSection('Accounts');
    await sampleCrmAssertions.expectManagerAccountsAccess();
    await sampleCrmAssertions.expectManagerNavigationAccess();

    await sampleCrmPage.openSection('Opportunities');
    await sampleCrmAssertions.expectManagerOpportunitiesAccess();
    await sampleCrmPage.createOpportunity('Enterprise renewal', '125000');
    await sampleCrmAssertions.expectOpportunityCreated('Enterprise renewal');
    await sampleCrmAssertions.expectManagerNavigationAccess();

    await sampleCrmPage.openSection('Reports');
    await sampleCrmAssertions.expectManagerReportsRetryAccess();
    await sampleCrmPage.retryReport();
    await sampleCrmAssertions.expectReportDownloadReady();
    await sampleCrmAssertions.expectManagerNavigationAccess();

    await sampleCrmPage.gotoLeads();
    await sampleCrmAssertions.expectPermissionDeniedForPath('/crm/leads');
    await sampleCrmPage.gotoAdminUsers();
    await sampleCrmAssertions.expectPermissionDeniedForPath('/crm/admin/users');
  });

  test('viewer has read-only accounts and denied admin users @regression @auth @crm', async ({
    sampleCrmPage,
    sampleCrmAssertions
  }) => {
    await sampleCrmPage.signInAs('viewer');
    await sampleCrmPage.gotoAccounts();
    await sampleCrmAssertions.expectViewerAccountsReadOnly();
    await sampleCrmPage.gotoAdminUsers();
    await sampleCrmAssertions.expectPermissionDenied();
  });
});
