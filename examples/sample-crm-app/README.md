# Sample Agentic CRM App

This app is a demo target for the Playwright agentic harness. It is not required
when teams use the harness against their own applications.

Start it with:

```bash
npm run sample:crm
```

Run the focused Playwright example flows from another terminal:

```bash
APP_BASE_URL=http://127.0.0.1:4173 npm run sample:crm:test
```

Regenerate the source-aware graph report:

```bash
npm run graph:view
```

Default URL:

```text
http://127.0.0.1:4173
```

Seeded users all use password `password`:

- `admin@example.com`
- `manager@example.com`
- `sales@example.com`
- `viewer@example.com`

The app intentionally includes role guards, stable test ids, accessible labels,
form validation, empty states, loading state, error state, and permission-denied
state so graph intelligence can discover possible test cases and coverage gaps.
