# CRM-DEMO-001 — synthetic validation epic

This is authored demonstration material for the bundled Sample CRM. It is not
a customer requirement, a production identity policy or evidence of execution.

LOGIN-VALID: A seeded admin using the correct synthetic password must reach the CRM dashboard.

LOGIN-INVALID: An incorrect password must display Invalid credentials and keep the user on the login page.

VIEWER-READONLY: A viewer must see the read-only accounts banner and the Export accounts button must be disabled.

MANAGER-ACCESS: A manager must have enabled Dashboard, Accounts, Opportunities and Reports navigation, with Leads and Admin users navigation disabled.

LEAD-CREATE: A sales user must see required-field validation before creating a lead with a name, email and source.

OPPORTUNITY-CREATE: A manager must be able to create an opportunity with a name and numeric value.

REPORT-RETRY: A manager must be able to retry a failed revenue report and see that the report is ready.

DASHBOARD-METRIC: The synthetic dashboard open-pipeline metric must display $842k.

The first seven criteria correspond to existing example assertions plus the
dedicated invalid-login test. The metric criterion intentionally has no existing
value assertion: it is a known coverage gap to demonstrate a surviving fault.
A healthy test run does not establish this criterion. The mutation catalogue
must remain separate from test requirements and must not be presented as proof
until baseline, activation, repeated test execution and restoration are observed.
