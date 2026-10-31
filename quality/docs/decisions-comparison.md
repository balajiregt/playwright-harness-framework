# Typed input, typed output, local action

The live pilot uses **Choice** for both tasks. Neither task needs free-form prose.

```ts
// Shared packet, before provider-specific serialization:
{
  input: 'Requirement + supplied test/assertion evidence',
  instructions: 'Classify requirement coverage from assertions, preserving uncertainty.',
  choices: {
    covered: 'All required behavior is verified.',
    partial: 'Only some required behavior is verified.',
    uncovered: 'Complete evidence contains no adequate test.',
    needs_judgment: 'Evidence or requirements are insufficient.'
  }
}
```

| Provider | Request | Response consumed |
|---|---|---|
| Local Laya | `agent.predict(input, {decision: {type: 'choice', instructions, criteria}})` | `answers.decision.choice`, probability map, confidence, token usage |
| Direct OpenAI Decisions | `{model: 'gpt-6-luna', input, questions: [{name: 'decision', type: 'choice', instructions, choices: [{value, description}]}]}` | `answers[]` choice/probability entries or refusal, usage |
| Ollama/Qwen proxy | Same packet in a JSON-constrained chat request | `{decision: 'covered'}`; no probabilities invented |

Laya's other primitives are `noul` (yes/no probability) and `score` (ordered rubric).
OpenAI calls the yes/no primitive `predicate`; it also supports `choice` and `score`.
They are not wire-compatible. This project normalizes Choice results locally.

An accepted answer has a known label and a valid probability distribution when
provided. Wrong models, malformed JSON and refusals remain separate outcomes.
Missing evidence or selected-label probability below the provisional 0.8 threshold
routes to review. Raw labels remain visible so routing cannot hide model mistakes.
Qwen's generated JSON has no calibrated probability, so only evidence/policy guards apply.

Coverage reports link to the evidence considered; Choice does not generate a
written rationale or verified supporting citation. Smoke labels feed a deterministic
subset optimizer: preserve mandatory journeys and dependencies within budget. If
no feasible subset exists, return the conflict and require human judgment.

Laya runs locally with a pinned checkpoint and tokenizer preflight. OpenAI is an
optional **direct API** integration using `OPENAI_API_KEY`; the prior Gateway route
has been removed. No Laya credential or Vercel setup is needed.

Sources checked October 20, 2026:
[Laya](https://github.com/NandhaKishorM/laya),
[OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions),
[Decisions API reference](https://developers.openai.com/api/reference/resources/decisions/methods/create).
