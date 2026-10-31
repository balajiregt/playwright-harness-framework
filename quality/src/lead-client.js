(() => {
  const reports = JSON.parse(document.getElementById('lead-data').textContent);
  const labels = { planning: 'Scenario planning', duplication: 'Potential duplication', implementation: 'Assertion coverage' };
  const names = { positive: 'Supported / distinct', negative: 'Gap / duplicate candidate', neutral: 'Human judgment' };
  let active = 0, selected = null;
  const $ = id => document.getElementById(id);
  function el(tag, text, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
  function button(text, handler, cls) { const b = el('button', text, cls); b.type = 'button'; b.onclick = handler; return b; }
  function rowFor(check) { return reports[active].rows.find(r => r.checkId === check.id); }
  function lastDecision(check) { return reports[active].decisions.filter(d => d.checkId === check.id).at(-1); }
  function stateText(row) {
    if (row?.status !== 'evaluated') return row?.errorCode || 'Not evaluated';
    if (row.decision === 'neutral') return 'Human judgment';
    return { supported: 'Coverage supported', distinct: 'Distinct coverage', coverage_gap: 'Scenario gap', assertion_gap: 'Assertion gap', duplicate_candidate: 'Possible duplicate' }[row.rawFinding] || names[row.decision];
  }
  function choose(id) { selected = id; renderList(); }
  function selectFromMatrix(id) { $('stage-filter').value = 'all'; $('decision-filter').value = 'all'; choose(id); $('detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function render() {
    const report = reports[active];
    $('report-tabs').replaceChildren(...reports.map((r, i) => {
      const b = button(r.mode === 'preview' ? 'Offline preview' : r.gold ? 'Live synthetic benchmark' : 'Live lead review', () => { active = i; selected = null; render(); });
      b.setAttribute('aria-pressed', String(i === active)); return b;
    }));
    $('run-meta').textContent = `${report.mode.toUpperCase()} · ${report.rubricVersion} · ${new Date(report.generatedAt).toLocaleString()} · Threshold ${report.minimum} · Input hash ${report.inputHash.slice(0, 12)}`;
    const s = report.summary;
    const stats = [[`${s.completed}/${s.requested}`, 'Completed model checks'], [String(s.errors + s.notRun), 'Operational errors / skipped calls'],
      [String(report.checks.filter(c => !lastDecision(c)).length), 'Awaiting lead decision']];
    if (report.gold) stats.push([`${s.matched}/${s.requested}`, 'Exact findings matching gold']);
    $('summary').replaceChildren(...stats.map(([value, name]) => { const d = el('div'); d.append(el('strong', value), el('span', name)); return d; }));
    $('stage-graph').replaceChildren(...Object.entries(labels).map(([stage, name]) => {
      const counts = s.stages[stage];
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const b = button('', () => { $('stage-filter').value = stage; selected = null; renderList(); }, 'stage-card');
      b.append(el('span', name, 'stage-title'));
      const bar = el('div', undefined, 'bar'); bar.setAttribute('aria-hidden', 'true');
      for (const decision of ['positive', 'negative', 'neutral']) { const part = el('span', undefined, decision); part.style.width = `${total ? counts[decision] / total * 100 : 0}%`; bar.append(part); }
      b.append(bar, el('span', total ? `${counts.positive} supported/distinct · ${counts.negative} gaps/duplicates · ${counts.neutral} human` : 'No completed decisions', 'muted'));
      return b;
    }));
    $('coverage').replaceChildren();
    for (const item of report.items) for (const criterion of item.criteria) {
      const tr = el('tr');
      const first = el('td'); first.append(el('b', `${item.id} / ${criterion.id}`), el('div', criterion.text)); tr.append(first);
      tr.append(el('td', item.scenarios.filter(s => s.criterionIds.includes(criterion.id)).map(s => `${s.id} (${s.origin})`).join(', ') || 'No claimed links'));
      for (const stage of ['planning', 'implementation']) {
        const check = report.checks.find(c => c.workItemId === item.id && c.criterionId === criterion.id && c.stage === stage);
        const td = el('td'); if (check) { const row = rowFor(check); td.append(button(stateText(row), () => selectFromMatrix(check.id), row?.decision)); } else td.textContent = 'Stage not selected';
        tr.append(td);
      }
      $('coverage').append(tr);
    }
    renderList();
  }
  function renderList() {
    const report = reports[active], stage = $('stage-filter').value, decision = $('decision-filter').value;
    const checks = report.checks.filter(c => {
      const row = rowFor(c);
      return (stage === 'all' || c.stage === stage) && (decision === 'all' || (decision === 'pending' ? row?.status !== 'evaluated' : row?.status === 'evaluated' && row.decision === decision));
    });
    if (!checks.some(c => c.id === selected)) selected = checks[0]?.id ?? null;
    $('finding-count').textContent = `${checks.length} checks shown`;
    $('findings').replaceChildren(...checks.map(check => {
      const row = rowFor(check), review = lastDecision(check);
      const b = button('', () => choose(check.id), 'finding');
      b.setAttribute('aria-pressed', String(check.id === selected));
      b.append(el('b', `${check.workItemId} · ${labels[check.stage]}`), el('span', check.subject), el('span', stateText(row)), el('span', review ? `Lead: ${review.action}` : 'Lead: pending'));
      const gold = report.gold?.find(g => g.checkId === check.id);
      if (gold && row?.status === 'evaluated' && gold.finding !== row.rawFinding) b.append(el('span', 'Benchmark mismatch'));
      return b;
    }));
    if (selected) renderDetail(checks.find(c => c.id === selected)); else $('detail').replaceChildren(el('p', 'No checks match these filters.', 'empty'));
  }
  function addSection(parent, title, content) { const d = el('details'); d.append(el('summary', title)); content(d); parent.append(d); }
  function renderDetail(check) {
    const report = reports[active], row = rowFor(check), item = report.items.find(i => i.id === check.workItemId);
    const detail = $('detail'); detail.replaceChildren(el('span', labels[check.stage], 'eyebrow'), el('h2', check.subject));
    detail.append(el('span', stateText(row), `pill ${row?.decision || ''}`));
    if (row?.status === 'evaluated') {
      detail.append(el('p', `Model finding: ${row.rawFinding} · Raw recommendation: ${row.rawDecision} · Routed: ${row.decision}`, 'muted'), el('p', row.note));
      detail.append(el('p', `Routing: ${row.routingReason} · ${row.elapsedMs} ms · Selected finding probability ${(row.probability * 100).toFixed(0)}%`, 'muted'));
      const probabilities = el('div');
      for (const [key, probability] of Object.entries(row.probabilities)) {
        const p = el('div', undefined, 'prob-row'), track = el('div', undefined, 'prob-track'), fill = el('div', undefined, 'prob-fill');
        fill.style.width = `${probability * 100}%`; track.append(fill); p.append(el('span', key), track, el('span', `${Math.round(probability * 100)}%`)); probabilities.append(p);
      }
      detail.append(probabilities);
    } else detail.append(el('p', report.mode === 'preview' ? 'Preview only. No Model answer has been generated.' : `Operational status: ${row?.errorCode || 'not evaluated'}. This is not a neutral model judgment.`));
    const criterion = item.criteria.find(c => c.id === check.criterionId);
    if (criterion) detail.append(el('p', `Criterion ${criterion.id} · source records: ${criterion.sourceIds.join(', ')}`, 'muted'));
    addSection(detail, 'Requirements and team context', node => {
      for (const source of item.sources) { const d = el('div', undefined, 'evidence'); d.append(el('b', `${source.id} · ${source.kind}`), el('p', source.content)); node.append(d); }
    });
    addSection(detail, `Scenario evidence (${check.scenarioIds.length})`, node => {
      node.append(el('p', `Inventory declared ${item.inventoryComplete ? 'complete' : 'partial'}. Agreed scenario IDs: ${item.approvedScenarioIds.join(', ') || 'none'}.`, 'muted'));
      for (const s of item.scenarios.filter(s => check.scenarioIds.includes(s.id))) {
        const d = el('div', undefined, 'evidence'); d.append(el('b', `${s.id} · ${s.title}`), el('p', `${s.origin} · Role: ${s.role}`));
        for (const [name, values] of [['Preconditions', s.preconditions], ['Actions', s.actions], ['Expected outcomes', s.expectedOutcomes]]) {
          d.append(el('p', name)); const ul = el('ul'); ul.append(...values.map(v => el('li', v))); d.append(ul);
        }
        node.append(d);
      }
    });
    if (check.stage === 'implementation') addSection(detail, `Actual assertions and supplied run records (${check.implementationIds.length})`, node => {
      node.append(el('p', `Implementation evidence declared ${item.implementationEvidenceComplete ? 'complete' : 'partial'}. Run status is supplied metadata, separate from assertion coverage.`, 'muted'));
      for (const impl of item.implementations.filter(i => check.implementationIds.includes(i.id))) {
        const d = el('div', undefined, 'evidence'); d.append(el('b', `${impl.id} · ${impl.location}`), el('p', `Scenario links: ${impl.scenarioIds.join(', ')} · Run: ${impl.run.status}`), el('p', impl.run.evidence), el('pre', impl.code));
        for (const helper of impl.helpers) d.append(el('b', helper.location), el('pre', helper.code));
        node.append(d);
      }
    });
    const gold = report.gold?.find(g => g.checkId === check.id);
    if (gold && row?.status === 'evaluated' && gold.finding !== row.rawFinding) detail.append(el('p', `Benchmark mismatch: expected ${gold.finding}; Model selected ${row.rawFinding}.`, 'negative'));
    if (gold) addSection(detail, 'Benchmark expectation — local only', node => { node.append(el('p', gold.finding), el('p', gold.rationale), el('p', 'Never included in the model request.', 'muted')); });
    detail.append(el('h3', 'Lead decision'));
    const decisions = report.decisions.filter(d => d.checkId === check.id);
    if (!decisions.length) detail.append(el('p', 'Pending. A model recommendation does not approve this check.', 'review-status'));
    for (const d of decisions) detail.append(el('p', `${d.reviewer} · ${d.action} · ${new Date(d.at).toLocaleString()} — ${d.note}`, 'review-status'));
    if (report.mode === 'live') {
      const form = el('form');
      const reviewerLabel = el('label', 'Reviewer name'), reviewer = el('input'); reviewer.name = 'reviewer'; reviewer.required = true; reviewerLabel.append(reviewer);
      const actionLabel = el('label', 'Decision'), action = el('select'); action.name = 'action';
      for (const [value, label] of [['approve', 'Approve this check'], ['request_changes', 'Request changes'], ['clarify', 'Clarify / supply evidence'], ['dismiss_finding', 'Dismiss finding with rationale']]) { const o = el('option', label); o.value = value; action.append(o); }
      action.value = 'clarify'; actionLabel.append(action);
      const noteLabel = el('label', 'Rationale'), note = el('textarea'); note.name = 'note'; note.required = true; noteLabel.append(note);
      const submit = el('button', 'Download reviewer decision'); submit.type = 'submit';
      const feedback = el('p', 'Downloading does not save approval. Import the decision with the command below, then reload the report.', 'muted');
      const prefix = report.gold ? 'workflow-benchmark' : 'lead-review';
      const filename = `decision-${report.runId.slice(0, 8)}.json`;
      form.append(reviewerLabel, actionLabel, noteLabel, submit, feedback, el('pre', `Save the download into this project’s artifacts folder, then run:\nnpm run review:decision -- --report artifacts/${prefix}.json --decision-file artifacts/${filename}`));
      form.onsubmit = event => {
        event.preventDefault(); if (!reviewer.value.trim() || !note.value.trim()) return;
        const value = { runId: report.runId, checkId: check.id, reviewer: reviewer.value.trim(), action: action.value, note: note.value.trim(), at: new Date().toISOString() };
        const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        feedback.textContent = 'Decision downloaded, not yet persisted. Import it with the command below; the run ID prevents applying it to a different run.';
      };
      detail.append(form);
    }
  }
  $('stage-filter').onchange = () => { selected = null; renderList(); };
  $('decision-filter').onchange = () => { selected = null; renderList(); };
  render();
})();
