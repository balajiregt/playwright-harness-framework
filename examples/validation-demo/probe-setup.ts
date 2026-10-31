import { expect, type Page } from '@playwright/test';
import { SampleCrmPage } from '../../pages/sample-crm.page';

export async function setupViewer(page: Page, roles: string[]): Promise<void> {
  if (roles.length !== 1 || roles[0] !== 'viewer') {
    throw new Error('The synthetic CRM validation probe supports only the viewer role.');
  }
  const crm = new SampleCrmPage(page);
  await crm.gotoLogin();
  await crm.signInAs('viewer');
  await expect(page.getByTestId('active-user')).toHaveText('Vik Viewer · viewer');
  await expect(page.getByTestId('metric-open-pipeline')).toBeVisible();
}
