import { expect } from '@playwright/test';
import { SampleCrmPage } from '../pages/sample-crm.page';

type CrmSection = 'Dashboard' | 'Leads' | 'Accounts' | 'Opportunities' | 'Reports' | 'Admin users';

export class SampleCrmAssertions {
  constructor(private readonly crmPage: SampleCrmPage) {}

  async expectLoginLoaded() {
    await expect(this.crmPage.loginPage).toBeVisible();
    await expect(this.crmPage.page.getByRole('heading', { name: 'Sign in to Sample CRM' })).toBeVisible();
  }

  async expectDashboardLoadedForRole(role: string) {
    await expect(this.crmPage.dashboardPage).toBeVisible();
    await expect(this.crmPage.page.getByRole('heading', { name: 'CRM Dashboard' })).toBeVisible();
    await expect(this.crmPage.page.getByTestId('active-user')).toContainText(role);
  }

  async expectLeadValidationError() {
    await expect(this.crmPage.page.getByTestId('lead-validation-error')).toBeVisible();
    await expect(this.crmPage.page.getByRole('alert')).toContainText('Lead name, email, and source are required.');
  }

  async expectLeadCreated(name: string) {
    await expect(this.crmPage.page.getByTestId('leads-table')).toContainText(name);
  }

  async expectNavigationButtonsAccess(access: { enabled: CrmSection[]; disabled: CrmSection[] }) {
    for (const section of access.enabled) {
      const button = this.crmPage.navButton(section);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
    }

    for (const section of access.disabled) {
      const button = this.crmPage.navButton(section);
      await expect(button).toBeVisible();
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('aria-disabled', 'true');
    }
  }

  async expectManagerNavigationAccess() {
    await this.expectNavigationButtonsAccess({
      enabled: ['Dashboard', 'Accounts', 'Opportunities', 'Reports'],
      disabled: ['Leads', 'Admin users']
    });
  }

  async expectManagerAccountsAccess() {
    await expect(this.crmPage.accountsPage).toBeVisible();
    await expect(this.crmPage.accountsPage.getByRole('heading', { name: 'Accounts' })).toBeVisible();
    await expect(this.crmPage.page.getByTestId('read-only-banner')).toHaveCount(0);
    await expect(this.crmPage.page.getByRole('button', { name: 'Export accounts' })).toBeVisible();
    await expect(this.crmPage.page.getByRole('button', { name: 'Export accounts' })).toBeEnabled();
  }

  async expectViewerAccountsReadOnly() {
    await expect(this.crmPage.accountsPage).toBeVisible();
    await expect(this.crmPage.page.getByTestId('read-only-banner')).toBeVisible();
    await expect(this.crmPage.page.getByRole('button', { name: 'Export accounts' })).toBeDisabled();
  }

  async expectManagerOpportunitiesAccess() {
    await expect(this.crmPage.opportunitiesPage).toBeVisible();
    await expect(this.crmPage.opportunitiesPage.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
    await expect(this.crmPage.page.getByLabel('Opportunity name')).toBeVisible();
    await expect(this.crmPage.page.getByLabel('Deal value')).toBeVisible();
    await expect(this.crmPage.page.getByRole('button', { name: 'Create opportunity' })).toBeVisible();
    await expect(this.crmPage.page.getByRole('button', { name: 'Create opportunity' })).toBeEnabled();
  }

  async expectOpportunityCreated(name: string) {
    await expect(this.crmPage.page.getByTestId('opportunities-table')).toContainText(name);
  }

  async expectManagerReportsRetryAccess() {
    await expect(this.crmPage.reportsPage).toBeVisible();
    await expect(this.crmPage.reportsPage.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(this.crmPage.page.getByRole('alert')).toContainText('Revenue report failed to load.');
    await expect(this.crmPage.page.getByRole('button', { name: 'Retry report' })).toBeVisible();
    await expect(this.crmPage.page.getByRole('button', { name: 'Retry report' })).toBeEnabled();
  }

  async expectReportDownloadReady() {
    await expect(this.crmPage.page.getByTestId('report-ready')).toContainText('Revenue report is ready.');
    await expect(this.crmPage.page.getByRole('button', { name: 'Download report' })).toBeVisible();
    await expect(this.crmPage.page.getByRole('button', { name: 'Download report' })).toBeEnabled();
  }

  async expectPermissionDenied() {
    await expect(this.crmPage.page.getByTestId('permission-denied-page')).toBeVisible();
    await expect(this.crmPage.page.getByRole('heading', { name: 'Permission denied' })).toBeVisible();
  }

  async expectPermissionDeniedForPath(path: string) {
    await this.expectPermissionDenied();
    await expect(this.crmPage.page.getByText(`You do not have access to ${path}.`)).toBeVisible();
  }
}
