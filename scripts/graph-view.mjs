import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, slug, writeText } from './graph-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join('scripts', script)], {
      cwd: root,
      stdio: 'inherit'
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function stat(label, value) {
  return `<article class="stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`;
}

function rows(items, columns) {
  return items
    .map((item) => `<tr>${columns.map((column) => `<td>${escapeHtml(column(item) ?? '')}</td>`).join('')}</tr>`)
    .join('\n');
}

function fileHref(filePath) {
  return `../${String(filePath).split(path.sep).map(encodeURIComponent).join('/')}`;
}

function fileList(items) {
  if (!items.length) return '<p>None.</p>';
  return `<ul>${items.map((item) => `<li><a href="${fileHref(item)}">${escapeHtml(item)}</a></li>`).join('')}</ul>`;
}

function testCaseId(item) {
  return item.id ?? `test_case:${item.file}:${slug(item.title)}`;
}

function addNode(nodes, node) {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
    return;
  }
  nodes.set(node.id, { ...nodes.get(node.id), ...node });
}

function addEdge(edges, nodes, edge) {
  if (!nodes.has(edge.from) || !nodes.has(edge.to)) return;
  const id = `${edge.from}->${edge.to}:${edge.type}`;
  if (!edges.some((existing) => existing.id === id)) {
    edges.push({ id, ...edge });
  }
}

function routeTerms(route) {
  const segment = route.route.split('/').filter(Boolean).at(-1) ?? '';
  return [
    route.route,
    segment,
    `goto-${segment}`,
    `goto${segment}`,
    ...(route.actions ?? []),
    ...(route.states ?? [])
  ].map((term) => String(term).toLowerCase().replace(/[^a-z0-9]+/g, ''));
}

function testTerms(testCase) {
  return [
    testCase.title,
    testCase.file,
    ...(testCase.tags ?? []),
    ...(testCase.routes ?? []),
    ...(testCase.testIds ?? []),
    ...(testCase.methods ?? [])
  ].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function matchesRoute(testCase, route) {
  const terms = testTerms(testCase);
  return routeTerms(route).some((term) => term && terms.includes(term));
}

function captureMatchesRoute(capture, route) {
  const segment = route.route.split('/').filter(Boolean).at(-1) ?? '';
  const text = `${capture.file} ${capture.url ?? ''}`.toLowerCase();
  return text.includes(route.route.toLowerCase()) || text.includes(segment.toLowerCase());
}

function buildVisualGraph(source, tests, coverage, duplicates) {
  const nodes = new Map();
  const edges = [];
  const sourceTypes = new Set(['app_route', 'page_component', 'role', 'user_action', 'form_field', 'page_state']);

  for (const node of source.nodes.filter((item) => sourceTypes.has(item.type))) {
    addNode(nodes, {
      id: node.id,
      type: node.type,
      label: node.label,
      family: 'source',
      file: node.source,
      details: node
    });
  }

  for (const edge of source.edges) {
    addEdge(edges, nodes, { from: edge.from, to: edge.to, type: edge.type, family: 'source' });
  }

  for (const node of tests.nodes) {
    const family = node.type === 'capture_file' ? 'capture' : node.type === 'capture_recipe' ? 'recipe' : 'test';
    addNode(nodes, {
      id: node.id,
      type: node.type,
      label: node.label,
      family,
      file: node.file,
      details: node
    });
  }

  for (const edge of tests.edges) {
    addEdge(edges, nodes, { from: edge.from, to: edge.to, type: edge.type, family: 'test' });
  }

  for (const route of coverage.coverage) {
    const routeId = `route:${route.route}`;
    for (const testCase of tests.testCases.filter((item) => matchesRoute(item, route))) {
      addEdge(edges, nodes, {
        from: testCaseId(testCase),
        to: routeId,
        type: 'test_covers_route',
        family: 'coverage'
      });
    }

    for (const capture of tests.nodes.filter((item) => item.type === 'capture_file' && captureMatchesRoute(item, route))) {
      addEdge(edges, nodes, {
        from: capture.id,
        to: routeId,
        type: 'capture_observes_route',
        family: 'capture'
      });
    }
  }

  coverage.gaps.slice(0, 30).forEach((gap, index) => {
    const id = `gap:${index}:${gap.type}:${gap.route}`;
    addNode(nodes, {
      id,
      type: 'coverage_gap',
      label: `${gap.type} ${gap.route}`,
      family: 'gap',
      details: gap
    });
    addEdge(edges, nodes, {
      from: `route:${gap.route}`,
      to: id,
      type: 'route_has_gap',
      family: 'gap'
    });
  });

  [...duplicates.duplicates, ...duplicates.overlaps].forEach((duplicate, index) => {
    const id = `duplicate:${index}:${duplicate.level}`;
    addNode(nodes, {
      id,
      type: 'duplicate_risk',
      label: `${duplicate.level} ${duplicate.key}`,
      family: 'duplicate',
      details: duplicate
    });
    for (const test of duplicate.tests ?? []) {
      addEdge(edges, nodes, {
        from: id,
        to: `test_case:${test.file}:${slug(test.title)}`,
        type: 'duplicate_references_test',
        family: 'duplicate'
      });
    }
  });

  return {
    nodes: Array.from(nodes.values()),
    edges,
    typeOrder: [
      'role',
      'app_route',
      'page_component',
      'user_action',
      'form_field',
      'page_state',
      'playwright_test_file',
      'playwright_test',
      'tag',
      'capture_recipe',
      'capture_file',
      'flow_spec',
      'page_object',
      'assertion_helper',
      'coverage_gap',
      'duplicate_risk'
    ]
  };
}

await run('graph-source.mjs');
await run('graph-tests.mjs');
await run('graph-coverage.mjs');
await run('graph-duplicates.mjs');

const source = await readJson('graphs/data/source-graph.json');
const tests = await readJson('graphs/data/test-graph.json');
const coverage = await readJson('graphs/data/coverage-graph.json');
const duplicates = await readJson('graphs/data/duplicates.json');
const visualGraph = buildVisualGraph(source, tests, coverage, duplicates);
const visualGraphJson = JSON.stringify(visualGraph).replaceAll('</script', '<\\/script');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agentic Playwright Graph View</title>
    <style>
      :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #172033; background: #f7f8fb; }
      body { margin: 0; }
      header { padding: 34px 48px; background: #fff; border-bottom: 1px solid #dbe3ef; }
      h1 { margin: 0 0 10px; font-size: 34px; letter-spacing: 0; }
      h2 { margin-top: 0; }
      h3 { margin-bottom: 10px; }
      main { padding: 24px 48px 40px; }
      section { background: #fff; border: 1px solid #dbe3ef; padding: 24px; }
      button, label, input { font: inherit; }
      .tabs { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; padding: 12px 48px 0; background: #f7f8fb; border-bottom: 1px solid #dbe3ef; overflow-x: auto; }
      .tab { border: 1px solid #cbd5e1; border-bottom: 0; background: #eef2f7; color: #334155; padding: 12px 16px; cursor: pointer; white-space: nowrap; }
      .tab:hover { background: #e0e7ef; }
      .tab.active { background: #fff; color: #0f172a; font-weight: 700; }
      .tab-panel { display: none; min-height: calc(100vh - 210px); }
      .tab-panel.active { display: block; }
      .panel-stack { display: grid; gap: 22px; }
      .stats { display: grid; grid-template-columns: repeat(5, minmax(140px, 1fr)); gap: 14px; }
      .stat { background: #eff6ff; border: 1px solid #bfdbfe; padding: 16px; }
      .stat strong { display: block; font-size: 30px; }
      .stat span { color: #475569; }
      a { color: #075985; }
      .table-scroll { border: 1px solid #e5e7eb; max-height: calc(100vh - 310px); overflow: auto; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 10px; text-align: left; vertical-align: top; }
      th { background: #111827; color: white; position: sticky; top: 0; z-index: 1; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .graph-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; }
      .graph-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 14px; }
      .graph-toolbar label { display: inline-flex; align-items: center; gap: 6px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 7px 10px; }
      .graph-shell { border: 1px solid #cbd5e1; background: #f8fafc; overflow: auto; height: calc(100vh - 365px); min-height: 460px; }
      #graphSvg { display: block; min-width: 1120px; }
      .edge { stroke: #94a3b8; stroke-width: 1.4; fill: none; opacity: 0.62; pointer-events: none; }
      .edge.gap, .edge.duplicate { stroke-dasharray: 6 5; }
      .node .hit-target { fill: transparent; cursor: pointer; }
      .node circle { stroke: #fff; stroke-width: 2; cursor: pointer; }
      .node text { font-size: 12px; fill: #172033; pointer-events: none; }
      .node.selected circle { stroke: #111827; stroke-width: 3; }
      .node.dimmed, .edge.dimmed { opacity: 0.12; }
      .node.hidden, .edge.hidden { display: none; }
      .node-card { border: 1px solid #cbd5e1; background: #f8fafc; padding: 14px; min-height: 220px; }
      .node-card dl { display: grid; gap: 8px; margin: 0; }
      .node-card dt { font-weight: 700; color: #334155; }
      .node-card dd { margin: 0; word-break: break-word; }
      .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
      .legend span { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #cbd5e1; padding: 5px 8px; background: #fff; }
      .legend i { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
      .ok { color: #047857; font-weight: 700; }
      .gap { color: #b42318; font-weight: 700; }
      code { background: #f1f5f9; padding: 2px 5px; }
      ul { margin: 0; padding-left: 20px; }
      li { margin: 5px 0; }
      @media (max-width: 900px) {
        header, main { padding-left: 18px; padding-right: 18px; }
        .tabs { padding-left: 18px; padding-right: 18px; }
        .stats, .grid, .graph-layout { grid-template-columns: 1fr; }
        .graph-shell, .table-scroll { max-height: none; height: auto; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Agentic Playwright Graph View</h1>
      <p>Source-aware graph intelligence for possible tests, existing coverage, curated captures, gaps, and duplicate risks.</p>
    </header>
    <nav class="tabs" role="tablist" aria-label="Graph report sections">
      <button class="tab active" type="button" role="tab" aria-selected="true" aria-controls="panel-overview" data-tab="overview">Overview Map</button>
      <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="panel-coverage" data-tab="coverage">Route Coverage</button>
      <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="panel-risks" data-tab="risks">Gaps &amp; Duplicates</button>
      <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="panel-candidates" data-tab="candidates">Candidate Tests</button>
      <button class="tab" type="button" role="tab" aria-selected="false" aria-controls="panel-inputs" data-tab="inputs">Graph Inputs</button>
    </nav>
    <main>
      <section id="panel-overview" class="tab-panel active" role="tabpanel" aria-label="Overview Map">
        <div class="panel-stack">
          <div class="stats">
            ${stat('source routes', coverage.summary.routes)}
            ${stat('covered routes', coverage.summary.coveredRoutes)}
            ${stat('candidate tests', coverage.possibleTests.length)}
            ${stat('coverage gaps', coverage.summary.gaps)}
            ${stat('duplicate risks', duplicates.summary.duplicateCandidates + duplicates.summary.overlapCandidates)}
          </div>

          <div>
            <h2>Architecture And Coverage Map</h2>
            <div class="graph-toolbar" aria-label="Graph filters">
              <label><input type="checkbox" data-family="source" checked /> Source</label>
              <label><input type="checkbox" data-family="test" checked /> Tests</label>
              <label><input type="checkbox" data-family="coverage" checked /> Coverage</label>
              <label><input type="checkbox" data-family="recipe" checked /> Capture Workflows</label>
              <label><input type="checkbox" data-family="capture" checked /> Captures</label>
              <label><input type="checkbox" data-family="gap" checked /> Gaps</label>
              <label><input type="checkbox" data-family="duplicate" checked /> Duplicates</label>
            </div>
            <div class="graph-layout">
              <div>
                <div class="graph-shell">
                  <svg id="graphSvg" role="img" aria-label="Source, test, capture, coverage, and gap graph"></svg>
                </div>
                <div id="legend" class="legend" aria-label="Node type legend"></div>
              </div>
              <aside class="node-card" aria-live="polite">
                <h3 id="nodeTitle">Select a node</h3>
                <dl id="nodeDetails">
                  <dt>Hint</dt>
                  <dd>Click any circle to inspect its type, file, and graph relationships.</dd>
                </dl>
              </aside>
            </div>
          </div>
        </div>
      </section>

      <section id="panel-coverage" class="tab-panel" role="tabpanel" aria-label="Route Coverage">
        <h2>Route Coverage</h2>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Route</th><th>Roles</th><th>Actions</th><th>States</th><th>Test</th><th>Capture</th></tr></thead>
            <tbody>${rows(coverage.coverage, [
              (item) => item.route,
              (item) => item.roles.join(', '),
              (item) => item.actions.join(', '),
              (item) => item.states.join(', '),
              (item) => item.hasTestCoverage ? 'covered' : 'missing',
              (item) => item.hasCapture ? 'captured' : 'missing'
            ])}</tbody>
          </table>
        </div>
      </section>

      <section id="panel-risks" class="tab-panel" role="tabpanel" aria-label="Gaps and Duplicates">
        <div class="grid">
          <div>
            <h2>Top Coverage Gaps</h2>
            <div class="table-scroll">
              <table>
                <thead><tr><th>Type</th><th>Route</th><th>Role/State</th><th>Recommendation</th></tr></thead>
                <tbody>${rows(coverage.gaps.slice(0, 18), [
                  (item) => item.type,
                  (item) => item.route,
                  (item) => item.role ?? item.state ?? '-',
                  (item) => item.recommendation
                ])}</tbody>
              </table>
            </div>
          </div>
          <div>
            <h2>Duplicate And Overlap Risks</h2>
            <div class="table-scroll">
              <table>
                <thead><tr><th>Level</th><th>Key</th><th>Recommendation</th></tr></thead>
                <tbody>${rows([...duplicates.duplicates, ...duplicates.overlaps], [
                  (item) => item.level,
                  (item) => item.key,
                  (item) => item.recommendation
                ]) || '<tr><td colspan="3">No duplicate candidates found.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section id="panel-candidates" class="tab-panel" role="tabpanel" aria-label="Possible Test Cases From Source">
        <h2>Possible Test Cases From Source</h2>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Suggested title</th><th>Route</th><th>Role</th><th>State</th><th>Tag</th></tr></thead>
            <tbody>${rows(coverage.possibleTests, [
              (item) => item.title,
              (item) => item.route,
              (item) => item.role,
              (item) => item.state,
              (item) => item.suggestedTag
            ])}</tbody>
          </table>
        </div>
      </section>

      <section id="panel-inputs" class="tab-panel" role="tabpanel" aria-label="Graph Inputs">
        <h2>Graph Inputs</h2>
        <div class="grid">
          <div>
            <h3>Source</h3>
            ${fileList([source.source])}
            <h3>Specs</h3>
            ${fileList(tests.files.specs)}
          </div>
          <div>
            <h3>Tests</h3>
            ${fileList(tests.files.tests)}
            <h3>Captures</h3>
            ${fileList(tests.files.captures)}
          </div>
        </div>
        <div class="grid">
          <div>
            <h3>Page Objects</h3>
            ${fileList(tests.files.pages)}
          </div>
          <div>
            <h3>Assertion Helpers</h3>
            ${fileList(tests.files.assertions)}
          </div>
        </div>
        <div>
          <h3>Capture Workflows</h3>
          ${fileList(tests.files.captureRecipes ?? [])}
        </div>
      </section>
    </main>
    <script id="graph-data" type="application/json">${visualGraphJson}</script>
    <script>
      const graph = JSON.parse(document.querySelector('#graph-data').textContent);
      const colors = {
        role: '#2563eb',
        app_route: '#059669',
        page_component: '#0f766e',
        user_action: '#7c3aed',
        form_field: '#9333ea',
        page_state: '#ea580c',
        playwright_test_file: '#475569',
        playwright_test: '#0284c7',
        tag: '#db2777',
        capture_recipe: '#a855f7',
        capture_file: '#65a30d',
        flow_spec: '#0891b2',
        page_object: '#4f46e5',
        assertion_helper: '#be123c',
        coverage_gap: '#dc2626',
        duplicate_risk: '#b45309'
      };
      const labels = {
        app_route: 'route',
        page_component: 'component',
        user_action: 'action',
        form_field: 'field',
        page_state: 'state',
        playwright_test_file: 'test file',
        playwright_test: 'test',
        capture_recipe: 'recipe',
        capture_file: 'capture',
        flow_spec: 'spec',
        page_object: 'page object',
        assertion_helper: 'assertion',
        coverage_gap: 'gap',
        duplicate_risk: 'duplicate'
      };

      const enabled = new Set(['source', 'test', 'coverage', 'recipe', 'capture', 'gap', 'duplicate']);
      const svg = document.querySelector('#graphSvg');
      const legend = document.querySelector('#legend');
      const nodeTitle = document.querySelector('#nodeTitle');
      const nodeDetails = document.querySelector('#nodeDetails');

      function layout(nodes) {
        const byType = new Map();
        for (const node of nodes) {
          if (!byType.has(node.type)) byType.set(node.type, []);
          byType.get(node.type).push(node);
        }
        const columns = graph.typeOrder.filter((type) => byType.has(type));
        const columnWidth = 190;
        let maxRows = 1;
        columns.forEach((type, index) => {
          const items = byType.get(type);
          maxRows = Math.max(maxRows, items.length);
          items.forEach((node, row) => {
            node.x = 80 + index * columnWidth;
            node.y = 62 + row * 62;
          });
        });
        return {
          width: Math.max(1120, columns.length * columnWidth + 140),
          height: Math.max(560, maxRows * 62 + 110)
        };
      }

      function visibleNode(node) {
        return enabled.has(node.family) || graph.edges.some((edge) => edge.to === node.id && enabled.has(edge.family));
      }

      function render() {
        const size = layout(graph.nodes);
        svg.setAttribute('viewBox', '0 0 ' + size.width + ' ' + size.height);
        svg.setAttribute('height', size.height);
        svg.innerHTML = '';

        const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
        const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        svg.appendChild(edgesGroup);

        for (const edge of graph.edges) {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) continue;
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const curve = Math.max(40, Math.abs(to.x - from.x) / 2);
          path.setAttribute('d', 'M ' + from.x + ' ' + from.y + ' C ' + (from.x + curve) + ' ' + from.y + ', ' + (to.x - curve) + ' ' + to.y + ', ' + to.x + ' ' + to.y);
          path.setAttribute('class', 'edge ' + edge.family + (enabled.has(edge.family) && visibleNode(from) && visibleNode(to) ? '' : ' hidden'));
          path.dataset.from = edge.from;
          path.dataset.to = edge.to;
          path.dataset.family = edge.family;
          edgesGroup.appendChild(path);
        }

        const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        svg.appendChild(nodesGroup);
        for (const node of graph.nodes) {
          const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          group.setAttribute('class', 'node' + (visibleNode(node) ? '' : ' hidden'));
          group.dataset.id = node.id;
          group.dataset.family = node.family;
          group.setAttribute('transform', 'translate(' + node.x + ' ' + node.y + ')');

          const hitTarget = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          hitTarget.setAttribute('class', 'hit-target');
          hitTarget.setAttribute('x', '-16');
          hitTarget.setAttribute('y', '-18');
          hitTarget.setAttribute('width', '174');
          hitTarget.setAttribute('height', '36');
          group.appendChild(hitTarget);

          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('r', node.type === 'app_route' ? '13' : node.type === 'coverage_gap' ? '11' : '9');
          circle.setAttribute('fill', colors[node.type] ?? '#64748b');
          group.appendChild(circle);

          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', '16');
          text.setAttribute('y', '4');
          text.textContent = shortLabel(node.label);
          group.appendChild(text);

          group.addEventListener('click', () => selectNode(node.id));
          nodesGroup.appendChild(group);
        }
      }

      function shortLabel(label) {
        const value = String(label);
        return value.length > 30 ? value.slice(0, 27) + '...' : value;
      }

      function selectNode(id) {
        const node = graph.nodes.find((item) => item.id === id);
        if (!node) return;
        const related = new Set([id]);
        graph.edges.forEach((edge) => {
          if (edge.from === id) related.add(edge.to);
          if (edge.to === id) related.add(edge.from);
        });
        document.querySelectorAll('.node').forEach((item) => {
          const selected = item.dataset.id === id;
          item.classList.toggle('selected', selected);
          item.classList.toggle('dimmed', !related.has(item.dataset.id));
        });
        document.querySelectorAll('.edge').forEach((item) => {
          item.classList.toggle('dimmed', item.dataset.from !== id && item.dataset.to !== id);
        });
        nodeTitle.textContent = node.label;
        nodeDetails.innerHTML = detailRows(node);
      }

      function detailRows(node) {
        const outbound = graph.edges.filter((edge) => edge.from === node.id).length;
        const inbound = graph.edges.filter((edge) => edge.to === node.id).length;
        const details = [
          ['Type', labels[node.type] ?? node.type],
          ['Family', node.family],
          ['Edges', inbound + ' in, ' + outbound + ' out']
        ];
        if (node.file) details.push(['File', node.file]);
        if (node.details?.route) details.push(['Route', node.details.route]);
        if (node.details?.recommendation) details.push(['Recommendation', node.details.recommendation]);
        if (node.details?.tags?.length) details.push(['Tags', node.details.tags.join(', ')]);
        return details.map(([key, value]) => '<dt>' + escapeHtmlClient(key) + '</dt><dd>' + escapeHtmlClient(value) + '</dd>').join('');
      }

      function escapeHtmlClient(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;');
      }

      function renderLegend() {
        const usedTypes = Array.from(new Set(graph.nodes.map((node) => node.type)));
        legend.innerHTML = usedTypes.map((type) => '<span><i style="background:' + (colors[type] ?? '#64748b') + '"></i>' + escapeHtmlClient(labels[type] ?? type) + '</span>').join('');
      }

      const tabNames = new Set(Array.from(document.querySelectorAll('[data-tab]')).map((tab) => tab.dataset.tab));

      function activateTab(tabName, updateHash = true) {
        if (!tabNames.has(tabName)) return;
        document.querySelectorAll('[data-tab]').forEach((tab) => {
          const active = tab.dataset.tab === tabName;
          tab.classList.toggle('active', active);
          tab.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('.tab-panel').forEach((panel) => {
          panel.classList.toggle('active', panel.id === 'panel-' + tabName);
        });
        if (updateHash && window.location.hash !== '#' + tabName) {
          window.history.replaceState(null, '', '#' + tabName);
        }
      }

      document.querySelectorAll('[data-tab]').forEach((tab) => {
        tab.addEventListener('click', () => activateTab(tab.dataset.tab));
      });

      window.addEventListener('hashchange', () => {
        activateTab(window.location.hash.slice(1) || 'overview', false);
      });

      document.querySelectorAll('[data-family]').forEach((input) => {
        input.addEventListener('change', () => {
          if (input.checked) enabled.add(input.dataset.family);
          else enabled.delete(input.dataset.family);
          render();
        });
      });

      renderLegend();
      render();
      activateTab(window.location.hash.slice(1) || 'overview', false);
    </script>
  </body>
</html>`;

await writeText('graphs/index.html', html);
console.log(`Wrote graphs/index.html with ${visualGraph.nodes.length} visual nodes and ${visualGraph.edges.length} visual edges.`);

if (process.argv.includes('--serve')) {
  const port = Number(process.env.GRAPH_PORT ?? 8765);
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    const filePath = path.join(root, url.pathname === '/' ? 'graphs/index.html' : url.pathname);
    try {
      const data = await fs.readFile(filePath);
      response.writeHead(200, { 'content-type': filePath.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
      response.end(data);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Graph view available at http://127.0.0.1:${port}`));
}
