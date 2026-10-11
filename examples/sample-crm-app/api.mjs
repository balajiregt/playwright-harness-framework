import { randomUUID } from 'node:crypto';
export const accountFixture = [{ id: 'a1', name: 'Synthetic North Account' }, { id: 'a2', name: 'Synthetic South Account' }];
export function createApi({ fault = null, now = () => Date.now() } = {}) {
  if (![null, 'viewer-export'].includes(fault)) throw new Error('Unknown benchmark fault');
  const sessions = new Map();
  return async function api(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/')) return false;
    const reply = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(body)); return true; };
    if (url.pathname === '/api/session' && req.method === 'POST') {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return reply(413, { error: 'Request too large' }); }
      let input; try { input = JSON.parse(raw); } catch { return reply(400, { error: 'Invalid JSON' }); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return reply(400, { error: 'Invalid JSON' });
      const role = typeof input.email === 'string' ? input.email.split('@')[0] : '';
      if (!['admin','manager','sales','viewer'].includes(role) || input.email !== `${role}@example.com` || input.password !== 'password') return reply(401, { error: 'Invalid credentials' });
      const token = randomUUID(); sessions.set(token, { role, expires: now() + 3600000 });
      return reply(200, { role }, { 'set-cookie': `crm-session=${token}; HttpOnly; SameSite=Strict; Path=/` });
    }
    const token = (req.headers.cookie ?? '').split(';').map(v=>v.trim()).find(v=>v.startsWith('crm-session='))?.slice('crm-session='.length);
    const session = sessions.get(token);
    if (url.pathname === '/api/session' && req.method === 'DELETE') { sessions.delete(token); return reply(200, { signedOut: true }, { 'set-cookie': 'crm-session=; Max-Age=0; Path=/' }); }
    if (!session || session.expires <= now()) return reply(401, { error: 'Authentication required' });
    if (req.method !== 'GET') return reply(405, { error: 'Method not allowed' });
    if (url.pathname === '/api/accounts') return ['admin','manager','viewer'].includes(session.role) ? reply(200, { accounts: accountFixture }) : reply(403, { error: 'Access denied' });
    if (url.pathname === '/api/accounts/export') return ['admin','manager'].includes(session.role) || (fault === 'viewer-export' && session.role === 'viewer') ? reply(200, { accounts: accountFixture, format: 'json' }) : reply(403, { error: 'Access denied' });
    return reply(404, { error: 'Unknown endpoint' });
  };
}
