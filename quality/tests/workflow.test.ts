import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { workItemsSchema, buildChecks, stageOutcomes, runChecks, parseFinding, workflowSummary,
  workflowGoldSchema, validateWorkflowGold, appendDecision, type Outcome, type Stage, type WorkflowReport } from '../src/workflow.js';
import { renderLeadReports } from '../src/lead-report.js';

const items = workItemsSchema.parse(JSON.parse(await readFile(new URL('../examples/lead-review.json', import.meta.url), 'utf8')));
const checks = buildChecks(items);
const gold = workflowGoldSchema.parse(JSON.parse(await readFile(new URL('../fixtures/workflow-gold.json', import.meta.url), 'utf8')));
function answer(stage: Stage, finding: Outcome, probability = 0.94) {
  return { finding: { type: 'choice', choice: finding, probabilities: Object.fromEntries(stageOutcomes[stage].map(key => [key, key === finding ? probability : (1 - probability) / (stageOutcomes[stage].length - 1)])) } };
}
function snapshot(): WorkflowReport {
  return { runId: 'run-original', mode: 'live', generatedAt: new Date().toISOString(), rubricVersion: 'test', minimum: 0.8,
    inputHash: 'hash', inputPath: 'example', items, checks, rows: [], decisions: [] };
}

test('review plan covers each criterion twice plus every unique scenario pair', () => {
  assert.equal(checks.length, 13);
  assert.equal(checks.filter(c => c.stage === 'planning').length, 5);
  assert.equal(checks.filter(c => c.stage === 'implementation').length, 5);
  assert.equal(checks.filter(c => c.stage === 'duplication').length, 3);
  assert.equal(new Set(checks.map(c => c.id)).size, checks.length);
  validateWorkflowGold(checks, gold);
  assert.throws(() => validateWorkflowGold(checks, gold.slice(1)));
});

test('model packets exclude benchmark identities, source locations, gold and reviewer decisions', () => {
  for (const check of checks) {
    const wire = JSON.stringify(check.request);
    assert.ok(!wire.includes('CRM-REVIEW'));
    assert.ok(!wire.includes('HELPER-REVIEW'));
    assert.ok(!wire.includes('synthetic/customer.spec.ts'));
    assert.ok(!wire.includes('workflow-gold'));
    assert.ok(!wire.includes('rationale'));
    assert.deepEqual(Object.keys(check.request.questions), ['finding']);
  }
});

test('planning sees the full inventory but implementation receives the agreed plan and code', () => {
  const plan = JSON.parse(checks.find(c => c.id === 'CRM-REVIEW:planning:AC1')!.request.state);
  const impl = JSON.parse(checks.find(c => c.id === 'CRM-REVIEW:implementation:AC1')!.request.state);
  assert.equal(plan.scenarios.length, 3);
  assert.equal(plan.implementations, undefined);
  assert.equal(impl.scenarios.length, 2);
  assert.equal(impl.implementations[0].run.status, 'passed');
  assert.match(impl.implementations[0].code, /heading/);
  assert.ok(!impl.implementations[0].code.includes('Access denied'));
});

test('a passed run cannot override a negative assertion finding', async () => {
  const check = checks.find(c => c.id === 'CRM-REVIEW:implementation:AC1')!;
  const [row] = await runChecks([check], 0.8, async () => ({ answers: answer('implementation', 'assertion_gap') }));
  assert.equal(row.decision, 'negative');
  assert.equal(row.rawFinding, 'assertion_gap');
});

test('same titles do not bypass pair evaluation; different roles reach the model intact', () => {
  const item = structuredClone(items[0]);
  item.scenarios[2].title = item.scenarios[0].title;
  const pair = buildChecks([item], 'duplication').find(c => c.id.endsWith('S1:S3'))!;
  const state = JSON.parse(pair.request.state);
  assert.deepEqual(state.scenarios.map((s: { role: string }) => s.role), ['viewer', 'admin']);
  assert.equal(state.scenarios.length, 2);
});

test('partial inventory, empty evidence and absent approval stay explicit in the request', () => {
  const item = structuredClone(items[0]);
  item.inventoryComplete = false; item.implementationEvidenceComplete = false;
  item.approvedScenarioIds = []; item.implementations = [];
  const plan = buildChecks([item]);
  assert.equal(JSON.parse(plan.find(c => c.stage === 'planning')!.request.state).inventoryComplete, false);
  assert.equal(JSON.parse(plan.find(c => c.stage === 'implementation')!.request.state).agreedPlanAvailable, false);
});

test('invalid references, duplicate IDs, excessive pairs and evidence fail before API calls', () => {
  const item = structuredClone(items[0]); item.approvedScenarioIds.push('unknown');
  assert.throws(() => workItemsSchema.parse([item]));
  assert.throws(() => workItemsSchema.parse([items[0], items[0]]));
  const large = structuredClone(items[0]);
  large.scenarios = Array.from({ length: 16 }, (_, i) => ({ ...large.scenarios[0], id: `S${i}` }));
  assert.throws(() => buildChecks([large], 'duplication'), /100 requests/);
  const huge = structuredClone(items[0]); huge.sources[0].content = 'x'.repeat(90_000);
  assert.throws(() => buildChecks([huge]), /80 KB/);
});

test('stage-incompatible outcomes and incomplete probability distributions are rejected', () => {
  assert.throws(() => parseFinding(answer('duplication', 'duplicate_candidate'), 'planning'));
  const malformed = answer('planning', 'supported'); delete malformed.finding.probabilities.coverage_gap;
  assert.throws(() => parseFinding(malformed, 'planning'));
  const excess = answer('planning', 'supported'); excess.finding.probabilities.extra = 0;
  assert.throws(() => parseFinding(excess, 'planning'));
});

test('low probability routes locally to human judgment without changing the raw finding', async () => {
  const [row] = await runChecks([checks[0]], 0.8, async () => ({ answers: answer('planning', 'supported', 0.6) }));
  assert.equal(row.rawFinding, 'supported'); assert.equal(row.rawDecision, 'positive');
  assert.equal(row.decision, 'neutral'); assert.equal(row.routingReason, 'low_probability');
});

test('gateway failures stop subsequent calls, preserve counts, and never become neutral findings', async () => {
  let calls = 0;
  const rows = await runChecks(checks, 0.8, async () => { calls++; throw { statusCode: 403, message: 'secret-token' }; });
  assert.equal(calls, 1); assert.equal(rows[0].errorCode, 'http_403'); assert.equal(rows[1].status, 'not_run');
  assert.ok(!JSON.stringify(rows).includes('secret-token'));
  const summary = workflowSummary(checks, rows, gold);
  assert.equal(summary.completed, 0); assert.equal(summary.accuracy, null); assert.equal(summary.notRun, 12);
});

test('gold mismatch remains visible, including false supported finding', async () => {
  const check = checks.find(c => c.id === 'CRM-REVIEW:implementation:AC1')!;
  const rows = await runChecks([check], 0.8, async () => ({ answers: answer('implementation', 'supported') }));
  assert.equal(workflowSummary([check], rows, gold).matched, 0);
});

test('reviewer actions are append-only, bound to a run, and cannot alter Model findings', () => {
  const report = snapshot();
  const value = { runId: report.runId, checkId: checks[0].id, reviewer: 'Test reviewer', action: 'request_changes', note: 'Add assertion', at: new Date().toISOString() };
  const changed = appendDecision(report, value);
  assert.equal(report.decisions.length, 0); assert.equal(changed.decisions.length, 1);
  assert.deepEqual(changed.rows, report.rows);
  assert.throws(() => appendDecision(report, { ...value, runId: 'old-run' }));
  assert.throws(() => appendDecision(report, { ...value, checkId: 'unknown' }));
  assert.throws(() => appendDecision({ ...report, mode: 'preview' }, value));
});

test('lead report escapes source and reviewer text before embedding', () => {
  const report = snapshot(); report.items = structuredClone(items); report.items[0].title = '</script><script>alert(1)</script>';
  const html = renderLeadReports([report]);
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('\\u003c/script\\u003e'));
});
