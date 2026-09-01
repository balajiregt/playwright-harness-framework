# Curated Playwright CLI Captures

Store reusable `playwright-cli` page context here.

Use YAML snapshots for accessibility-tree context:

```bash
playwright-cli open http://127.0.0.1:4173/login --headed
playwright-cli snapshot --filename=contexts/captures/crm-login-loaded.yml
```

Use screenshots only when visual evidence matters:

```bash
playwright-cli screenshot --filename=contexts/captures/crm-login-loaded.png
```

Guidelines:

- Capture meaningful page or flow states, not every intermediate action.
- Re-snapshot after navigation or DOM-changing actions.
- Use concise names: `<app>-<page-or-flow>-<state>.yml`.
- Prefer capture workflows for repeated role or flow captures:
  `npm run capture:recipe -- --list`, then `npm run capture:crm:manager`.
- Treat element refs as temporary; convert them into Playwright locators in
  page objects.
- Keep auto-generated `.playwright-cli/` files out of Git unless a capture is
  intentionally curated here.

Current curated examples:

- `crm-login-loaded.yml`: Sample CRM anonymous login page.
- `crm-login-loaded.png`: Sample CRM login visual context.
- `crm-admin-dashboard-loaded.yml`: Admin dashboard loaded state.
- `crm-admin-dashboard-loaded.png`: Admin dashboard visual context.
- `crm-sales-leads-empty.yml`: Sales role leads page with empty-state table.
- `crm-viewer-accounts-read-only.yml`: Viewer role accounts read-only state.
- `crm-viewer-admin-users-denied.yml`: Viewer role permission-denied state for
  `/crm/admin/users`.
- `crm-manager-dashboard-loaded.yml`: Manager role dashboard loaded state.
- `crm-manager-dashboard-loaded.png`: Manager role dashboard visual context.
- `crm-manager-leads-denied.yml`: Manager role permission-denied state for
  `/crm/leads`.
- `crm-manager-leads-denied.png`: Manager role leads denial visual context.
- `crm-manager-accounts-loaded.yml`: Manager role accounts loaded state.
- `crm-manager-opportunities-loaded.yml`: Manager role opportunities loaded
  state.
- `crm-manager-reports-error.yml`: Manager role reports error state.
- `crm-manager-admin-users-denied.yml`: Manager role permission-denied state
  for `/crm/admin/users`.
- `crm-manager-admin-users-denied.png`: Manager role admin denial visual
  context.
