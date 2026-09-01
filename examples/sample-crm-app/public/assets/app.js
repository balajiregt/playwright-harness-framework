const users = {
  admin: {
    username: 'admin@example.com',
    password: 'password',
    role: 'admin',
    displayName: 'Asha Admin',
    routes: ['/crm/dashboard', '/crm/leads', '/crm/accounts', '/crm/opportunities', '/crm/reports', '/crm/admin/users']
  },
  manager: {
    username: 'manager@example.com',
    password: 'password',
    role: 'manager',
    displayName: 'Mira Manager',
    routes: ['/crm/dashboard', '/crm/accounts', '/crm/opportunities', '/crm/reports']
  },
  sales: {
    username: 'sales@example.com',
    password: 'password',
    role: 'sales',
    displayName: 'Sam Sales',
    routes: ['/crm/dashboard', '/crm/leads', '/crm/opportunities']
  },
  viewer: {
    username: 'viewer@example.com',
    password: 'password',
    role: 'viewer',
    displayName: 'Vik Viewer',
    routes: ['/crm/dashboard', '/crm/accounts']
  }
};

const routeConfig = [
  {
    path: '/crm/dashboard',
    label: 'Dashboard',
    component: 'DashboardPage',
    roles: ['admin', 'manager', 'sales', 'viewer'],
    states: ['loaded', 'loading'],
    actions: ['refresh metrics', 'open account detail'],
    testIds: ['dashboard-page', 'metric-open-pipeline', 'metric-at-risk-accounts', 'refresh-dashboard']
  },
  {
    path: '/crm/leads',
    label: 'Leads',
    component: 'LeadsPage',
    roles: ['admin', 'sales'],
    states: ['loaded', 'empty', 'validation-error'],
    actions: ['create lead', 'filter leads'],
    testIds: ['leads-page', 'lead-name-input', 'lead-email-input', 'lead-source-input', 'save-lead']
  },
  {
    path: '/crm/accounts',
    label: 'Accounts',
    component: 'AccountsPage',
    roles: ['admin', 'manager', 'viewer'],
    states: ['loaded', 'read-only'],
    actions: ['open account detail', 'export accounts'],
    testIds: ['accounts-page', 'accounts-table', 'export-accounts']
  },
  {
    path: '/crm/opportunities',
    label: 'Opportunities',
    component: 'OpportunitiesPage',
    roles: ['admin', 'manager', 'sales'],
    states: ['loaded', 'validation-error'],
    actions: ['create opportunity', 'advance stage'],
    testIds: ['opportunities-page', 'opportunity-name-input', 'opportunity-value-input', 'save-opportunity']
  },
  {
    path: '/crm/reports',
    label: 'Reports',
    component: 'ReportsPage',
    roles: ['admin', 'manager'],
    states: ['loaded', 'error'],
    actions: ['download report', 'retry report'],
    testIds: ['reports-page', 'download-report', 'retry-report']
  },
  {
    path: '/crm/admin/users',
    label: 'Admin users',
    component: 'AdminUsersPage',
    roles: ['admin'],
    states: ['loaded', 'permission-denied'],
    actions: ['invite user', 'change role'],
    testIds: ['admin-users-page', 'invite-user', 'role-select']
  }
];

const state = {
  user: JSON.parse(window.localStorage.getItem('crm-user') || 'null'),
  leads: [],
  opportunities: [],
  reportError: true,
  dashboardLoading: false
};

function saveUser(user) {
  state.user = user;
  window.localStorage.setItem('crm-user', JSON.stringify(user));
}

function logout() {
  state.user = null;
  window.localStorage.removeItem('crm-user');
  navigate('/login');
}

function navigate(path) {
  window.history.pushState({}, '', path);
  render();
}

function routeFor(path) {
  return routeConfig.find((route) => route.path === path);
}

function canAccess(path) {
  if (!state.user) return false;
  const route = routeFor(path);
  return Boolean(route && route.roles.includes(state.user.role));
}

function shell(content) {
  if (!state.user) return content;
  const navItems = routeConfig
    .map((route) => {
      const disabled = !route.roles.includes(state.user.role);
      return `<button class="nav-link" data-testid="nav-${route.label.toLowerCase().replaceAll(' ', '-')}" ${disabled ? 'disabled aria-disabled="true"' : ''} data-route="${route.path}">${route.label}</button>`;
    })
    .join('');

  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">Sample Agentic CRM</p>
        <h1>${routeFor(location.pathname)?.label ?? 'CRM'}</h1>
      </div>
      <div class="user-chip" data-testid="active-user">${state.user.displayName} · ${state.user.role}</div>
      <button data-testid="logout" class="secondary">Logout</button>
    </header>
    <nav aria-label="CRM sections" class="sidebar">${navItems}</nav>
    <main id="main" class="content">${content}</main>
  `;
}

function loginPage() {
  return `
    <main class="login-page">
      <section class="login-card" data-testid="login-page">
        <p class="eyebrow">Agentic CRM Demo</p>
        <h1>Sign in to Sample CRM</h1>
        <p>Use seeded users to explore role-aware CRM flows.</p>
        <form data-testid="login-form">
          <label for="username">Email</label>
          <input id="username" name="username" data-testid="username-input" autocomplete="username" />
          <label for="password">Password</label>
          <input id="password" name="password" data-testid="password-input" type="password" autocomplete="current-password" />
          <button type="submit" data-testid="login-submit">Sign in</button>
          <p role="alert" class="error" data-testid="login-error" hidden>Invalid credentials</p>
        </form>
        <div class="seeded-users" data-testid="seeded-users">
          <strong>Seeded users</strong>
          <span>admin@example.com</span>
          <span>manager@example.com</span>
          <span>sales@example.com</span>
          <span>viewer@example.com</span>
          <span>Password: password</span>
        </div>
      </section>
    </main>
  `;
}

function dashboardPage() {
  if (state.dashboardLoading) {
    return shell('<section data-testid="dashboard-page"><h2>Dashboard loading</h2><p data-testid="loading-state">Loading CRM metrics...</p></section>');
  }
  return shell(`
    <section data-testid="dashboard-page">
      <p class="eyebrow">Role-aware overview</p>
      <h2>CRM Dashboard</h2>
      <div class="metrics">
        <article data-testid="metric-open-pipeline"><strong>$842k</strong><span>Open pipeline</span></article>
        <article data-testid="metric-at-risk-accounts"><strong>7</strong><span>At-risk accounts</span></article>
        <article data-testid="metric-new-leads"><strong>${state.leads.length}</strong><span>New leads</span></article>
      </div>
      <button data-testid="refresh-dashboard">Refresh metrics</button>
    </section>
  `);
}

function leadsPage() {
  const rows = state.leads.length
    ? state.leads.map((lead) => `<tr><td>${lead.name}</td><td>${lead.email}</td><td>${lead.source}</td></tr>`).join('')
    : '<tr><td colspan="3" data-testid="leads-empty-state">No leads yet</td></tr>';
  return shell(`
    <section data-testid="leads-page">
      <p class="eyebrow">Sales workspace</p>
      <h2>Leads</h2>
      <form class="inline-form" data-testid="lead-form">
        <label for="lead-name">Lead name</label>
        <input id="lead-name" data-testid="lead-name-input" />
        <label for="lead-email">Email</label>
        <input id="lead-email" data-testid="lead-email-input" />
        <label for="lead-source">Source</label>
        <select id="lead-source" data-testid="lead-source-input">
          <option value="">Choose source</option>
          <option>Web</option>
          <option>Referral</option>
          <option>Event</option>
        </select>
        <button type="submit" data-testid="save-lead">Create lead</button>
        <p role="alert" class="error" data-testid="lead-validation-error" hidden>Lead name, email, and source are required.</p>
      </form>
      <table data-testid="leads-table"><thead><tr><th>Name</th><th>Email</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>
    </section>
  `);
}

function accountsPage() {
  const readOnly = state.user.role === 'viewer';
  return shell(`
    <section data-testid="accounts-page">
      <p class="eyebrow">${readOnly ? 'Read-only access' : 'Account management'}</p>
      <h2>Accounts</h2>
      ${readOnly ? '<p data-testid="read-only-banner">Viewer role can inspect accounts but cannot export them.</p>' : ''}
      <table data-testid="accounts-table"><tbody><tr><td>Acme Health</td><td>Renewal due</td></tr><tr><td>Northstar Bank</td><td>Expansion</td></tr></tbody></table>
      <button data-testid="export-accounts" ${readOnly ? 'disabled aria-disabled="true"' : ''}>Export accounts</button>
    </section>
  `);
}

function opportunitiesPage() {
  const rows = state.opportunities.map((opp) => `<tr><td>${opp.name}</td><td>${opp.value}</td><td>Qualification</td></tr>`).join('');
  return shell(`
    <section data-testid="opportunities-page">
      <p class="eyebrow">Pipeline</p>
      <h2>Opportunities</h2>
      <form class="inline-form" data-testid="opportunity-form">
        <label for="opportunity-name">Opportunity name</label>
        <input id="opportunity-name" data-testid="opportunity-name-input" />
        <label for="opportunity-value">Deal value</label>
        <input id="opportunity-value" data-testid="opportunity-value-input" inputmode="numeric" />
        <button type="submit" data-testid="save-opportunity">Create opportunity</button>
        <p role="alert" class="error" data-testid="opportunity-validation-error" hidden>Opportunity name and numeric value are required.</p>
      </form>
      <table data-testid="opportunities-table"><tbody>${rows || '<tr><td colspan="3">No opportunities yet</td></tr>'}</tbody></table>
    </section>
  `);
}

function reportsPage() {
  return shell(`
    <section data-testid="reports-page">
      <p class="eyebrow">Management reporting</p>
      <h2>Reports</h2>
      ${state.reportError ? '<p role="alert" class="error" data-testid="report-error">Revenue report failed to load.</p><button data-testid="retry-report">Retry report</button>' : '<p data-testid="report-ready">Revenue report is ready.</p><button data-testid="download-report">Download report</button>'}
    </section>
  `);
}

function adminUsersPage() {
  return shell(`
    <section data-testid="admin-users-page">
      <p class="eyebrow">Admin only</p>
      <h2>User administration</h2>
      <button data-testid="invite-user">Invite user</button>
      <label for="role-select">Role</label>
      <select id="role-select" data-testid="role-select"><option>viewer</option><option>sales</option><option>manager</option><option>admin</option></select>
    </section>
  `);
}

function deniedPage(path) {
  return shell(`
    <section data-testid="permission-denied-page">
      <p class="eyebrow">Permission denied</p>
      <h2>Permission denied</h2>
      <p>You do not have access to ${path}.</p>
      <button data-testid="back-to-dashboard" data-route="/crm/dashboard">Back to dashboard</button>
    </section>
  `);
}

function render() {
  const path = location.pathname === '/' ? '/login' : location.pathname;
  if (path !== location.pathname) {
    window.history.replaceState({}, '', path);
  }

  if (!state.user && path !== '/login') {
    document.querySelector('#app').innerHTML = loginPage();
    return;
  }

  if (path === '/login') {
    document.querySelector('#app').innerHTML = loginPage();
    return;
  }

  if (!canAccess(path)) {
    document.querySelector('#app').innerHTML = deniedPage(path);
    return;
  }

  const pages = {
    '/crm/dashboard': dashboardPage,
    '/crm/leads': leadsPage,
    '/crm/accounts': accountsPage,
    '/crm/opportunities': opportunitiesPage,
    '/crm/reports': reportsPage,
    '/crm/admin/users': adminUsersPage
  };
  document.querySelector('#app').innerHTML = (pages[path] ?? dashboardPage)();
}

document.addEventListener('submit', (event) => {
  if (event.target.matches('[data-testid="login-form"]')) {
    event.preventDefault();
    const username = document.querySelector('[data-testid="username-input"]').value;
    const password = document.querySelector('[data-testid="password-input"]').value;
    const user = Object.values(users).find((candidate) => candidate.username === username && candidate.password === password);
    if (!user) {
      document.querySelector('[data-testid="login-error"]').hidden = false;
      return;
    }
    saveUser(user);
    navigate('/crm/dashboard');
  }

  if (event.target.matches('[data-testid="lead-form"]')) {
    event.preventDefault();
    const name = document.querySelector('[data-testid="lead-name-input"]').value.trim();
    const email = document.querySelector('[data-testid="lead-email-input"]').value.trim();
    const source = document.querySelector('[data-testid="lead-source-input"]').value;
    const error = document.querySelector('[data-testid="lead-validation-error"]');
    if (!name || !email || !source) {
      error.hidden = false;
      return;
    }
    error.hidden = true;
    state.leads.push({ name, email, source });
    render();
  }

  if (event.target.matches('[data-testid="opportunity-form"]')) {
    event.preventDefault();
    const name = document.querySelector('[data-testid="opportunity-name-input"]').value.trim();
    const value = document.querySelector('[data-testid="opportunity-value-input"]').value.trim();
    const error = document.querySelector('[data-testid="opportunity-validation-error"]');
    if (!name || Number.isNaN(Number(value))) {
      error.hidden = false;
      return;
    }
    error.hidden = true;
    state.opportunities.push({ name, value: `$${Number(value).toLocaleString()}` });
    render();
  }
});

document.addEventListener('click', (event) => {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton && !routeButton.disabled) {
    navigate(routeButton.dataset.route);
  }
  if (event.target.matches('[data-testid="logout"]')) {
    logout();
  }
  if (event.target.matches('[data-testid="refresh-dashboard"]')) {
    state.dashboardLoading = true;
    render();
    setTimeout(() => {
      state.dashboardLoading = false;
      render();
    }, 350);
  }
  if (event.target.matches('[data-testid="retry-report"]')) {
    state.reportError = false;
    render();
  }
});

window.addEventListener('popstate', render);
window.__CRM_META__ = { users, routes: routeConfig };
render();
