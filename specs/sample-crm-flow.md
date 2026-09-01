# Sample CRM Source-Aware Flow

This example flow demonstrates how V2 graph intelligence connects app source,
flow intent, page objects, assertion helpers, tags, tests, and CLI evidence.

## Flow: admin dashboard smoke

Tags: `@smoke`, `@auth`, `@crm`

1. Open `/login`.
2. Sign in as `admin@example.com`.
3. Verify `/crm/dashboard` loads.
4. Verify the active user role is `admin`.

## Flow: sales lead validation

Tags: `@regression`, `@crm`

1. Sign in as `sales@example.com`.
2. Open `/crm/leads`.
3. Submit the lead form with required fields empty.
4. Verify the validation alert.
5. Create a valid lead.
6. Verify the lead appears in the table.

## Flow: viewer role guard

Tags: `@regression`, `@auth`, `@crm`

1. Sign in as `viewer@example.com`.
2. Open `/crm/accounts`.
3. Verify read-only account access.
4. Attempt to open `/crm/admin/users`.
5. Verify permission denied.

## Graph Expectations

- Source graph discovers all CRM routes, roles, actions, fields, and states from
  `examples/sample-crm-app/source-manifest.json`.
- Test graph links this flow to `tests/sample-crm.spec.ts`,
  `pages/sample-crm.page.ts`, and `assertions/sample-crm.assertions.ts`.
- Coverage graph should show these flows as covered while still identifying
  missing reports, opportunities, manager, and deeper admin-user coverage.
