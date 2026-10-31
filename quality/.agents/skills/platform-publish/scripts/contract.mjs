// Platform publishing contract 1.0.0. Pure functions shared with the browser.
export const CONTRACT_VERSION = '1.0.0';
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/;
export const UNITS = ['count', 'ms', 's', 'bytes', 'ratio', 'percent', 'USD', 'score'];
const STATES = ['measured', 'estimated', 'unavailable'];
const STATUSES = ['completed', 'partial', 'failed', 'blocked', 'unavailable'];
const FORMATS = ['metrics-v1', 'legacy-runtime-v1', 'decision-bench-v1', 'team-metrics-v1', 'comparison-metrics-v2', 'impact-v1', 'workflow-v1', 'trials-v1'];
const fail = message => { throw new Error(message); };
export function exact(value, keys, label = 'record') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) fail('Unexpected fields in ' + label);
}
function text(value, max = 300) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f<>]/.test(value)) fail('Invalid public text');
  // A tripwire, not a proof that authored text is safe to publish.
  if (/\/Users\/|\/home\/|[A-Za-z]:\\|-----BEGIN .*PRIVATE KEY|(?:sk|ghp|github_pat)-?[A-Za-z0-9_]{20,}|\b(?:password|api[_-]?key|access[_-]?token)\s*[:=]/i.test(value)) fail('Potential private content in public text');
}
function id(value) { if (typeof value !== 'string' || value.length > 64 || !ID.test(value)) fail('Invalid identifier'); }
export function repository(value) { if (typeof value !== 'string' || !REPOSITORY.test(value) || value.endsWith('.git') || /\/\.\.?$/.test(value)) fail('Expected canonical public GitHub repository URL'); return value; }
function url(value) {
  let u; try { u = new URL(value); } catch { fail('Invalid public URL'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || /^(localhost|127\.|0\.|\[|10\.|192\.168\.|169\.254\.)/i.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname) || /\/Users\/|\/home\//.test(u.pathname)) fail('Expected public HTTPS URL without credentials or query');
}
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('Expected a real UTC timestamp with milliseconds');
}
function collection(value, max) { if (!Array.isArray(value) || value.length > max) fail('Invalid collection'); }
function unique(values) { if (new Set(values).size !== values.length) fail('Duplicate identifier'); }
function revision(value) { if (value !== null && (typeof value !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value))) fail('Invalid source revision'); }
function metricDefinition(d) {
  exact(d, ['id', 'label', 'unit']); id(d.id); text(d.label, 100);
  if (!UNITS.includes(d.unit)) fail('Unsupported unit');
}
function metric(m) {
  exact(m, ['id', 'label', 'unit', 'value', 'state', 'sampleSize']); metricDefinition({id:m.id, label:m.label, unit:m.unit});
  if (!STATES.includes(m.state) || (m.sampleSize !== null && (!Number.isSafeInteger(m.sampleSize) || m.sampleSize < 0))) fail('Invalid metric evidence');
  if (m.state === 'unavailable') { if (m.value !== null) fail('Unavailable is not a numeric result'); return; }
  if (typeof m.value !== 'number' || !Number.isFinite(m.value) || (m.unit !== 'score' && m.value < 0)) fail('Invalid measurement');
  if (['count', 'bytes'].includes(m.unit) && !Number.isSafeInteger(m.value)) fail('Count must be a safe integer');
  if ((m.unit === 'ratio' && m.value > 1) || (m.unit === 'percent' && m.value > 100)) fail('Invalid ratio or percentage');
  if (m.state === 'measured' && m.sampleSize === 0) fail('A measured result cannot have zero observations');
}
export function validateConfig(c) {
  exact(c, ['schemaVersion','publisherVersion','projectId','repository','branch','feedPath','scope','methodologyUrl','limitations','metrics']);
  if (c.schemaVersion !== 1 || c.publisherVersion !== CONTRACT_VERSION) fail('Unsupported publishing contract or publisher version');
  id(c.projectId); repository(c.repository);
  // Fixed transport namespace prevents accidental writes to source branches or legacy feeds.
  if (c.branch !== 'platform-results' || c.feedPath !== 'metrics.json') fail('Use platform-results / metrics.json for new standard feeds');
  if (!['synthetic','local','production'].includes(c.scope)) fail('Explicit evidence scope required');
  url(c.methodologyUrl); collection(c.limitations, 20); c.limitations.forEach(v => text(v));
  collection(c.metrics, 100); if (!c.metrics.length) fail('At least one metric definition required');
  c.metrics.forEach(metricDefinition); unique(c.metrics.map(m => m.id)); return c;
}
export function validateMeasurementInput(d, config) {
  validateConfig(config); exact(d, ['observedAt','revision','dirty','status','values']); timestamp(d.observedAt); revision(d.revision);
  if (typeof d.dirty !== 'boolean' || !STATUSES.includes(d.status)) fail('Invalid run state');
  exact(d.values, config.metrics.map(m => m.id), 'metric values');
  for (const definition of config.metrics) {
    const v = d.values[definition.id]; exact(v, ['value','state','sampleSize']); metric({...definition,...v});
  }
  if (['blocked','unavailable'].includes(d.status) && Object.values(d.values).some(v => v.state !== 'unavailable')) fail('Blocked or unavailable runs cannot claim results');
  return d;
}
export function validateAggregate(d, config = null) {
  exact(d, ['schemaVersion','projectId','runId','policyHash','observedAt','source','status','scope','methodologyUrl','limitations','metrics']);
  if (d.schemaVersion !== 1) fail('Unsupported aggregate version'); id(d.projectId);
  if (![d.runId,d.policyHash].every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))) fail('Invalid content identity');
  timestamp(d.observedAt); exact(d.source,['repository','revision','dirty']); repository(d.source.repository); revision(d.source.revision);
  if (typeof d.source.dirty !== 'boolean' || !STATUSES.includes(d.status) || !['synthetic','local','production'].includes(d.scope)) fail('Invalid run state');
  url(d.methodologyUrl); collection(d.limitations,20); d.limitations.forEach(v => text(v)); collection(d.metrics,100); if (!d.metrics.length) fail('Metrics required');
  d.metrics.forEach(metric); unique(d.metrics.map(m => m.id));
  if (['blocked','unavailable'].includes(d.status) && d.metrics.some(m => m.state !== 'unavailable')) fail('Blocked or unavailable runs cannot claim results');
  if (config) {
    validateConfig(config);
    if (d.projectId !== config.projectId || d.source.repository !== config.repository || d.scope !== config.scope || d.methodologyUrl !== config.methodologyUrl || JSON.stringify(d.limitations) !== JSON.stringify(config.limitations) || JSON.stringify(d.metrics.map(({id,label,unit})=>({id,label,unit}))) !== JSON.stringify(config.metrics)) fail('Aggregate does not match reviewed publication policy');
  }
  return d;
}
export function validateMetricsFeed(d, expectedProjectId, expectedRepository) {
  exact(d,['schemaVersion','projectId','runs']);
  if (d.schemaVersion !== 1 || d.projectId !== expectedProjectId) fail('Feed identity mismatch');
  collection(d.runs,50); unique(d.runs.map(r => r.runId));
  for (const r of d.runs) { validateAggregate(r); if (r.projectId !== d.projectId || r.source.repository !== expectedRepository) fail('Feed source mismatch'); }
  const ordered = [...d.runs].sort((a,b)=>b.observedAt.localeCompare(a.observedAt)||b.runId.localeCompare(a.runId));
  if (d.runs.some((r,i)=>r.runId !== ordered[i].runId)) fail('Feed must be newest first'); return d;
}
export function validateRegistry(r) {
  exact(r,['schemaVersion','projects','analyses']); if (r.schemaVersion !== 1) fail('Unsupported registry version');
  collection(r.projects,100); collection(r.analyses,100); unique(r.projects.map(p=>p.id)); unique(r.analyses.map(a=>a.id));
  const ids = new Set(r.projects.map(p=>p.id)); const routes = [];
  for (const [kind, entries] of [['projects',r.projects],['analyses',r.analyses]]) for (const p of entries) {
    exact(p,kind === 'projects' ? ['id','title','description','kind','repository','demoUrl','route','sources'] : ['id','title','description','repository','route','projectIds','sources']);
    id(p.id); text(p.title,100); text(p.description); repository(p.repository);
    if (p.route !== `/${kind}/${p.id}`) fail('Route must match the registered identifier'); routes.push(p.route);
    if (kind === 'projects') { if (!['application','framework','experiment'].includes(p.kind)) fail('Unknown project kind'); if (p.demoUrl !== null) url(p.demoUrl); }
    else { collection(p.projectIds,20); unique(p.projectIds); if (!p.projectIds.length || p.projectIds.some(v=>!ids.has(v))) fail('Unknown related project'); }
    collection(p.sources,10); unique(p.sources.map(s=>s.id));
    for (const s of p.sources) {
      exact(s,['id','format','repository','branch','path','legacyProject']); id(s.id); repository(s.repository);
      if (kind === 'projects' && s.repository !== p.repository) fail('Project feed must belong to its registered repository');
      if (!FORMATS.includes(s.format) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(s.branch) || s.branch.includes('..') || !/^[A-Za-z0-9][A-Za-z0-9._/-]*\.json$/.test(s.path) || s.path.split('/').some(v=>!v || v==='.' || v==='..')) fail('Invalid source descriptor');
      if (s.format === 'legacy-runtime-v1') { id(s.legacyProject); if (kind !== 'projects') fail('Legacy runtime belongs to a project'); }
      else if (s.legacyProject !== null) fail('Unexpected legacy mapping');
      if (s.format === 'metrics-v1' && (s.branch !== 'platform-results' || s.path !== 'metrics.json')) fail('Invalid standard feed location');
    }
  }
  unique(routes); unique(r.projects.flatMap(p=>p.sources.filter(s=>s.format==='legacy-runtime-v1').map(s=>s.legacyProject))); return r;
}
export function sourceURL(entry, source) {
  repository(source.repository); return `https://raw.githubusercontent.com/${source.repository.slice('https://github.com/'.length)}/${source.branch}/${source.path}`;
}
