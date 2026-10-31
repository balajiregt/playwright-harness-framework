import { z } from 'zod';
import { digest } from './context.js';
import { outcomes, parseFinding, stages, validateWorkflowGold, type Check, type Decision, type Outcome, type WorkflowGold } from './workflow.js';

export const models = { laya: 'convaiinnovations/laya', openai: 'gpt-6-luna' } as const;
export const providers = ['laya', 'openai'] as const;
export type Provider = typeof providers[number];
export const endpoint = 'https://api.openai.com/v1/decisions';
export function decisionRequest(check: Check, provider: Provider) {
  const question = check.request.questions.finding;
  return { model: models[provider], input: check.request.state, questions: [{
    name: 'finding', type: 'choice' as const, instructions: question.instructions,
    choices: Object.entries(question.criteria).map(([value, description]) => ({ value, description }))
  }] };
}
export const evidenceHash = (check: Check) => {
  const { model: _, ...shared } = decisionRequest(check, 'laya');
  return digest(JSON.stringify(shared));
};
const probability = z.number().finite().min(0).max(1);
const envelope = z.object({
  model: z.string().optional(),
  answers: z.array(z.discriminatedUnion('type', [
    z.object({ name: z.literal('finding'), type: z.literal('refusal') }),
    z.object({ name: z.literal('finding'), type: z.literal('choice'), choice: z.string(), confidence: probability.optional(),
      probabilities: z.array(z.object({ value: z.string(), probability })) })
  ])).length(1),
  usage: z.object({ input_tokens: z.number().nonnegative().optional(), output_tokens: z.number().nonnegative().optional(),
    total_tokens: z.number().nonnegative().optional() }).optional(),
  provider_metadata: z.object({ gateway: z.object({ cost: z.union([z.string(), z.number()]).optional() }).optional() }).optional()
});
export function parseDecision(value: unknown, check: Check) {
  const response = envelope.parse(value);
  const answer = response.answers[0];
  const rawCost = response.provider_metadata?.gateway?.cost;
  const cost = rawCost === undefined || rawCost === '' ? null : Number(rawCost);
  const metadata = { returnedModel: response.model, usage: response.usage ?? null,
    costUsd: cost !== null && Number.isFinite(cost) && cost >= 0 ? cost : null };
  if (answer.type === 'refusal') return { ...metadata, status: 'refusal' as const };
  if (new Set(answer.probabilities.map(p => p.value)).size !== answer.probabilities.length) throw new Error('invalid_response');
  const parsed = parseFinding({ finding: { type: 'choice', choice: answer.choice,
    probabilities: Object.fromEntries(answer.probabilities.map(p => [p.value, p.probability])) } }, check.stage);
  return { ...metadata, status: 'evaluated' as const, rawFinding: parsed.choice,
    probabilities: parsed.probabilities, probability: parsed.probabilities[parsed.choice], confidence: answer.confidence };
}
export interface ComparisonRow {
  provider: Provider; checkId: string; status: 'evaluated' | 'refusal' | 'error' | 'not_run';
  rawFinding?: Outcome; decision?: Decision; probability?: number; confidence?: number;
  probabilities?: Record<string, number>; routingReason?: string; errorCode?: string;
  elapsedMs?: number; returnedModel?: string; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null;
  costUsd?: number | null;
}
export interface ComparisonReport {
  version: 'paired-decisions-v1'; runId: string; generatedAt: string; mode: 'preview' | 'live';
  rubricVersion: string; inputHash: string; inputPath: string; endpoint: string;
  models: typeof models; thresholds: Record<Provider, number>; checks: Check[]; rows: ComparisonRow[]; gold?: WorkflowGold;
}
export type Transport = (body: ReturnType<typeof decisionRequest>) => Promise<unknown>;
export class DecisionHttpError extends Error { constructor(public status: number) { super('gateway_http_error'); } }
export async function runComparison(checks: Check[], thresholds: Record<Provider, number>, transport: Transport,
  onRow: (row: ComparisonRow) => void = () => {}) {
  if (!checks.length || checks.length * 2 > 100) throw new Error('Select 1–50 checks (at most 100 API calls).');
  if (providers.some(p => !Number.isFinite(thresholds[p]) || thresholds[p] < 0 || thresholds[p] > 1)) throw new Error('Thresholds must be from 0 to 1.');
  const rows: ComparisonRow[] = [];
  const stopped = new Set<Provider>();
  for (const [index, check] of checks.entries()) {
    // Alternate first caller to reduce systematic order bias; still one observation per model/check.
    for (const provider of index % 2 ? [...providers].reverse() : providers) {
      let row: ComparisonRow = { provider, checkId: check.id, status: 'not_run', errorCode: 'stopped_after_gateway_error' };
      if (!stopped.has(provider)) {
        const start = Date.now();
        try {
          const raw = await transport(decisionRequest(check, provider));
          let parsed;
          try { parsed = parseDecision(raw, check); } catch { throw new Error('invalid_response'); }
          if (parsed.returnedModel && parsed.returnedModel !== models[provider]) throw new Error('unexpected_model');
          row = { provider, checkId: check.id, ...parsed, elapsedMs: Date.now() - start };
          if (parsed.status === 'evaluated') {
            const weak = parsed.probability < thresholds[provider];
            row.decision = weak ? 'neutral' : outcomes[parsed.rawFinding].decision;
            row.routingReason = weak ? 'low_probability' : 'model_decision';
          }
        } catch (error) {
          const code = error instanceof DecisionHttpError ? `http_${error.status}` :
            error instanceof Error && ['invalid_response', 'unexpected_model'].includes(error.message) ? error.message :
            error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'transport_error';
          row = { provider, checkId: check.id, status: 'error', errorCode: code, elapsedMs: Date.now() - start };
          if (error instanceof DecisionHttpError && [400, 401, 402, 403, 404, 429].includes(error.status)) stopped.add(provider);
        }
      }
      rows.push(row); onRow(row);
    }
  }
  return rows;
}
export function comparisonMetrics(report: ComparisonReport) {
  if (report.gold) validateWorkflowGold(report.checks, report.gold);
  const identities = report.rows.map(r => `${r.provider}:${r.checkId}`);
  if (new Set(identities).size !== identities.length || report.rows.some(r => !report.checks.some(c => c.id === r.checkId))) throw new Error('Invalid comparison row identities.');
  const gold = new Map(report.gold?.map(g => [g.checkId, g.finding]));
  const issueIds = report.checks.filter(c => gold.has(c.id) && outcomes[gold.get(c.id)!].decision === 'negative').map(c => c.id);
  const summarize = (provider: Provider) => {
    const rows = report.rows.filter(r => r.provider === provider);
    const evaluated = rows.filter(r => r.status === 'evaluated');
    const matched = report.gold ? evaluated.filter(r => gold.get(r.checkId) === r.rawFinding).length : null;
    const detected = issueIds.filter(id => evaluated.some(r => r.checkId === id && outcomes[r.rawFinding!].decision === 'negative')).length;
    const unsafePositive = report.gold ? evaluated.filter(r => outcomes[r.rawFinding!].decision === 'positive' && outcomes[gold.get(r.checkId)!].decision !== 'positive').length : null;
    const times = rows.filter(r => r.elapsedMs !== undefined).map(r => r.elapsedMs!).sort((a, b) => a - b);
    const costs = rows.filter(r => r.costUsd != null);
    return { requested: report.checks.length, completed: evaluated.length, matched,
      accuracy: matched !== null && evaluated.length ? matched / evaluated.length : null,
      issueRecall: report.gold && issueIds.length ? detected / issueIds.length : null, detectedIssues: report.gold ? detected : null,
      expectedIssues: report.gold ? issueIds.length : null, unsafePositive,
      errors: rows.filter(r => r.status === 'error').length, refusals: rows.filter(r => r.status === 'refusal').length,
      notRun: report.checks.length - rows.filter(r => r.status !== 'not_run').length,
      humanReview: report.mode === 'preview' ? null : report.checks.length - evaluated.filter(r => r.decision !== 'neutral').length,
      medianMs: times.length ? times[Math.floor(times.length / 2)] : null,
      reportedCostUsd: costs.length ? costs.reduce((sum, r) => sum + r.costUsd!, 0) : null, costReportedCalls: costs.length,
      stages: Object.fromEntries(stages.map(stage => [stage, Object.fromEntries((['positive', 'negative', 'neutral'] as const).map(decision =>
        [decision, evaluated.filter(r => r.decision === decision && report.checks.find(c => c.id === r.checkId)?.stage === stage).length]))])) };
  };
  const metrics = { laya: summarize('laya'), openai: summarize('openai') };
  const paired = report.checks.map(check => providers.map(p => report.rows.find(r => r.provider === p && r.checkId === check.id)))
    .filter(pair => pair.every(r => r?.status === 'evaluated'));
  const agreements = paired.filter(([a, b]) => a!.rawFinding === b!.rawFinding).length;
  return { providers: metrics, pairedCompleted: paired.length, agreements, disagreements: paired.length - agreements,
    agreementRate: paired.length ? agreements / paired.length : null };
}
