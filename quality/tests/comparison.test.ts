import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildChecks, workItemsSchema, stageOutcomes, type Check } from '../src/workflow.js';
import { decisionRequest, parseDecision, runComparison, models, DecisionHttpError, comparisonMetrics, endpoint, type ComparisonReport } from '../src/comparison.js';
import { renderComparison } from '../src/comparison-report.js';

const items = workItemsSchema.parse(JSON.parse(await readFile(new URL('../examples/lead-review.json', import.meta.url), 'utf8')));
const checks = buildChecks(items);
const check = checks[0];
function response(c: Check = check, choice = stageOutcomes[c.stage][0], probability = .91) {
  const allowed = stageOutcomes[c.stage];
  return { answers: [{ name: 'finding', type: 'choice', choice, confidence: .65,
    probabilities: allowed.map(value => ({ value, probability: value === choice ? probability : (1 - probability) / (allowed.length - 1) })) }],
    usage: { input_tokens: 100 }, provider_metadata: { gateway: { cost: '0.0001' } } };
}
function report(rows: ComparisonReport['rows']): ComparisonReport {
  return { version: 'paired-decisions-v1', mode: 'live', runId: 'test', generatedAt: '2026-10-17T00:00:00Z',
    rubricVersion: 'lead-review-v2', inputHash: 'hash', inputPath: 'synthetic', endpoint, models, thresholds: { laya: .8, openai: .8 },
    checks: [check], rows, gold: [{ checkId: check.id, finding: 'coverage_gap', rationale: 'Synthetic missing behavior' }] };
}
test('providers get identical evidence/rubric, with no local benchmark labels or IDs', () => {
  for (const c of checks) {
    const { model: laya, ...a } = decisionRequest(c, 'laya');
    const { model: openai, ...b } = decisionRequest(c, 'openai');
    assert.equal(laya, models.laya); assert.equal(openai, models.openai); assert.deepEqual(a, b);
    assert.equal(a.input, c.request.state);
    assert.equal(JSON.stringify(a).includes(c.id), false);
    for (const forbidden of ['workflow-gold.json', 'reviewerDecisions', '"rationale"', '"location"']) assert.equal(JSON.stringify(a).includes(forbidden), false);
  }
});
test('normalizes distributions; keeps confidence distinct and only explicit cost', () => {
  const parsed = parseDecision(response(), check);
  assert.equal(parsed.status, 'evaluated');
  if (parsed.status !== 'evaluated') return;
  assert.equal(parsed.probability, .91); assert.equal(parsed.confidence, .65); assert.equal(parsed.costUsd, .0001);
  assert.equal(parseDecision({ answers: response().answers }, check).costUsd, null);
});
test('rejects duplicate/missing choices, invalid sums, wrong stage and wrong question', () => {
  for (const mutate of [
    (r: ReturnType<typeof response>) => { r.answers[0].probabilities[1].value = r.answers[0].probabilities[0].value; },
    (r: ReturnType<typeof response>) => { r.answers[0].probabilities.pop(); },
    (r: ReturnType<typeof response>) => { r.answers[0].probabilities[0].probability = .1; },
    (r: ReturnType<typeof response>) => { r.answers[0].choice = 'duplicate_candidate'; },
    (r: ReturnType<typeof response>) => { r.answers[0].name = 'something_else'; }
  ]) { const r = response(); mutate(r); assert.throws(() => parseDecision(r, check)); }
});
test('independent thresholds route same raw finding differently; alternating order', async () => {
  const sequence: string[] = [];
  const pair = [check, { ...check, id: 'second' }];
  const rows = await runComparison(pair, { laya: .8, openai: .95 }, async request => {
    sequence.push(request.model); return response();
  });
  assert.deepEqual(sequence, [models.laya, models.openai, models.openai, models.laya]);
  assert.equal(rows[0].decision, 'positive'); assert.equal(rows[1].decision, 'neutral');
  assert.equal(rows[0].rawFinding, rows[1].rawFinding);
});
test('HTTP auth stop is provider-local and errors never retain raw details', async () => {
  const rows = await runComparison([check, { ...check, id: 'second' }], { laya: .8, openai: .8 }, async request => {
    if (request.model === models.laya) throw new DecisionHttpError(403);
    throw new Error('secret key and request body');
  });
  assert.equal(rows[0].errorCode, 'http_403'); assert.equal(rows[3].status, 'not_run');
  assert.equal(rows[2].errorCode, 'transport_error'); assert.equal(JSON.stringify(rows).includes('secret'), false);
});
test('refusal, malformed response and unexpected model are not neutral answers', async () => {
  for (const [payload, expected] of [
    [{ answers: [{ name: 'finding', type: 'refusal' }] }, 'refusal'],
    [{ answers: [] }, 'invalid_response'],
    [{ ...response(), model: 'unexpected' }, 'unexpected_model']
  ] as const) {
    const rows = await runComparison([check], { laya: .8, openai: .8 }, async () => payload);
    assert.equal(rows[0].status === 'refusal' ? 'refusal' : rows[0].errorCode, expected);
    assert.equal(rows[0].decision, undefined);
  }
});
test('agreement is not correctness; missing results reduce recall and do not count as agreement', () => {
  const rows = (['laya', 'openai'] as const).map(provider => ({ provider, checkId: check.id, status: 'evaluated' as const,
    rawFinding: 'supported' as const, decision: 'positive' as const }));
  const bothWrong = comparisonMetrics(report(rows));
  assert.equal(bothWrong.agreementRate, 1); assert.equal(bothWrong.providers.laya.accuracy, 0);
  assert.equal(bothWrong.providers.laya.unsafePositive, 1);
  const missing = comparisonMetrics(report([{ provider: 'laya', checkId: check.id, status: 'error' }]));
  assert.equal(missing.agreementRate, null); assert.equal(missing.providers.laya.issueRecall, 0);
  assert.equal(missing.providers.openai.notRun, 1); assert.equal(missing.providers.laya.accuracy, null);
});
test('report escapes supplied evidence and exposes filterable paired findings', () => {
  const r = report([]); r.checks = [{ ...check, subject: '<script>alert(1)</script>' }];
  const html = renderComparison(r);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('data-comparison="unavailable"')); assert.ok(html.includes('id="stage"'));
  assert.equal(html.includes('<script>alert(1)</script>'), false);
});
