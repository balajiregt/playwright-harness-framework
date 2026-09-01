import { test as base, expect } from '@playwright/test';
import { SampleCrmAssertions } from '../assertions/sample-crm.assertions';
import { SampleCrmPage } from '../pages/sample-crm.page';

type AgenticFixtures = {
  sampleCrmPage: SampleCrmPage;
  sampleCrmAssertions: SampleCrmAssertions;
};

export const test = base.extend<AgenticFixtures>({
  sampleCrmPage: async ({ page }, use) => {
    await use(new SampleCrmPage(page));
  },
  sampleCrmAssertions: async ({ sampleCrmPage }, use) => {
    await use(new SampleCrmAssertions(sampleCrmPage));
  }
});

export { expect };
