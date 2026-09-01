import { type Locator, type Page } from '@playwright/test';

type CrmRole = 'admin' | 'manager' | 'sales' | 'viewer';
type CrmSection = 'Dashboard' | 'Leads' | 'Accounts' | 'Opportunities' | 'Reports' | 'Admin users';

const seededUsers: Record<CrmRole, { username: string; password: string }> = {
  admin: { username: 'admin@example.com', password: 'password' },
  manager: { username: 'manager@example.com', password: 'password' },
  sales: { username: 'sales@example.com', password: 'password' },
  viewer: { username: 'viewer@example.com', password: 'password' }
};

export class SampleCrmPage {
  readonly page: Page;
  readonly loginPage: Locator;
  readonly dashboardPage: Locator;
  readonly leadsPage: Locator;
  readonly accountsPage: Locator;
  readonly opportunitiesPage: Locator;
  readonly reportsPage: Locator;
  readonly adminUsersPage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loginPage = page.getByTestId('login-page');
    this.dashboardPage = page.getByTestId('dashboard-page');
    this.leadsPage = page.getByTestId('leads-page');
    this.accountsPage = page.getByTestId('accounts-page');
    this.opportunitiesPage = page.getByTestId('opportunities-page');
    this.reportsPage = page.getByTestId('reports-page');
    this.adminUsersPage = page.getByTestId('admin-users-page');
  }

  navButton(section: CrmSection) {
    return this.page.getByRole('navigation', { name: 'CRM sections' }).getByRole('button', { name: section });
  }

  async gotoLogin() {
    await this.page.goto('/login');
  }

  async signInAs(role: CrmRole) {
    const user = seededUsers[role];
    await this.page.getByLabel('Email').fill(user.username);
    await this.page.getByLabel('Password').fill(user.password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }

  async gotoDashboard() {
    await this.page.goto('/crm/dashboard');
  }

  async gotoLeads() {
    await this.page.goto('/crm/leads');
  }

  async gotoAccounts() {
    await this.page.goto('/crm/accounts');
  }

  async gotoOpportunities() {
    await this.page.goto('/crm/opportunities');
  }

  async gotoReports() {
    await this.page.goto('/crm/reports');
  }

  async gotoAdminUsers() {
    await this.page.goto('/crm/admin/users');
  }

  async openSection(section: CrmSection) {
    await this.navButton(section).click();
  }

  async createLeadWithoutRequiredFields() {
    await this.page.getByRole('button', { name: 'Create lead' }).click();
  }

  async createLead(name: string, email: string, source: string) {
    await this.page.getByLabel('Lead name').fill(name);
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Source').selectOption(source);
    await this.page.getByRole('button', { name: 'Create lead' }).click();
  }

  async createOpportunity(name: string, value: string) {
    await this.page.getByLabel('Opportunity name').fill(name);
    await this.page.getByLabel('Deal value').fill(value);
    await this.page.getByRole('button', { name: 'Create opportunity' }).click();
  }

  async retryReport() {
    await this.page.getByRole('button', { name: 'Retry report' }).click();
  }
}
